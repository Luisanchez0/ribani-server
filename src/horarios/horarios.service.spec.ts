import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { HorariosService } from './horarios.service.js';

const USUARIO_ID = 'usuario-1';
const ADULTO_ID = 'adulto-1';
const MEDICAMENTO_ID = 'med-1';

function createPrismaMock() {
  return {
    medicamentos: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    horarios_medicamento: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    usuarios: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    adultos_familiares: {},
    adulto_familiares: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function createMedicamentosServiceMock() {
  return {
    findOne: vi.fn(),
    obtenerAdultosAccesibles: vi.fn().mockResolvedValue([ADULTO_ID]),
  };
}

describe('HorariosService.findAllDelUsuario', () => {
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let medicamentosMock: ReturnType<typeof createMedicamentosServiceMock>;
  let service: HorariosService;

  beforeEach(() => {
    prismaMock = createPrismaMock();
    medicamentosMock = createMedicamentosServiceMock();
    service = new HorariosService(
      prismaMock as never,
      medicamentosMock as never,
    );
  });

  it('devuelve horarios planos con adulto_id, medicamento y hora HH:MM', async () => {
    prismaMock.medicamentos.findMany.mockResolvedValue([
      {
        id: MEDICAMENTO_ID,
        adulto_id: ADULTO_ID,
        nombre: 'Enalapril',
        horarios_medicamento: [
          {
            id: 'h-1',
            medicamento_id: MEDICAMENTO_ID,
            hora_local: new Date('1970-01-01T08:30:00Z'),
            dias_semana: [1, 2],
            intervalo_minutos: 0,
            ventana_minutos: 60,
            activo: true,
            created_at: new Date('2026-01-01T00:00:00Z'),
          },
        ],
      },
    ]);

    const resultado = await service.findAllDelUsuario(USUARIO_ID, {
      soloActivos: true,
    });

    expect(resultado).toEqual([
      expect.objectContaining({
        id: 'h-1',
        medicamento_id: MEDICAMENTO_ID,
        medicamento_nombre: 'Enalapril',
        adulto_id: ADULTO_ID,
        hora: '08:30',
        activo: true,
      }),
    ]);

    const where = prismaMock.medicamentos.findMany.mock.calls[0][0].where;
    expect(where.adulto_id).toEqual({ in: [ADULTO_ID] });
    expect(where.horarios_medicamento).toEqual({ some: { activo: true } });
  });

  it('filtra por adultoId y lanza 403 si el usuario no tiene acceso', async () => {
    medicamentosMock.obtenerAdultosAccesibles.mockResolvedValue([ADULTO_ID]);

    const ajeno = 'adulto-ajeno';
    await expect(
      service.findAllDelUsuario(USUARIO_ID, { soloActivos: false, adultoId: ajeno }),
    ).rejects.toMatchObject({
      constructor: ForbiddenException,
    });
    // No consulta la base si no hay autorización.
    expect(prismaMock.medicamentos.findMany).not.toHaveBeenCalled();
  });

  it('rechaza 400 si el medicamentoId no pertenece al adultoId indicado', async () => {
    medicamentosMock.findOne.mockResolvedValue({
      id: MEDICAMENTO_ID,
      adulto_id: ADULTO_ID,
      activo: true,
    });

    await expect(
      service.findAllDelUsuario(USUARIO_ID, {
        soloActivos: true,
        medicamentoId: MEDICAMENTO_ID,
        adultoId: 'adulto-otro',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(medicamentosMock.findOne).toHaveBeenCalledWith(
      USUARIO_ID,
      MEDICAMENTO_ID,
    );
    expect(prismaMock.medicamentos.findMany).not.toHaveBeenCalled();
  });

  it('usa la autorización de medicamentos y consulta por ese medicamento', async () => {
    medicamentosMock.findOne.mockResolvedValue({
      id: MEDICAMENTO_ID,
      adulto_id: ADULTO_ID,
      activo: true,
    });
    prismaMock.medicamentos.findMany.mockResolvedValue([]);

    await service.findAllDelUsuario(USUARIO_ID, {
      soloActivos: true,
      medicamentoId: MEDICAMENTO_ID,
    });

    expect(medicamentosMock.findOne).toHaveBeenCalledWith(
      USUARIO_ID,
      MEDICAMENTO_ID,
    );

    const where = prismaMock.medicamentos.findMany.mock.calls[0][0].where;
    expect(where.id).toBe(MEDICAMENTO_ID);
    // Con medicamentoId explícito no se consultan los adultos accesibles.
    expect(medicamentosMock.obtenerAdultosAccesibles).not.toHaveBeenCalled();
  });
});
