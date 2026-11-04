import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { AuthAttemptsService } from '../auth/auth-attempts.service.js';
import { InvitarCofamiliarDto } from './dto/invitar-cofamiliar.dto.js';
import { FamiliaresService } from './familiares.service.js';

const callerId = '11111111-1111-4111-8111-111111111111';
const adultoId = '22222222-2222-4222-8222-222222222222';
const invitadoId = '33333333-3333-4333-8333-333333333333';

const vinculoPropioActivo = {
  estado: 'ACTIVA',
  puede_ver_ubicacion: true,
  puede_gestionar_medicamentos: true,
};
const invitadoFamiliar = {
  id: invitadoId,
  activo: true,
  roles: { codigo: 'FAMILIAR_ENCARGADO' },
};

const dto = (extra: Partial<InvitarCofamiliarDto> = {}): InvitarCofamiliarDto => ({
  adulto_id: adultoId,
  familiar_email: '  Hermano@Example.com ',
  ...extra,
});

/** adulto_familiares.findUnique: 1ª llamada = vínculo del caller, 2ª = del invitado. */
function montar({
  vinculoPropio = vinculoPropioActivo as unknown,
  invitado = invitadoFamiliar as unknown,
  vinculoInvitado = null as unknown,
} = {}) {
  const db = {
    adulto_familiares: {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce(vinculoPropio)
        .mockResolvedValueOnce(vinculoInvitado),
      create: vi.fn(async ({ data }: { data: object }) => ({ id: 'nuevo', ...data })),
      update: vi.fn(async ({ data }: { data: object }) => ({ id: 'existente', ...data })),
    },
    usuarios: {
      findUnique: vi.fn().mockResolvedValue(invitado),
    },
  };
  const service = new FamiliaresService(
    db as never,
    {} as never,
    new AuthAttemptsService(),
  );
  return { db, service };
}

describe('FamiliaresService.invitarCofamiliar', () => {
  it('crea un vínculo PENDIENTE no principal heredando los permisos del caller', async () => {
    const { db, service } = montar();

    const resultado = await service.invitarCofamiliar(
      callerId,
      'FAMILIAR_ENCARGADO',
      dto({ parentesco: ' Hijo ' }),
    );

    expect(db.usuarios.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'hermano@example.com' } }),
    );
    expect(db.adulto_familiares.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          estado: 'PENDIENTE',
          parentesco: 'Hijo',
          puede_ver_ubicacion: true,
          puede_gestionar_medicamentos: true,
          es_contacto_principal: false,
          adulto_id: adultoId,
          familiar_id: invitadoId,
        },
      }),
    );
    expect(resultado.mensaje).toContain('adulto mayor debe aceptarla');
  });

  it('solo permite el rol FAMILIAR_ENCARGADO', async () => {
    for (const rol of ['ADMINISTRADOR', 'ADULTO_MAYOR']) {
      const { db, service } = montar();
      await expect(service.invitarCofamiliar(callerId, rol, dto())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(db.adulto_familiares.findUnique).not.toHaveBeenCalled();
    }
  });

  it('exige un vínculo ACTIVA del caller con el adulto', async () => {
    for (const vinculoPropio of [null, { ...vinculoPropioActivo, estado: 'PENDIENTE' }, { ...vinculoPropioActivo, estado: 'REVOCADA' }]) {
      const { db, service } = montar({ vinculoPropio });
      await expect(
        service.invitarCofamiliar(callerId, 'FAMILIAR_ENCARGADO', dto()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.usuarios.findUnique).not.toHaveBeenCalled();
    }
  });

  it('no deja conceder permisos que el caller no tiene', async () => {
    const { db, service } = montar({
      vinculoPropio: { ...vinculoPropioActivo, puede_ver_ubicacion: false },
    });

    await expect(
      service.invitarCofamiliar(
        callerId,
        'FAMILIAR_ENCARGADO',
        dto({ puede_ver_ubicacion: true }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.adulto_familiares.create).not.toHaveBeenCalled();
  });

  it('sin permiso explícito hereda el permiso restringido del caller', async () => {
    const { db, service } = montar({
      vinculoPropio: { ...vinculoPropioActivo, puede_gestionar_medicamentos: false },
    });

    await service.invitarCofamiliar(callerId, 'FAMILIAR_ENCARGADO', dto());

    expect(db.adulto_familiares.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ puede_gestionar_medicamentos: false }),
      }),
    );
  });

  it('responde lo mismo si el correo no existe, está inactivo o no es familiar', async () => {
    const casos = [
      null,
      { ...invitadoFamiliar, activo: false },
      { ...invitadoFamiliar, roles: { codigo: 'ADULTO_MAYOR' } },
      { ...invitadoFamiliar, roles: { codigo: 'ADMINISTRADOR' } },
    ];
    const mensajes = new Set<string>();

    for (const invitado of casos) {
      const { db, service } = montar({ invitado });
      const error = await service
        .invitarCofamiliar(callerId, 'FAMILIAR_ENCARGADO', dto())
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      mensajes.add((error as NotFoundException).message);
      expect(db.adulto_familiares.create).not.toHaveBeenCalled();
    }

    expect(mensajes.size).toBe(1);
  });

  it('rechaza invitarse a sí mismo', async () => {
    const { service } = montar({ invitado: { ...invitadoFamiliar, id: callerId } });
    await expect(
      service.invitarCofamiliar(callerId, 'FAMILIAR_ENCARGADO', dto()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza si el invitado ya tiene vínculo ACTIVA con el adulto', async () => {
    const { db, service } = montar({ vinculoInvitado: { id: 'v', estado: 'ACTIVA' } });
    await expect(
      service.invitarCofamiliar(callerId, 'FAMILIAR_ENCARGADO', dto()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.adulto_familiares.update).not.toHaveBeenCalled();
  });

  it('reabre como PENDIENTE un vínculo REVOCADA sin hacerlo principal', async () => {
    const { db, service } = montar({ vinculoInvitado: { id: 'v', estado: 'REVOCADA' } });

    await service.invitarCofamiliar(callerId, 'FAMILIAR_ENCARGADO', dto());

    expect(db.adulto_familiares.create).not.toHaveBeenCalled();
    expect(db.adulto_familiares.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v' },
        data: expect.objectContaining({
          estado: 'PENDIENTE',
          es_contacto_principal: false,
        }),
      }),
    );
  });

  it('limita a 10 invitaciones por hora por cuenta', async () => {
    const attempts = new AuthAttemptsService();
    const db = {
      adulto_familiares: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      usuarios: { findUnique: vi.fn() },
    };
    const service = new FamiliaresService(db as never, {} as never, attempts);

    for (let i = 0; i < 10; i++) {
      await expect(
        service.invitarCofamiliar(callerId, 'FAMILIAR_ENCARGADO', dto()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    const error = await service
      .invitarCofamiliar(callerId, 'FAMILIAR_ENCARGADO', dto())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
  });
});

describe('InvitarCofamiliarDto', () => {
  it('exige adulto_id UUID y un correo válido', async () => {
    const errores = await validate(
      plainToInstance(InvitarCofamiliarDto, {
        adulto_id: 'no-es-uuid',
        familiar_email: 'no-es-correo',
      }),
    );
    expect(errores.map((e) => e.property).sort()).toEqual([
      'adulto_id',
      'familiar_email',
    ]);
  });
});
