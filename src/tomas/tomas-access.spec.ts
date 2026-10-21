import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TomasService } from './tomas.service.js';
import { HorariosService } from '../horarios/horarios.service.js';
import { MedicamentosService } from '../medicamentos/medicamentos.service.js';

function preparar(estado = 'ACTIVA', permiso = true) {
  const coincide = (where: {
    estado?: string;
    puede_gestionar_medicamentos?: boolean;
  }) =>
    (where.estado === undefined || where.estado === estado) &&
    (where.puede_gestionar_medicamentos === undefined ||
      where.puede_gestionar_medicamentos === permiso);
  const prisma = {
    adulto_familiares: {
      findFirst: vi.fn(async ({ where }) =>
        coincide(where) ? { id: 'vinculo' } : null,
      ),
      findMany: vi.fn(async ({ where }) =>
        coincide(where) ? [{ adulto_id: 'adulto' }] : [],
      ),
    },
    usuarios: { findUnique: vi.fn() },
    medicamentos: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: 'medicamento', adulto_id: 'adulto' }),
    },
    horarios_medicamento: { findMany: vi.fn().mockResolvedValue([]) },
    tomas_medicamento: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const medicamentos = new MedicamentosService(prisma as never);
  return {
    prisma,
    tomas: new TomasService(prisma as never, medicamentos),
    horarios: new HorariosService(prisma as never, medicamentos),
  };
}

describe('Autorización de tomas y horarios', () => {
  it.each([
    ['PENDIENTE', true],
    ['REVOCADA', true],
    ['ACTIVA', false],
  ] as const)(
    'no expone tomas ni horarios con vínculo %s y permiso %s',
    async (estado, permiso) => {
      const { prisma, tomas, horarios } = preparar(estado, permiso);
      await expect(
        tomas.findAll('familiar', { adultoId: 'adulto' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        horarios.findAll('familiar', 'medicamento', true),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.tomas_medicamento.findMany).not.toHaveBeenCalled();
      expect(prisma.horarios_medicamento.findMany).not.toHaveBeenCalled();
      await tomas.findAll('familiar', {});
      expect(
        prisma.tomas_medicamento.findMany.mock.calls[0][0].where.adulto_id.in,
      ).toEqual(['familiar']);
    },
  );

  it('conserva el acceso propio del adulto y el del familiar autorizado', async () => {
    const { tomas, horarios } = preparar();
    await expect(
      tomas.findAll('adulto', { adultoId: 'adulto' }),
    ).resolves.toEqual([]);
    await expect(
      horarios.findAll('adulto', 'medicamento', true),
    ).resolves.toEqual([]);
    await expect(
      tomas.findAll('familiar', { adultoId: 'adulto' }),
    ).resolves.toEqual([]);
    await expect(
      horarios.findAll('familiar', 'medicamento', true),
    ).resolves.toEqual([]);
  });
});
