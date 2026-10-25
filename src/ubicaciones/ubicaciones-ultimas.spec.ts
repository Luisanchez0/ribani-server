import { describe, expect, it, vi } from 'vitest';

import { UbicacionesService } from './ubicaciones.service.js';

function preparar(rol: string, filas: unknown[] = []) {
  const prisma = {
    usuarios: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ roles: { codigo: rol } }),
    },
    $queryRaw: vi.fn().mockResolvedValue(filas),
  };

  return {
    prisma,
    service: new UbicacionesService(prisma as never, {} as never),
  };
}

describe('Última ubicación de todos los adultos (admin)', () => {
  it('rechaza a cualquier rol que no sea administrador', async () => {
    const { service, prisma } = preparar('FAMILIAR_ENCARGADO');

    await expect(service.ultimas('familiar')).rejects.toThrow(
      'Solo un administrador',
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('devuelve una fila por adulto con las coordenadas numéricas', async () => {
    const { service } = preparar('ADMINISTRADOR', [
      {
        adulto_id: 'adulto-1',
        nombre: 'Ana',
        apellido: 'Pérez',
        latitud: '19.432600',
        longitud: -99.133200,
        precision_metros: '12',
        fuente: 'GPS',
        registrada_en: new Date('2026-10-25T12:00:00Z'),
      },
      {
        adulto_id: 'adulto-2',
        nombre: 'Luis',
        apellido: 'Gómez',
        latitud: 19.4,
        longitud: -99.1,
        precision_metros: null,
        fuente: 'RED',
        registrada_en: new Date('2026-10-25T11:00:00Z'),
      },
    ]);

    const resultado = await service.ultimas('admin');

    expect(resultado).toEqual([
      expect.objectContaining({
        adulto_id: 'adulto-1',
        latitud: 19.4326,
        longitud: -99.1332,
        precision_metros: 12,
      }),
      expect.objectContaining({
        adulto_id: 'adulto-2',
        latitud: 19.4,
        precision_metros: null,
      }),
    ]);
  });

  it('devuelve una lista vacía si ningún adulto ha reportado', async () => {
    const { service } = preparar('ADMINISTRADOR', []);
    await expect(service.ultimas('admin')).resolves.toEqual([]);
  });
});
