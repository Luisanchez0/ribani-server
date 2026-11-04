import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthAttemptsService } from '../auth/auth-attempts.service.js';
import { FamiliaresService } from './familiares.service.js';

const callerId = '11111111-1111-4111-8111-111111111111';
const adultoId = '22222222-2222-4222-8222-222222222222';
const otroId = '33333333-3333-4333-8333-333333333333';

const fila = (familiarId: string, extra: object = {}) => ({
  id: `vinculo-${familiarId}`,
  familiar_id: familiarId,
  parentesco: null,
  es_contacto_principal: false,
  puede_ver_ubicacion: true,
  puede_gestionar_medicamentos: true,
  estado: 'ACTIVA',
  created_at: new Date('2026-01-01T00:00:00Z'),
  usuarios_adulto_familiares_familiar_idTousuarios: {
    nombre: 'Nombre',
    apellido: 'Apellido',
    email: `${familiarId}@example.com`,
  },
  ...extra,
});

function montar(vinculoPropio: unknown, filas: unknown[] = []) {
  const db = {
    adulto_familiares: {
      findUnique: vi.fn().mockResolvedValue(vinculoPropio),
      findMany: vi.fn().mockResolvedValue(filas),
    },
  };
  const service = new FamiliaresService(
    db as never,
    {} as never,
    new AuthAttemptsService(),
  );
  return { db, service };
}

describe('FamiliaresService.familiaresDeAdulto', () => {
  it('lista los familiares ACTIVA/PENDIENTE y marca la fila propia', async () => {
    const { db, service } = montar({ estado: 'ACTIVA' }, [
      fila(callerId, { es_contacto_principal: true }),
      fila(otroId, { estado: 'PENDIENTE', parentesco: 'Sobrino' }),
    ]);

    const resultado = await service.familiaresDeAdulto(
      callerId,
      'FAMILIAR_ENCARGADO',
      adultoId,
    );

    expect(db.adulto_familiares.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          adulto_id: adultoId,
          estado: { in: ['ACTIVA', 'PENDIENTE'] },
          usuarios_adulto_familiares_familiar_idTousuarios: { activo: true },
        },
      }),
    );
    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toMatchObject({
      familiar_id: callerId,
      es_tu_vinculo: true,
      es_contacto_principal: true,
    });
    expect(resultado[1]).toMatchObject({
      familiar_id: otroId,
      es_tu_vinculo: false,
      estado: 'PENDIENTE',
      parentesco: 'Sobrino',
      email: `${otroId}@example.com`,
    });
  });

  it('no expone el teléfono ni otros datos del usuario', async () => {
    const { db, service } = montar({ estado: 'ACTIVA' }, [fila(otroId)]);

    const [resultado] = await service.familiaresDeAdulto(
      callerId,
      'FAMILIAR_ENCARGADO',
      adultoId,
    );

    const select = db.adulto_familiares.findMany.mock.calls[0][0].select;
    expect(select.usuarios_adulto_familiares_familiar_idTousuarios.select).toEqual({
      nombre: true,
      apellido: true,
      email: true,
    });
    expect(resultado).not.toHaveProperty('telefono');
    expect(resultado).not.toHaveProperty(
      'usuarios_adulto_familiares_familiar_idTousuarios',
    );
  });

  it('exige vínculo ACTIVA al familiar encargado', async () => {
    for (const vinculoPropio of [null, { estado: 'PENDIENTE' }, { estado: 'REVOCADA' }]) {
      const { db, service } = montar(vinculoPropio);
      await expect(
        service.familiaresDeAdulto(callerId, 'FAMILIAR_ENCARGADO', adultoId),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.adulto_familiares.findMany).not.toHaveBeenCalled();
    }
  });

  it('rechaza al adulto mayor (usa /familiares/mis-familiares)', async () => {
    const { db, service } = montar(null);
    await expect(
      service.familiaresDeAdulto(adultoId, 'ADULTO_MAYOR', adultoId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.adulto_familiares.findUnique).not.toHaveBeenCalled();
  });

  it('el administrador consulta cualquier adulto sin vínculo propio', async () => {
    const { db, service } = montar(null, [fila(otroId)]);

    const resultado = await service.familiaresDeAdulto(
      callerId,
      'ADMINISTRADOR',
      adultoId,
    );

    expect(db.adulto_familiares.findUnique).not.toHaveBeenCalled();
    expect(resultado).toHaveLength(1);
  });
});
