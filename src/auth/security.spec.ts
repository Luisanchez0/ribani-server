import { UnauthorizedException } from '@nestjs/common';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthAttemptsService } from './auth-attempts.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { AuthService } from './auth.service.js';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import * as bcrypt from 'bcryptjs';

process.env.JWT_ACCESS_SECRET ??=
  'test-only-security-secret-with-at-least-32-bytes';
afterEach(() => vi.useRealTimers());

describe('Límites de autenticación', () => {
  it('bloquea el sexto intento y permite volver al terminar la ventana', () => {
    vi.useFakeTimers();
    const limits = new AuthAttemptsService();
    for (let i = 0; i < 5; i++) limits.consume('cuenta', 5, 900_000);
    expect(() => limits.consume('cuenta', 5, 900_000)).toThrow(/Demasiados/);
    limits.consume('otra-cuenta', 5, 900_000);
    vi.advanceTimersByTime(900_001);
    expect(() => limits.consume('cuenta', 5, 900_000)).not.toThrow();
  });
});

describe('JWT vinculado a sesión', () => {
  const payload = {
    sub: '11111111-1111-4111-8111-111111111111',
    sid: '22222222-2222-4222-8222-222222222222',
    email: 'a@example.test',
    role: 'ADULTO_MAYOR',
  };
  const usuario = {
    id: payload.sub,
    activo: true,
    roles: {
      id: 1,
      codigo: 'ADULTO_MAYOR',
      nombre: 'Adulto',
      activo: true,
      rol_permisos: [],
    },
  };
  function strategy(session: unknown) {
    return new JwtStrategy({
      sesiones: { findFirst: vi.fn().mockResolvedValue(session) },
      usuarios: { findUnique: vi.fn().mockResolvedValue(usuario) },
    } as never);
  }
  it('rechaza access tokens de una sesión revocada aunque no hayan expirado', async () => {
    await expect(strategy(null).validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
  it('rechaza tokens anteriores sin identificador de sesión', async () => {
    await expect(
      strategy({ id: payload.sid }).validate({
        ...payload,
        sid: undefined,
      } as never),
    ).rejects.toThrow(UnauthorizedException);
  });
  it('devuelve la sesión vigente para poder revocarla y cerrar streams', async () => {
    expect(await strategy({ id: payload.sid }).validate(payload)).toMatchObject(
      { id: payload.sub, sessionId: payload.sid },
    );
  });
});

describe('Revocación de sesiones al cambiar contraseña', () => {
  it('desactivar una cuenta revoca sesiones y desafíos para que no reaparezcan al reactivarla', async () => {
    const sessions = vi.fn().mockResolvedValue({ count: 2 });
    const challenges = vi.fn().mockResolvedValue({ count: 1 });
    const users = {
      findUnique: vi.fn().mockResolvedValue({ id: 'usuario' }),
      update: vi.fn().mockResolvedValue({ id: 'usuario', activo: false }),
    };
    const tx = {
      usuarios: users,
      sesiones: { updateMany: sessions },
      codigos_2fa: { updateMany: challenges },
    };
    const db = {
      ...tx,
      $transaction: vi.fn(async (work: (client: typeof tx) => unknown) =>
        work(tx),
      ),
    };
    await new UsuariosService(db as never).deactivate('usuario');
    expect(sessions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { usuario_id: 'usuario', revocada_en: null },
      }),
    );
    expect(challenges).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { usuario_id: 'usuario', usado_en: null },
      }),
    );
  });
  it('revoca todas las sesiones al cambiar la contraseña propia', async () => {
    const revoked = vi.fn().mockResolvedValue({ count: 2 });
    const tx = {
      usuarios: {
        update: vi.fn().mockResolvedValue({ id: 'usuario' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      sesiones: { updateMany: revoked },
      codigos_2fa: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const db = {
      ...tx,
      $transaction: vi.fn(async (work: (client: typeof tx) => unknown) =>
        work(tx),
      ),
    };
    // La búsqueda previa debe devolver el hash; la transacción solo actualiza.
    db.usuarios = {
      ...tx.usuarios,
      findUnique: vi
        .fn()
        .mockResolvedValue({
          id: 'usuario',
          password_hash: await bcrypt.hash('anterior123', 4),
        }),
    } as typeof db.usuarios;
    await new UsuariosService(db as never).cambiarPasswordPropio('usuario', {
      password_actual: 'anterior123',
      password: 'nueva12345',
    });
    expect(revoked).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { usuario_id: 'usuario', revocada_en: null },
      }),
    );
  });
  it('no sobrescribe una contraseña restablecida mientras se verificaba la anterior', async () => {
    const passwordHash = await bcrypt.hash('anterior123', 4);
    const tx = {
      usuarios: {
        update: vi.fn().mockResolvedValue({ id: 'usuario' }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      sesiones: { updateMany: vi.fn() },
      codigos_2fa: { updateMany: vi.fn() },
    };
    const db = {
      usuarios: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'usuario', password_hash: passwordHash }),
      },
      $transaction: vi.fn(async (work: (client: typeof tx) => unknown) =>
        work(tx),
      ),
    };
    await expect(
      new UsuariosService(db as never).cambiarPasswordPropio('usuario', {
        password_actual: 'anterior123',
        password: 'nueva12345',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(tx.sesiones.updateMany).not.toHaveBeenCalled();
  });
});

describe('Rotación de refresh token', () => {
  it('rechaza la segunda renovación cuando el refresh ya fue consumido', async () => {
    const db = {
      sesiones: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            id: 'sesion',
            revocada_en: null,
            expira_en: new Date(Date.now() + 60_000),
            usuarios: {
              id: 'usuario',
              activo: true,
              roles: { activo: true, codigo: 'ADULTO_MAYOR', rol_permisos: [] },
            },
          }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const service = new AuthService(
      db as never,
      { signAsync: vi.fn().mockResolvedValue('access') } as never,
      {} as never,
    );
    await expect(
      service.refresh({ refreshToken: 'already-consumed-refresh-token' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
