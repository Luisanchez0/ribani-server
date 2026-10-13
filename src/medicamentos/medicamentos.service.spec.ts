import { describe, expect, it, vi, beforeEach } from 'vitest';

import { MedicamentosService } from './medicamentos.service.js';

function createPrismaMock() {
  return {
    medicamentos: {
      findUnique: vi.fn(),
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
      estado: 'PENDIENTE',
    });
    expect(updateMany.where.programada_para).toEqual({ gt: expect.any(Date) });
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
