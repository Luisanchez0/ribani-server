import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';

import { MedicamentosService } from './medicamentos.service.js';

function createPrismaMock() {
  return {
    medicamentos: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    tomas_medicamento: {
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    adulto_familiares: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    usuarios: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn().mockImplementation(async (promesas) => {
      return Promise.all(promesas);
    }),
  };
}

const FAMILIAR_ID = 'familiar-1';
const MEDICAMENTO_ID = 'med-1';

describe('MedicamentosService.remove', () => {
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let service: MedicamentosService;

  beforeEach(() => {
    prismaMock = createPrismaMock();
    service = new MedicamentosService(prismaMock as never);
  });

  function arrangeMedicamento() {
    prismaMock.medicamentos.findUnique.mockResolvedValue({
      id: MEDICAMENTO_ID,
      adulto_id: 'adulto-1',
      nombre: 'Enalapril',
      activo: true,
    });

    prismaMock.adulto_familiares.findFirst.mockResolvedValue({
      adulto_id: 'adulto-1',
      familiar_id: FAMILIAR_ID,
    });
    prismaMock.medicamentos.update.mockResolvedValue({
      id: MEDICAMENTO_ID,
      activo: false,
    });
  }

  it('soft-delete + cancela tomas PENDIENTE futuras en una transacción', async () => {
    arrangeMedicamento();

    await service.remove(FAMILIAR_ID, MEDICAMENTO_ID);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    // 1) El medicamento queda inactivo (borrar físico NO ocurre).
    const updateMed = prismaMock.medicamentos.update.mock.calls[0][0];
    expect(updateMed.where.id).toBe(MEDICAMENTO_ID);
    expect(updateMed.data.activo).toBe(false);

    // 2) tomas_medicamento: solo PENDIENTE a futuro → OMITIDA.
    const updateMany =
      prismaMock.tomas_medicamento.updateMany.mock.calls[0][0];
    expect(updateMany.where).toMatchObject({
      medicamento_id: MEDICAMENTO_ID,
      estado: { in: ['PENDIENTE', 'POSPUESTA'] },
    });
    expect(updateMany.where.OR).toEqual([{ programada_para: { gt: expect.any(Date) } }, { estado: 'POSPUESTA' }]);
    expect(updateMany.data.estado).toBe('OMITIDA');
  });

  it('fuerza la autorización: findOne rechaza si el usuario no tiene vínculo', async () => {
    prismaMock.medicamentos.findUnique.mockResolvedValue({
      id: MEDICAMENTO_ID,
      adulto_id: 'adulto-1',
      activo: true,
    });
    prismaMock.adulto_familiares.findFirst.mockResolvedValue(null); // sin vínculo

    await expect(
      service.remove(FAMILIAR_ID, MEDICAMENTO_ID),
    ).rejects.toThrow();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('MedicamentosService autorización', () => {
  function preparar(estado = 'ACTIVA', puedeGestionar = true) {
    const prisma = createPrismaMock();
    prisma.medicamentos.findUnique.mockResolvedValue({
      id: MEDICAMENTO_ID, adulto_id: 'adulto-1', activo: true,
    });
    // Simula el filtro de PostgreSQL: no basta con tener una fila de vínculo.
    prisma.adulto_familiares.findFirst.mockImplementation(async ({ where }) =>
      (where.estado === undefined || where.estado === estado) &&
      (where.puede_gestionar_medicamentos === undefined ||
        where.puede_gestionar_medicamentos === puedeGestionar)
        ? { id: 'vinculo-1' } : null,
    );
    return { prisma, service: new MedicamentosService(prisma as never) };
  }

  it.each(['PENDIENTE', 'REVOCADA'])('rechaza un vínculo %s', async (estado) => {
    const { service } = preparar(estado);
    await expect(service.findOne(FAMILIAR_ID, MEDICAMENTO_ID))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza al familiar sin permiso para gestionar medicamentos', async () => {
    const { service } = preparar('ACTIVA', false);
    await expect(service.findOne(FAMILIAR_ID, MEDICAMENTO_ID))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite al familiar con vínculo activo y permiso', async () => {
    const { service } = preparar();
    await expect(service.findOne(FAMILIAR_ID, MEDICAMENTO_ID))
      .resolves.toMatchObject({ id: MEDICAMENTO_ID });
  });

  it('permite al adulto consultar sus propios medicamentos sin vínculo', async () => {
    const { prisma, service } = preparar('REVOCADA', false);
    await expect(service.findOne('adulto-1', MEDICAMENTO_ID)).resolves.toBeDefined();
    expect(prisma.adulto_familiares.findFirst).not.toHaveBeenCalled();
  });

  it('el listado general excluye vínculos pendientes, revocados y sin permiso', async () => {
    const { prisma, service } = preparar();
    const vinculos = [
      { adulto_id: 'activo', estado: 'ACTIVA', puede_gestionar_medicamentos: true },
      { adulto_id: 'pendiente', estado: 'PENDIENTE', puede_gestionar_medicamentos: true },
      { adulto_id: 'revocado', estado: 'REVOCADA', puede_gestionar_medicamentos: true },
      { adulto_id: 'sin-permiso', estado: 'ACTIVA', puede_gestionar_medicamentos: false },
    ];
    prisma.adulto_familiares.findMany.mockImplementation(async ({ where }) =>
      vinculos.filter((v) =>
        (where.estado === undefined || where.estado === v.estado) &&
        (where.puede_gestionar_medicamentos === undefined ||
          where.puede_gestionar_medicamentos === v.puede_gestionar_medicamentos)),
    );
    await service.findAll(FAMILIAR_ID, { soloActivos: true });
    expect(prisma.medicamentos.findMany.mock.calls[0][0].where.adulto_id.in)
      .toEqual(['activo', FAMILIAR_ID]);
  });

  it('mantiene la supervisión general del administrador', async () => {
    const { prisma, service } = preparar();
    prisma.usuarios.findUnique.mockResolvedValue({ roles: { codigo: 'ADMINISTRADOR' } });
    prisma.usuarios.findMany.mockResolvedValue([{ id: 'adulto-1' }]);
    await service.findAll('admin-1', { soloActivos: true });
    expect(prisma.medicamentos.findMany.mock.calls[0][0].where.adulto_id.in)
      .toEqual(['adulto-1']);
  });
});
