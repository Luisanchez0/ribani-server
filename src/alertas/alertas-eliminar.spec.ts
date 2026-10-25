import { describe, expect, it, vi } from 'vitest';

import { AlertasService } from './alertas.service.js';

const ALERTA = {
  id: 'alerta',
  adulto_id: 'adulto',
  estado: 'ABIERTA',
  atendida_por: null,
};

function preparar({
  estado = 'ABIERTA',
  vinculo = { id: 'v' } as { id: string } | null,
} = {}) {
  const prisma = {
    alertas: {
      findUnique: vi.fn().mockResolvedValue({ ...ALERTA, estado }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...ALERTA, estado }),
      update: vi
        .fn()
        .mockResolvedValue({ ...ALERTA, estado: 'CANCELADA' }),
    },
    adulto_familiares: { findFirst: vi.fn().mockResolvedValue(vinculo) },
    alerta_eventos: { create: vi.fn().mockResolvedValue({ id: 1n }) },
    notificaciones_whatsapp: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (operaciones: Promise<unknown>[]) =>
      Promise.all(operaciones),
    ),
  };
  const whatsapp = { encolarAlerta: vi.fn() };

  return {
    prisma,
    service: new AlertasService(prisma as never, whatsapp as never),
  };
}

describe('Eliminar una alerta del historial', () => {
  it('pasa a CANCELADA y deja la fila para auditoría', async () => {
    const { service, prisma } = preparar();

    await service.eliminar('familiar', false, 'alerta');

    expect('delete' in prisma.alertas).toBe(false);
    expect(prisma.alertas.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'alerta' },
        data: expect.objectContaining({ estado: 'CANCELADA' }),
      }),
    );
    expect(prisma.notificaciones_whatsapp.updateMany).toHaveBeenCalled();
  });

  it('registra el evento en la bitácora de la alerta', async () => {
    const { service, prisma } = preparar();

    await service.eliminar('familiar', false, 'alerta');

    expect(prisma.alerta_eventos.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ evento: 'CANCELADA' }),
    });
  });

  it('rechaza a quien no tiene vínculo ACTIVA con el adulto', async () => {
    const { service, prisma } = preparar({ vinculo: null });

    await expect(service.eliminar('ajeno', false, 'alerta')).rejects.toThrow();
    expect(prisma.alertas.update).not.toHaveBeenCalled();
  });

  it('permite al administrador sin consultar vínculos', async () => {
    const { service, prisma } = preparar({ vinculo: null });

    await expect(
      service.eliminar('admin', true, 'alerta'),
    ).resolves.toBeTruthy();
    expect(prisma.adulto_familiares.findFirst).not.toHaveBeenCalled();
  });

  it('es idempotente si la alerta ya estaba cancelada', async () => {
    const { service, prisma } = preparar({ estado: 'CANCELADA' });

    await service.eliminar('familiar', false, 'alerta');

    expect(prisma.alertas.update).not.toHaveBeenCalled();
    expect(prisma.alerta_eventos.create).not.toHaveBeenCalled();
  });
});
