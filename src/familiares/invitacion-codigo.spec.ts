import 'reflect-metadata';
import { BadRequestException, HttpException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthAttemptsService } from '../auth/auth-attempts.service.js';
import { CompletarInvitacionFamiliarDto } from './dto/completar-invitacion-familiar.dto.js';
import { FamiliaresService } from './familiares.service.js';

process.env.JWT_ACCESS_SECRET ??=
  'test-only-invitation-secret-at-least-thirty-two-bytes';

const email = 'invitada@example.com';
const adulto = {
  id: '11111111-1111-4111-8111-111111111111',
  email,
  nombre: 'Ana',
  apellido: 'Prueba',
  telefono: null,
  activo: false,
  roles: { codigo: 'ADULTO_MAYOR' },
};
const hashInvitacion = (codigo: string) =>
  createHmac('sha256', process.env.JWT_ACCESS_SECRET!)
    .update(`invitacion:${adulto.id}:${codigo}`)
    .digest('hex');

function montar(usuario: unknown = adulto, pendiente: unknown = { id: 'vinculo' }) {
  const db = {
    usuarios: {
      findUnique: vi.fn().mockResolvedValue(usuario),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    adulto_familiares: {
      findFirst: vi.fn().mockResolvedValue(pendiente),
      update: vi.fn().mockResolvedValue({}),
    },
    password_reset_tokens: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === 'function' ? arg(db) : Promise.all(arg as unknown[]),
    ),
  };
  const mail = {
    enviarCodigoInvitacion: vi.fn().mockResolvedValue(undefined),
    enviarBienvenida: vi.fn().mockResolvedValue(undefined),
  };
  const service = new FamiliaresService(
    db as never,
    mail as never,
    new AuthAttemptsService(),
  );
  return { db, mail, service };
}

const tokenVigente = (codigo: string) => ({
  id: 'token',
  usuario_id: adulto.id,
  token_hash: hashInvitacion(codigo),
  usado_en: null,
  expira_en: new Date(Date.now() + 60_000),
});
const dto = (extra = {}) =>
  ({ email, password: 'Contrasena-Nueva-1', codigo: '123456', ...extra }) as never;

describe('Completar invitación exige un código enviado al correo', () => {
  it('el DTO rechaza completar sin código de 6 dígitos', async () => {
    for (const codigo of [undefined, '12345', '1234567', 'abcdef']) {
      const errores = await validate(
        plainToInstance(CompletarInvitacionFamiliarDto, {
          email,
          password: 'Contrasena-Nueva-1',
          codigo,
        }),
      );
      expect(errores.map((e) => e.property)).toContain('codigo');
    }
  });

  it('solo con correo y contraseña un tercero no activa la cuenta', async () => {
    const { db, service } = montar();

    await expect(service.completarInvitacion(dto())).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(db.usuarios.updateMany).not.toHaveBeenCalled();
    expect(db.adulto_familiares.update).not.toHaveBeenCalled();
  });

  it('activa la cuenta y el vínculo con el código correcto y lo consume', async () => {
    const { db, service } = montar();
    db.password_reset_tokens.findUnique.mockResolvedValue(tokenVigente('123456'));

    await service.completarInvitacion(dto());

    expect(db.password_reset_tokens.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token_hash: hashInvitacion('123456') } }),
    );
    expect(db.password_reset_tokens.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'token', usado_en: null }),
      }),
    );
    expect(db.usuarios.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: adulto.id, activo: false },
        data: expect.objectContaining({ activo: true }),
      }),
    );
    expect(db.adulto_familiares.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'ACTIVA' } }),
    );
  });

  it.each([
    ['ya usado', { usado_en: new Date() }],
    ['vencido', { expira_en: new Date(Date.now() - 1000) }],
    ['de otra cuenta', { usuario_id: '22222222-2222-4222-8222-222222222222' }],
  ])('rechaza un código %s', async (_n, cambio) => {
    const { db, service } = montar();
    db.password_reset_tokens.findUnique.mockResolvedValue({
      ...tokenVigente('123456'),
      ...cambio,
    });

    await expect(service.completarInvitacion(dto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.usuarios.updateMany).not.toHaveBeenCalled();
  });

  it('dos usos simultáneos del código: solo uno activa la cuenta', async () => {
    const { db, service } = montar();
    db.password_reset_tokens.findUnique.mockResolvedValue(tokenVigente('123456'));
    db.password_reset_tokens.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.completarInvitacion(dto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.usuarios.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['inexistente', null],
    ['ya activa', { ...adulto, activo: true }],
    ['de otro rol', { ...adulto, roles: { codigo: 'FAMILIAR_ENCARGADO' } }],
  ])('responde igual ante una cuenta %s para no revelar su estado', async (_n, usuario) => {
    const { service } = montar(usuario);

    await expect(service.completarInvitacion(dto())).rejects.toThrow(
      'Código inválido o expirado.',
    );
  });

  it('limita los intentos por correo', async () => {
    const { service } = montar();
    for (let i = 0; i < 5; i++) {
      await expect(service.completarInvitacion(dto())).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    await expect(service.completarInvitacion(dto())).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(service.completarInvitacion(dto())).rejects.not.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('Solicitar el código de invitación', () => {
  beforeEach(() => vi.clearAllMocks());

  it('envía el código a la cuenta invitada y guarda solo su hash', async () => {
    const { db, mail, service } = montar();

    await service.solicitarCodigoInvitacion({ email: ' INVITADA@example.com ' });

    expect(mail.enviarCodigoInvitacion).toHaveBeenCalledOnce();
    const [destino, , codigo] = mail.enviarCodigoInvitacion.mock.calls[0]!;
    expect(destino).toBe(email);
    expect(codigo).toMatch(/^\d{6}$/);
    const guardado = db.password_reset_tokens.create.mock.calls[0]![0].data;
    expect(guardado.token_hash).toBe(hashInvitacion(codigo));
    expect(JSON.stringify(guardado)).not.toContain(codigo);
    expect(db.password_reset_tokens.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { usuario_id: adulto.id, usado_en: null } }),
    );
  });

  it('el hash del código no coincide con el de recuperación de contraseña', () => {
    const recuperacion = createHmac('sha256', process.env.JWT_ACCESS_SECRET!)
      .update(`${adulto.id}:123456`)
      .digest('hex');
    expect(hashInvitacion('123456')).not.toBe(recuperacion);
  });

  it.each([
    ['inexistente', null, { id: 'v' }],
    ['ya activa', { ...adulto, activo: true }, { id: 'v' }],
    ['sin invitación pendiente', adulto, null],
  ])('no envía nada a una cuenta %s y responde lo mismo', async (_n, usuario, pendiente) => {
    const { mail, service } = montar(usuario, pendiente);
    const elegible = montar();

    const r = await service.solicitarCodigoInvitacion({ email });
    const esperado = await elegible.service.solicitarCodigoInvitacion({ email });

    expect(mail.enviarCodigoInvitacion).not.toHaveBeenCalled();
    expect(r).toEqual(esperado);
  });

  it('un fallo del correo no cambia la respuesta', async () => {
    const { mail, service } = montar();
    mail.enviarCodigoInvitacion.mockRejectedValue(new Error('caído'));

    await expect(
      service.solicitarCodigoInvitacion({ email }),
    ).resolves.toHaveProperty('mensaje');
  });

  it('limita las solicitudes por correo', async () => {
    const { mail, service } = montar();
    for (let i = 0; i < 3; i++) await service.solicitarCodigoInvitacion({ email });
    await expect(service.solicitarCodigoInvitacion({ email })).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(mail.enviarCodigoInvitacion).toHaveBeenCalledTimes(3);
  });
});
