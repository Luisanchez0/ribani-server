import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { MedicamentosService } from '../medicamentos/medicamentos.service.js';
import { ContactosService } from '../contactos/contactos.service.js';
import { TomasService } from '../tomas/tomas.service.js';
import { ZonasSegurasService } from '../zonas-seguras/zonas-seguras.service.js';

function preparar(codigo = 'ADMINISTRADOR') {
  const prisma = {
    usuarios: {
      findUnique: vi.fn().mockResolvedValue({ roles: { codigo } }),
      findMany: vi.fn().mockResolvedValue([{ id: 'adulto' }]),
    },
    adulto_familiares: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    medicamentos: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: 'medicamento', adulto_id: 'adulto' }),
    },
    contactos_emergencia: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: 'contacto', adulto_id: 'adulto' }),
    },
    zonas_seguras: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'zona',
        adulto_id: 'adulto',
        latitud_centro: 1,
        longitud_centro: 1,
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    tomas_medicamento: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const medicamentos = new MedicamentosService(prisma as never);
  return {
    prisma,
    medicamentos,
    contactos: new ContactosService(prisma as never),
    zonas: new ZonasSegurasService(prisma as never),
    tomas: new TomasService(prisma as never, medicamentos),
  };
}

describe('Ámbito de objetos del administrador después del guard de permisos', () => {
  it('permite consultar individualmente medicamentos y contactos del listado administrativo', async () => {
    const { medicamentos, contactos } = preparar();
    await expect(
      medicamentos.findOne('admin', 'medicamento'),
    ).resolves.toMatchObject({ adulto_id: 'adulto' });
    await expect(contactos.findOne('admin', 'contacto')).resolves.toMatchObject(
      { adulto_id: 'adulto' },
    );
  });

  it('permite filtrar tomas por un adulto supervisado y conserva su ámbito en el listado general', async () => {
    const { tomas, prisma } = preparar();
    await expect(
      tomas.findAll('admin', { adultoId: 'adulto' }),
    ).resolves.toEqual([]);
    await tomas.findAll('admin', {});
    expect(
      prisma.tomas_medicamento.findMany.mock.calls[1][0].where.adulto_id.in,
    ).toEqual(['adulto']);
  });

  it('mantiene coherencia entre listado y detalle de zonas seguras', async () => {
    const { zonas, prisma } = preparar();
    await expect(zonas.findOne('admin', 'zona')).resolves.toMatchObject({
      adulto_id: 'adulto',
    });
    await zonas.findAll('admin', { soloActivas: true });
    expect(
      prisma.zonas_seguras.findMany.mock.calls[0][0].where.adulto_id.in,
    ).toEqual(['adulto']);
  });

  it.each(['ADULTO_MAYOR', 'FAMILIAR_ENCARGADO'])(
    'no amplía el ámbito de %s sin vínculo',
    async (rol) => {
      const { medicamentos, contactos, zonas, tomas } = preparar(rol);
      for (const operation of [
        medicamentos.findOne('ajeno', 'medicamento'),
        contactos.findOne('ajeno', 'contacto'),
        zonas.findOne('ajeno', 'zona'),
        tomas.findAll('ajeno', { adultoId: 'adulto' }),
      ]) {
        await expect(operation).rejects.toBeInstanceOf(ForbiddenException);
      }
    },
  );
});
