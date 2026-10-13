import { describe, expect, it, vi, beforeEach } from 'vitest';

import { TomasGeneradorService } from './tomas-generador.service.js';

function hora(hh: number, mm: number): Date {
  return new Date(Date.UTC(1970, 0, 1, hh, mm));
}

function createPrismaMock() {
  return {
    medicamentos: {
      findMany: vi.fn(),
    },
    tomas_medicamento: {
      createMany: vi.fn().mockImplementation(async ({ data }) => ({
        count: Array.isArray(data) ? data.length : 0,
      })),
    },
  };
}

const ZONA_CDMX = 'America/Mexico_City';

describe('TomasGeneradorService', () => {
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let service: TomasGeneradorService;

  beforeEach(() => {
    prismaMock = createPrismaMock();
    service = new TomasGeneradorService(prismaMock as never);
  });

  it('sin medicamentos activos no genera nada', async () => {
    prismaMock.medicamentos.findMany.mockResolvedValue([]);

    const total = await service.generarTomasDelDia();

    expect(total).toBe(0);
    expect(prismaMock.tomas_medicamento.createMany).not.toHaveBeenCalled();
  });

  it('expande un horario diario (sin intervalo) en una sola toma/día', async () => {
    // Viernes (para el horizonte hoy/mañana del generador los días se
    // resuelven en runtime; este fixture usa dias_semana null = todos).
    prismaMock.medicamentos.findMany.mockResolvedValue([
      {
        id: 'med-1',
        adulto_id: 'adulto-1',
        zona_horaria: ZONA_CDMX,
        horarios_medicamento: [
          {
            id: 'horario-1',
            hora_local: hora(8, 0),
            dias_semana: null,
            intervalo_minutos: null,
          },
        ],
      },
    ]);

    const total = await service.generarTomasDelDia();

    expect(total).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(2);

    const llamadas = prismaMock.tomas_medicamento.createMany.mock.calls;
    expect(llamadas.length).toBeGreaterThan(0);
    const filas = llamadas[0][0].data;
    for (const fila of filas) {
      expect(fila.medicamento_id).toBe('med-1');
      expect(fila.horario_id).toBe('horario-1');
      expect(fila.adulto_id).toBe('adulto-1');
      expect(fila.programada_para).toBeInstanceOf(Date);
    }
    expect(llamadas[0][0].skipDuplicates).toBe(true);
  });

  it('expande un ciclo de 5 horas en repeticiones hasta fin del día', async () => {
    prismaMock.medicamentos.findMany.mockResolvedValue([
      {
        id: 'med-1',
        adulto_id: 'adulto-1',
        zona_horaria: ZONA_CDMX,
        horarios_medicamento: [
          {
            id: 'horario-1',
            hora_local: hora(8, 0),
            dias_semana: null,
            intervalo_minutos: 300, // 5 h → 08, 13, 18, 23
          },
        ],
      },
    ]);

    await service.generarTomasDelDia();

    const filas = prismaMock.tomas_medicamento.createMany.mock.calls[0][0]
      .data as Array<{ programada_para: Date }>;

    // Por día: horas 08, 13, 18, 23 (4 tomas) → hoy (parcial) + mañana (4).
    const mañana = filas.filter((fila) => {
      const h = Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: ZONA_CDMX,
          hour: '2-digit',
          hourCycle: 'h23',
        }).format(fila.programada_para),
      );
      return [8, 13, 18, 23].includes(h);
    });
    expect(mañana.length).toBeGreaterThanOrEqual(4);
  });

  it('omite el día cuando dias_semana no lo incluye', async () => {
    prismaMock.medicamentos.findMany.mockResolvedValue([
      {
        id: 'med-1',
        adulto_id: 'adulto-1',
        zona_horaria: ZONA_CDMX,
        horarios_medicamento: [
          {
            id: 'horario-1',
            hora_local: hora(8, 0),
            dias_semana: [99], // día imposible: nunca aplica
            intervalo_minutos: null,
          },
        ],
      },
    ]);

    const total = await service.generarTomasDelDia();

    expect(total).toBe(0);
  });

  it('las repeticiones del ciclo no fallan aunque la primera sea en día filtro', async () => {
    prismaMock.medicamentos.findMany.mockResolvedValue([
      {
        id: 'med-1',
        adulto_id: 'adulto-1',
        zona_horaria: ZONA_CDMX,
        horarios_medicamento: [
          {
            id: 'horario-1',
            hora_local: hora(10, 0),
            dias_semana: [99],
            intervalo_minutos: 60,
          },
        ],
      },
    ]);

    const total = await service.generarTomasDelDia();
    expect(total).toBe(0);
  });

  it('es idempotente a nivel de llamada: las filas duplicadas van con skipDuplicates', async () => {
    prismaMock.medicamentos.findMany.mockResolvedValue([
      {
        id: 'med-1',
        adulto_id: 'adulto-1',
        zona_horaria: ZONA_CDMX,
        horarios_medicamento: [
          {
            id: 'horario-1',
            hora_local: hora(8, 0),
            dias_semana: null,
            intervalo_minutos: null,
          },
        ],
      },
    ]);

    await service.generarTomasDelDia();
    await service.generarTomasDelDia();

    const llamadas = prismaMock.tomas_medicamento.createMany.mock.calls;
    expect(llamadas.length).toBe(2);
    for (const llamada of llamadas) {
      expect(llamada[0].skipDuplicates).toBe(true);
    }
  });
});
