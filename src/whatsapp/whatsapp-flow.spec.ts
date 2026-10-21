import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MetaError, MetaWhatsappService } from './meta-whatsapp.service.js';
import { WhatsappService } from './whatsapp.service.js';
import { WhatsappWorkerService } from './whatsapp-worker.service.js';
import { WhatsappWebhookService } from './whatsapp-webhook.service.js';
import { WhatsappRecordatoriosService } from './whatsapp-recordatorios.service.js';

afterEach(() => vi.unstubAllEnvs());
const prismaCast = (p: unknown) => p as PrismaService;

describe('Cola WhatsApp', () => {
  function setup(overrides = {}) {
    const notificacion = {
      id: 'n',
      destinatario_id: 'd',
      estado: 'PROCESANDO',
      tipo: 'PRUEBA',
      intentos: 1,
      plantilla: 'prueba',
      idioma: 'es_MX',
      parametros: [],
      alerta_id: null,
      toma_id: null,
      whatsapp_destinatarios: {
        id: 'd',
        activo: true,
        consentimiento: 'ACEPTADO',
        telefono_e164: '+525512345678',
      },
      ...overrides,
    };
    const prisma = {
      $queryRaw: vi.fn(),
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
      whatsapp_destinatarios: {
        findUnique: vi
          .fn()
          .mockResolvedValue(notificacion.whatsapp_destinatarios),
      },
      notificaciones_whatsapp: {
        findUnique: vi.fn().mockResolvedValue(notificacion),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      configuracion_adulto: { findUnique: vi.fn().mockResolvedValue(null) },
      usuarios: { findUnique: vi.fn().mockResolvedValue({ activo: true }) },
    };
    const whatsapp = {
      destinatarioVigente: vi.fn().mockResolvedValue(true),
      destinatariosAlerta: vi.fn().mockResolvedValue([]),
    };
    const meta = {
      enviar: vi.fn().mockResolvedValue('wamid.test'),
      disponible: () => true,
    };
    vi.stubEnv('WHATSAPP_TEST_TEMPLATE', 'prueba');
    return {
      prisma,
      whatsapp,
      meta,
      worker: new WhatsappWorkerService(
        prismaCast(prisma),
        whatsapp as unknown as WhatsappService,
        meta as unknown as MetaWhatsappService,
      ),
    };
  }
  it('cancela antes del transporte al revocar consentimiento', async () => {
    const { worker, prisma, meta } = setup({
      whatsapp_destinatarios: {
        id: 'd',
        activo: true,
        consentimiento: 'REVOCADO',
      },
    });
    await worker.procesarUna('n');
    expect(meta.enviar).not.toHaveBeenCalled();
    expect(prisma.notificaciones_whatsapp.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: 'CANCELADA' }),
      }),
    );
  });
  it('relee el consentimiento tras obtener el bloqueo, aunque el claim era anterior a revocar', async () => {
    const { worker, prisma, meta } = setup();
    prisma.whatsapp_destinatarios.findUnique.mockResolvedValue({
      id: 'd',
      activo: true,
      consentimiento: 'REVOCADO',
      telefono_e164: '+525512345678',
    });
    await worker.procesarUna('n');
    expect(meta.enviar).not.toHaveBeenCalled();
  });
  it('cancela si el familiar perdió el vínculo con el adulto', async () => {
    const { worker, meta } = setup({
      alerta_id: 'a',
      alertas: { adulto_id: 'adulto' },
    });
    await worker.procesarUna('n');
    expect(meta.enviar).not.toHaveBeenCalled();
  });
  it('cancela un recordatorio de una toma ya registrada', async () => {
    vi.stubEnv('WHATSAPP_REMINDERS_ENABLED', 'true');
    const { worker, meta } = setup({
      toma_id: 't',
      tomas_medicamento: {
        adulto_id: 'adulto',
        estado: 'TOMADA',
        medicamentos: { activo: true },
        programada_para: new Date(),
      },
      whatsapp_destinatarios: {
        id: 'd',
        usuario_id: 'adulto',
        activo: true,
        consentimiento: 'ACEPTADO',
      },
    });
    await worker.procesarUna('n');
    expect(meta.enviar).not.toHaveBeenCalled();
  });
  it('relee una toma confirmada mientras esperaba el bloqueo del destinatario', async () => {
    vi.stubEnv('WHATSAPP_REMINDERS_ENABLED', 'true');
    const { worker, prisma, meta } = setup({
      toma_id: 't',
      tomas_medicamento: {
        adulto_id: 'adulto',
        estado: 'PENDIENTE',
        medicamentos: { activo: true },
        programada_para: new Date(),
      },
      whatsapp_destinatarios: {
        id: 'd',
        usuario_id: 'adulto',
        activo: true,
        consentimiento: 'ACEPTADO',
      },
    });
    const candidata = await prisma.notificaciones_whatsapp.findUnique();
    prisma.notificaciones_whatsapp.findUnique
      .mockResolvedValueOnce(candidata)
      .mockResolvedValueOnce({
        ...candidata,
        tomas_medicamento: {
          adulto_id: 'adulto',
          estado: 'TOMADA',
          medicamentos: { activo: true },
          programada_para: new Date(),
        },
      });
    await worker.procesarUna('n');
    expect(meta.enviar).not.toHaveBeenCalled();
  });
  it('conserva un wamid aceptado como ENVIADA, no ENTREGADA', async () => {
    const { worker, prisma } = setup();
    await worker.procesarUna('n');
    expect(prisma.notificaciones_whatsapp.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: 'ENVIADA',
          proveedor_message_id: 'wamid.test',
        }),
      }),
    );
  });
  it('un timeout queda fallido sin reintento automático', async () => {
    const { worker, prisma, meta } = setup();
    meta.enviar.mockRejectedValue(new MetaError('RESULTADO_DESCONOCIDO'));
    await worker.procesarUna('n');
    expect(prisma.notificaciones_whatsapp.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: 'FALLIDA',
          siguiente_intento_en: null,
        }),
      }),
    );
  });
  it('no vuelve a enviar si falla guardar el wamid después de aceptación', async () => {
    const { worker, prisma, meta } = setup();
    prisma.notificaciones_whatsapp.update.mockRejectedValue(
      new Error('DB unavailable'),
    );
    await expect(worker.procesarUna('n')).rejects.toThrow('DB unavailable');
    expect(meta.enviar).toHaveBeenCalledTimes(1);
    expect(prisma.notificaciones_whatsapp.updateMany).not.toHaveBeenCalled();
  });
  it('no excede tres intentos ni siquiera ante 429', async () => {
    const { worker, prisma, meta } = setup({ intentos: 3 });
    meta.enviar.mockRejectedValue(new MetaError('130429', true));
    await worker.procesarUna('n');
    expect(prisma.notificaciones_whatsapp.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ siguiente_intento_en: null }),
      }),
    );
  });
});

describe('Webhook durable', () => {
  function setup(estado = 'ENVIADA') {
    vi.stubEnv('META_APP_SECRET', 'secret');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123');
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'n', estado }]),
      whatsapp_estados_proveedor: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificaciones_whatsapp: { update: vi.fn() },
    };
    const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
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
                    timestamp: String(Math.floor(Date.now() / 1000)),
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const raw = Buffer.from(JSON.stringify(body));
    const firma =
      'sha256=' + createHmac('sha256', 'secret').update(raw).digest('hex');
    return {
      tx,
      body,
      raw,
      firma,
      service: new WhatsappWebhookService(prismaCast(prisma)),
    };
  }
  it('rechaza una firma inválida antes de acceder a la BD', async () => {
    const { service, tx, raw, body } = setup();
    await expect(service.recibir(raw, 'bad', body)).rejects.toThrow();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
  it('deduplica eventos y no degrada una notificación leída', async () => {
    const { service, tx, raw, body, firma } = setup('LEIDA');
    await service.recibir(raw, firma, body);
    await service.recibir(raw, firma, body);
    const calls = tx.whatsapp_estados_proveedor.createMany.mock.calls;
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0][0]).toMatchObject({ skipDuplicates: true });
    expect(tx.notificaciones_whatsapp.update).not.toHaveBeenCalled();
  });
  it('pide reentrega si el callback se adelantó a persistir wamid', async () => {
    const { service, tx, raw, body, firma } = setup();
    tx.$queryRaw.mockResolvedValue([]);
    await expect(service.recibir(raw, firma, body)).rejects.toThrow(
      'persistido',
    );
  });
});

describe('Recordatorios', () => {
  function setup({ count = 0, estado = 'PENDIENTE', habilitado = true } = {}) {
    const ahora = new Date();
    const tx = {
      $queryRaw: vi.fn(),
      tomas_medicamento: {
        findUnique: vi.fn().mockResolvedValue({
          id: 't',
          adulto_id: 'a',
          estado,
          programada_para: new Date(ahora.getTime() - 60_000),
          medicamentos: { activo: true },
        }),
      },
      configuracion_adulto: {
        findUnique: vi.fn().mockResolvedValue({
          notificaciones_habilitadas: habilitado,
          recordatorio_medicamentos: true,
          minutos_repeticion: 10,
          max_repeticiones: 0,
        }),
      },
      whatsapp_destinatarios: {
        findMany: vi.fn().mockResolvedValue([{ id: 'd' }]),
      },
      notificaciones_whatsapp: {
        findMany: vi.fn().mockResolvedValue(
          Array.from({ length: count }, () => ({
            created_at: new Date(ahora.getTime() - 600_000),
          })),
        ),
        create: vi.fn(),
      },
    };
    return {
      tx,
      ahora,
      service: new WhatsappRecordatoriosService(
        prismaCast({ $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) }),
      ),
    };
  }
  it('con max_repeticiones=0 admite solo la notificación inicial', async () => {
    const s = setup();
    await s.service.encolarToma('t', 'recordatorio', s.ahora);
    expect(s.tx.notificaciones_whatsapp.create).toHaveBeenCalledOnce();
    const repetido = setup({ count: 1 });
    await repetido.service.encolarToma('t', 'recordatorio', repetido.ahora);
    expect(repetido.tx.notificaciones_whatsapp.create).not.toHaveBeenCalled();
  });
  it.each([{ estado: 'TOMADA' }, { habilitado: false }])(
    'omite tomas resueltas o notificaciones deshabilitadas (%j)',
    async (opciones) => {
      const s = setup(opciones);
      await s.service.encolarToma('t', 'recordatorio', s.ahora);
      expect(s.tx.notificaciones_whatsapp.create).not.toHaveBeenCalled();
    },
  );
  it('no acumula recordatorios mientras espera enviar el anterior', async () => {
    const s = setup();
    s.tx.configuracion_adulto.findUnique.mockResolvedValue({
      notificaciones_habilitadas: true,
      recordatorio_medicamentos: true,
      minutos_repeticion: 10,
      max_repeticiones: 3,
    });
    s.tx.notificaciones_whatsapp.findMany.mockResolvedValue([
      {
        created_at: new Date(s.ahora.getTime() - 20 * 60_000),
        estado: 'EN_COLA',
        enviada_en: null,
        siguiente_intento_en: null,
      },
    ]);
    await s.service.encolarToma('t', 'recordatorio', s.ahora);
    expect(s.tx.notificaciones_whatsapp.create).not.toHaveBeenCalled();
  });
});
