import { describe, expect, it, vi } from 'vitest';

import { TomasService } from './tomas.service.js';

function preparar(estado = 'TOMADA') {
  const toma = {
    id: 't',
    medicamento_id: 'm',
    adulto_id: 'a',
    horario_id: 'h',
    estado,
    programada_para: new Date('2026-10-18T14:00:00Z'),
    updated_at: new Date(),
  };
  const prisma = {
    tomas_medicamento: {
      findUnique: vi.fn().mockResolvedValue(toma),
      update: vi.fn().mockResolvedValue({ id: 't' }),
    },
    notificaciones_whatsapp: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (operaciones: Promise<unknown>[]) =>
      Promise.all(operaciones),
    ),
  };
  const medicamentos = {
    findOne: vi.fn().mockResolvedValue({ id: 'm', activo: true, dosis: 1 }),
  };

  return {
    prisma,
    service: new TomasService(prisma as never, medicamentos as never),
  };
}

describe('Eliminar una toma del historial', () => {
  it('da de baja lógica en lugar de borrar la fila', async () => {
    const { service, prisma } = preparar('TOMADA');

    await expect(service.remove('a', 't')).resolves.toEqual({
      id: 't',
      eliminado: true,
    });

    expect('delete' in prisma.tomas_medicamento).toBe(false);
    expect(prisma.tomas_medicamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't' },
        data: expect.objectContaining({ estado: 'CANCELADA' }),
      }),
    );
  });

  it('cancela los avisos de WhatsApp que seguían en cola', async () => {
    const { service, prisma } = preparar('PENDIENTE');

    await service.remove('a', 't');

    expect(prisma.notificaciones_whatsapp.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ toma_id: 't' }),
        data: expect.objectContaining({ estado: 'CANCELADA' }),
      }),
    );
  });

  it('permite eliminar tomas ya registradas (antes daba 409)', async () => {
    const { service } = preparar('OMITIDA');
    await expect(service.remove('a', 't')).resolves.toEqual({
      id: 't',
      eliminado: true,
    });
  });

  it('es idempotente si la toma ya estaba cancelada', async () => {
    const { service, prisma } = preparar('CANCELADA');

    await service.remove('a', 't');

    expect(prisma.tomas_medicamento.update).not.toHaveBeenCalled();
    expect(prisma.notificaciones_whatsapp.updateMany).not.toHaveBeenCalled();
  });
});
