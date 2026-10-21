import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  firmaValida,
  estadoSiguiente,
  extraerEstados,
} from './whatsapp.protocol.js';
import { MetaWhatsappService, MetaError } from './meta-whatsapp.service.js';
import { WhatsappService } from './whatsapp.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Protocolo Meta', () => {
  it('verifica los bytes originales y rechaza firmas ausentes, truncadas o distintas', () => {
    const raw = Buffer.from('{ "entry": [] }');
    const signature =
      'sha256=' + createHmac('sha256', 'secret').update(raw).digest('hex');
    expect(firmaValida(raw, signature, 'secret')).toBe(true);
    expect(firmaValida(Buffer.from('{"entry":[]}'), signature, 'secret')).toBe(
      false,
    );
    expect(firmaValida(raw, undefined, 'secret')).toBe(false);
    expect(firmaValida(raw, 'sha256=aa', 'secret')).toBe(false);
    expect(firmaValida(raw, signature, '')).toBe(false);
  });
  it('no retrocede estados aunque Meta entregue eventos desordenados', () => {
    expect(estadoSiguiente('LEIDA', 'ENVIADA')).toBe('LEIDA');
    expect(estadoSiguiente('ENTREGADA', 'FALLIDA')).toBe('ENTREGADA');
    expect(estadoSiguiente('FALLIDA', 'ENTREGADA')).toBe('ENTREGADA');
    expect(estadoSiguiente('ENVIADA', 'FALLIDA')).toBe('FALLIDA');
  });
  it('filtra por número emisor y rechaza estados o fechas inválidos', () => {
    const body = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: '123' },
                statuses: [
                  {
                    id: 'wamid.1',
                    status: 'delivered',
                    timestamp: '1700000000',
                  },
                  { id: 'wamid.1', status: 'read', timestamp: 'nonsense' },
                  { id: 'wamid.1', status: 'unknown', timestamp: '1700000000' },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(extraerEstados(body, '123')).toHaveLength(1);
    expect(extraerEstados(body, '456')).toEqual([]);
    expect(extraerEstados(null, '123')).toEqual([]);
  });
});

describe('Meta Cloud API', () => {
  function configurar() {
    for (const [key, value] of Object.entries({
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_ACCESS_TOKEN: 'private',
      WHATSAPP_PHONE_NUMBER_ID: '123',
      WHATSAPP_API_VERSION: 'v25.0',
    }))
      vi.stubEnv(key, value);
  }
  it('no llama a Meta cuando está deshabilitado', async () => {
    vi.stubEnv('WHATSAPP_ENABLED', 'false');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      new MetaWhatsappService().enviar('+521234567890', 'prueba', 'es_MX', []),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('envía una plantilla, sin exponer token en URL y conserva wamid', async () => {
    configurar();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: 'wamid.123' }] })),
      );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await new MetaWhatsappService().enviar(
        '+521234567890',
        'prueba',
        'es_MX',
        ['RIBANI'],
      ),
    ).toBe('wamid.123');
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v25.0/123/messages');
    expect(JSON.parse(request.body as string)).toMatchObject({
      to: '521234567890',
      type: 'template',
      template: {
        components: [
          { type: 'body', parameters: [{ type: 'text', text: 'RIBANI' }] },
        ],
      },
    });
  });
  it('solo permite reintento automático ante un rechazo explícito 429', async () => {
    configurar();
    for (const status of [429, 500, 401]) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('{"error":{"code":130429,"message":"secret"}}', {
            status,
          }),
        ),
      );
      try {
        await new MetaWhatsappService().enviar(
          '+521234567890',
          'prueba',
          'es_MX',
          [],
        );
        throw new Error('Expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(MetaError);
        expect((error as MetaError).reintentable).toBe(status === 429);
        expect((error as Error).message).not.toContain('secret');
      }
    }
  });
});

describe('Consentimiento y propiedad', () => {
  it('el permiso de medicamentos no autoriza deshabilitar las notificaciones generales', async () => {
    const prisma = {
      usuarios: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            activo: true,
            roles: { codigo: 'ADULTO_MAYOR' },
          }),
      },
      adulto_familiares: {
        findFirst: vi.fn().mockResolvedValue({ id: 'vinculo' }),
      },
      configuracion_adulto: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
    };
    const service = new WhatsappService(
      prisma as unknown as PrismaService,
      new MetaWhatsappService(),
    );
    await expect(
      service.guardarPreferencias('familiar', false, 'adulto', {
        notificaciones_habilitadas: false,
      }),
    ).rejects.toThrow('medicamentos');
    expect(prisma.configuracion_adulto.upsert).not.toHaveBeenCalled();
  });
  it('un familiar no puede aceptar el consentimiento de otro usuario', async () => {
    const prisma = {
      whatsapp_destinatarios: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'd',
          usuario_id: 'otro',
          contacto_emergencia_id: null,
        }),
        update: vi.fn(),
      },
    };
    const service = new WhatsappService(
      prisma as unknown as PrismaService,
      new MetaWhatsappService(),
    );
    await expect(
      service.consentimiento('familiar', false, 'd', { aceptado: true }),
    ).rejects.toThrow();
    expect(prisma.whatsapp_destinatarios.update).not.toHaveBeenCalled();
  });
  it('no registra un teléfono distinto al perfil ni crea un destinatario', async () => {
    const prisma = {
      usuarios: {
        findUnique: vi.fn().mockResolvedValue({
          telefono: '+521234567890',
          nombre: 'Ana',
          activo: true,
        }),
      },
      whatsapp_destinatarios: { create: vi.fn() },
    };
    const service = new WhatsappService(
      prisma as unknown as PrismaService,
      new MetaWhatsappService(),
    );
    await expect(
      service.registrar('u', false, { telefono_e164: '+529999999999' }),
    ).rejects.toThrow();
    expect(prisma.whatsapp_destinatarios.create).not.toHaveBeenCalled();
  });
});
