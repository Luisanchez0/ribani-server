import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ContactosService } from './contactos.service.js';

describe('Autorización de contactos', () => {
  it.each(['PENDIENTE', 'REVOCADA'])('no expone contactos de un vínculo %s', async (estado) => {
    const prisma = {
      usuarios: { findUnique: vi.fn() },
      adulto_familiares: {
        findFirst: vi.fn(async ({ where }) => !where.estado || where.estado === estado ? { id: 'vinculo' } : null),
        findMany: vi.fn(async ({ where }) => !where.estado || where.estado === estado ? [{ adulto_id: 'adulto' }] : []),
      },
      contactos_emergencia: {
        findUnique: vi.fn().mockResolvedValue({ id: 'contacto', adulto_id: 'adulto' }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new ContactosService(prisma as never);
    await expect(service.findOne('familiar', 'contacto')).rejects.toBeInstanceOf(ForbiddenException);
    await service.findAll('familiar', true);
    expect(prisma.contactos_emergencia.findMany.mock.calls[0][0].where.adulto_id.in)
      .toEqual(['familiar']);
    await expect(service.findOne('adulto', 'contacto')).resolves.toBeDefined();
  });
});
