import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EvolutionWhatsappService } from './evolution-whatsapp.service.js';
import { EnvioError } from './whatsapp-transporte.js';
import {
  claveValida,
  extraerEstadosEvolution,
} from './whatsapp-evolution.protocol.js';
import { WhatsappWebhookService } from './whatsapp-webhook.service.js';

afterEach(() => vi.unstubAllEnvs());

function configurar(extra: Record<string, string> = {}) {
  for (const [clave, valor] of Object.entries({
    WHATSAPP_DRIVER: 'evolution',
    WHATSAPP_ENABLED: 'true',
    WHATSAPP_EVOLUTION_URL: 'http://localhost:8080/',
    WHATSAPP_EVOLUTION_APIKEY: 'clave-secreta',
    WHATSAPP_EVOLUTION_INSTANCE: 'ribani',
    ...extra,
  }))
    vi.stubEnv(clave, valor);
}

describe('Evolution API — transporte', () => {
  it('no queda disponible sin URL, clave o instancia', () => {
    configurar({ WHATSAPP_EVOLUTION_URL: '' });
    expect(new EvolutionWhatsappService().disponible()).toBe(false);
    configurar({ WHATSAPP_ENABLED: 'false' });
    expect(new EvolutionWhatsappService().disponible()).toBe(false);
    configurar();
    expect(new EvolutionWhatsappService().disponible()).toBe(true);
  });

  it('no llama a la red cuando está deshabilitado', async () => {
    vi.stubEnv('WHATSAPP_ENABLED', 'false');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      new EvolutionWhatsappService().enviar('+525512345678', 'prueba', 'es_MX', []),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envía texto libre con la clave en el header y sin plantilla', async () => {
    configurar();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ key: { id: '3EB0XYZ' } })),
      );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await new EvolutionWhatsappService().enviar(
        '+525512345678',
        'ribani_alerta',
        'es_MX',
        ['Ana', 'SOS', 'Caída', '2026-10-25T10:00:00.000Z'],
        'ALERTA',
      ),
    ).toBe('3EB0XYZ');
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/message/sendText/ribani');
    expect((request.headers as Record<string, string>).apikey).toBe(
      'clave-secreta',
    );
    const body = JSON.parse(request.body as string) as {
      number: string;
      text: string;
      template?: unknown;
    };
    expect(body.number).toBe('525512345678');
    expect(body.text).toContain('Ana');
    expect(body.text).toContain('Caída');
    expect(body.template).toBeUndefined();
  });

  it('solo permite reintento automático ante un rechazo 429', async () => {
    configurar();
    for (const [status, reintentable] of [
      [429, true],
      [500, false],
      [401, false],
    ] as [number, boolean][]) {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response('{"message":"secreto"}', { status }),
          ),
      );
      try {
        await new EvolutionWhatsappService().enviar(
          '+525512345678',
          'prueba',
          'es_MX',
          [],
          'PRUEBA',
        );
        throw new Error('Expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(EnvioError);
        expect((error as EnvioError).codigo).toBe(`HTTP_${status}`);
        expect((error as EnvioError).reintentable).toBe(reintentable);
        expect((error as Error).message).not.toContain('secreto');
      }
    }
  });
});

describe('Evolution API — webhook', () => {
  it('valida la clave del header con tiempo constante', () => {
    expect(claveValida('abc', 'abc')).toBe(true);
    expect(claveValida('abc', 'abd')).toBe(false);
    expect(claveValida(undefined, 'abc')).toBe(false);
    expect(claveValida('abc', '')).toBe(false);
  });

  it('traduce estados de mensajes de la instancia configurada', () => {
    const evento = (status: string, extra = {}) => ({
      event: 'messages.update',
      instance: 'ribani',
      data: {
        keyId: '3EB0AAA',
        status,
        messageTimestamp: Math.floor(Date.now() / 1000),
        ...extra,
      },
    });
    expect(extraerEstadosEvolution(evento('DELIVERY_ACK'), 'ribani')).toEqual([
      expect.objectContaining({ messageId: '3EB0AAA', estado: 'ENTREGADA' }),
    ]);
    expect(extraerEstadosEvolution(evento('READ'), 'ribani')[0].estado).toBe(
      'LEIDA',
    );
    expect(
      extraerEstadosEvolution(evento('ERROR'), 'ribani')[0],
    ).toMatchObject({ estado: 'FALLIDA', codigo: 'EVOLUTION_ERROR' });
    expect(extraerEstadosEvolution(evento('PENDING'), 'ribani')).toEqual([]);
    expect(
      extraerEstadosEvolution(
        { ...evento('READ'), data: { keyId: '3EB0AAA', status: 3 } },
        'ribani',
      )[0].estado,
    ).toBe('LEIDA');
    expect(extraerEstadosEvolution(evento('READ'), 'otra')).toEqual([]);
    expect(
      extraerEstadosEvolution(
        { event: 'messages.upsert', instance: 'ribani', data: {} },
        'ribani',
      ),
    ).toEqual([]);
    expect(
      extraerEstadosEvolution(
        { event: 'SEND_MESSAGE', instance: 'ribani', data: { key: { id: 'X' } } },
        'ribani',
      ),
    ).toEqual([expect.objectContaining({ messageId: 'X', estado: 'ENVIADA' })]);
  });

  it('rechaza callbacks sin la clave de la instancia', async () => {
    configurar();
    const prisma = { $queryRaw: vi.fn(), $transaction: vi.fn() };
    const service = new WhatsappWebhookService(
      prisma as unknown as PrismaService,
    );
    await expect(
      service.recibirEvolution('otra-clave', { event: 'messages.update' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('actualiza solo las notificaciones enviadas por Evolution', async () => {
    configurar();
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'n', estado: 'ENVIADA' }]),
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
      whatsapp_estados_proveedor: { createMany: vi.fn() },
      notificaciones_whatsapp: { update: vi.fn() },
    };
    const service = new WhatsappWebhookService(
      prisma as unknown as PrismaService,
    );
    await service.recibirEvolution('clave-secreta', {
      event: 'messages.update',
      instance: 'ribani',
      data: {
        keyId: '3EB0AAA',
        status: 'READ',
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    });
    expect(prisma.$queryRaw.mock.calls[0][1]).toBe('EVOLUTION_API');
    expect(prisma.$queryRaw.mock.calls[0][2]).toBe('3EB0AAA');
    expect(prisma.notificaciones_whatsapp.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: 'LEIDA' }),
      }),
    );
  });

  it('pide reentrega si el callback llega antes de guardar el identificador', async () => {
    configurar();
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    };
    const service = new WhatsappWebhookService(
      prisma as unknown as PrismaService,
    );
    await expect(
      service.recibirEvolution('clave-secreta', {
        event: 'messages.update',
        instance: 'ribani',
        data: {
          keyId: '3EB0AAA',
          status: 'DELIVERY_ACK',
          messageTimestamp: Math.floor(Date.now() / 1000),
        },
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
