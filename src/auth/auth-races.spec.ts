import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash, createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

process.env.JWT_ACCESS_SECRET ??=
  'test-only-race-secret-at-least-thirty-two-bytes';
const password = 'password-before-change';
const oldPasswordHash = await bcrypt.hash(password, 4);
const usuario = {
  id: '11111111-1111-4111-8111-111111111111',
  nombre: 'Ana',
  apellido: 'Prueba',
  email: 'ana@ribani.test',
  telefono: null,
  activo: true,
  email_verificado_en: null,
  password_hash: oldPasswordHash,
  two_factor_enabled: false,
  two_factor_secret: null,
  roles: {
    id: 1,
    codigo: 'ADULTO_MAYOR',
    nombre: 'Adulto mayor',
    activo: true,
    rol_permisos: [],
  },
};

function database() {
  const db = {
    usuarios: {
      findUnique: vi.fn().mockResolvedValue(usuario),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    sesiones: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    auditoria: { create: vi.fn().mockResolvedValue({}) },
    password_reset_tokens: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn(),
    },
    codigos_2fa: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (work: unknown) =>
    typeof work === 'function'
      ? work(db)
      : Promise.all(work as Promise<unknown>[]),
  );
  return db;
}

describe('Emisión de sesión frente a cambio concurrente de contraseña', () => {
  it('rechaza un login validado antes del cambio si la contraseña cambió antes de crear la sesión', async () => {
    const db = database();
    db.usuarios.updateMany.mockResolvedValue({ count: 0 });
    const auth = new AuthService(
      db as never,
      { signAsync: vi.fn().mockResolvedValue('access') } as never,
      {} as never,
    );
    await expect(
      auth.login({ email: usuario.email, password }),
    ).rejects.toThrow(UnauthorizedException);
    expect(db.sesiones.create).not.toHaveBeenCalled();
    expect(db.usuarios.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: usuario.id,
          password_hash: oldPasswordHash,
        }),
      }),
    );
    expect(db.auditoria.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accion: 'LOGIN_FALLIDO',
          actor_id: usuario.id,
        }),
      }),
    );
  });

  it('toma el bloqueo de la cuenta antes de crear sesión y registra el éxito sin credenciales', async () => {
    const db = database();
    const auth = new AuthService(
      db as never,
      { signAsync: vi.fn().mockResolvedValue('access') } as never,
      {} as never,
    );
    const result = await auth.login(
      { email: usuario.email, password },
      { ip: '127.0.0.1', userAgent: 'test-browser' },
    );
    expect(result).toHaveProperty('accessToken', 'access');
    expect(db.usuarios.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      db.sesiones.create.mock.invocationCallOrder[0]!,
    );
    expect(db.auditoria.create).toHaveBeenCalledWith({
      data: {
        actor_id: usuario.id,
        accion: 'LOGIN_EXITOSO',
        entidad: 'auth',
        ip: '127.0.0.1',
        user_agent: 'test-browser',
      },
    });
    expect(JSON.stringify(db.auditoria.create.mock.calls)).not.toContain(
      password,
    );
    expect(JSON.stringify(db.auditoria.create.mock.calls)).not.toContain(
      oldPasswordHash,
    );
  });

  it('un login 2FA validado antes del reset no crea un desafío después del cambio de contraseña', async () => {
    const db = database();
    db.usuarios.findUnique.mockResolvedValue({
      ...usuario,
      two_factor_enabled: true,
      two_factor_secret: 'encrypted-secret',
    });
    db.usuarios.updateMany.mockResolvedValue({ count: 0 });
    const auth = new AuthService(
      db as never,
      { signAsync: vi.fn() } as never,
      {} as never,
    );
    await expect(
      auth.login({ email: usuario.email, password }),
    ).rejects.toThrow(UnauthorizedException);
    expect(db.codigos_2fa.create).not.toHaveBeenCalled();
    expect(db.sesiones.create).not.toHaveBeenCalled();
  });
});

describe('Auditoría de intentos denegados', () => {
  it('registra también los intentos de primer factor bloqueados por límite', async () => {
    const db = database();
    const auth = new AuthService(db as never, {} as never, {} as never);
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(
        auth.login({ email: usuario.email, password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    }
    await expect(
      auth.login({ email: usuario.email, password: 'wrong-password' }),
    ).rejects.toThrow(/Demasiados/);
    expect(db.usuarios.findUnique).toHaveBeenCalledTimes(5);
    expect(db.auditoria.create).toHaveBeenCalledTimes(6);
    expect(
      db.auditoria.create.mock.calls.every(
        ([args]) => args.data.accion === 'LOGIN_FALLIDO',
      ),
    ).toBe(true);
  });

  it.each([
    ['inexistente', null],
    [
      'expirado',
      { expira_en: new Date(Date.now() - 60_000), usado_en: null, intentos: 0 },
    ],
    [
      'utilizado',
      {
        expira_en: new Date(Date.now() + 60_000),
        usado_en: new Date(),
        intentos: 0,
      },
    ],
    [
      'agotado',
      { expira_en: new Date(Date.now() + 60_000), usado_en: null, intentos: 5 },
    ],
  ])(
    'registra un desafío 2FA %s sin guardar token ni código',
    async (_name, challenge) => {
      const db = database();
      db.codigos_2fa.findUnique.mockResolvedValue(
        challenge
          ? { id: 'challenge', usuario_id: usuario.id, ...challenge }
          : null,
      );
      const auth = new AuthService(db as never, {} as never, {} as never);
      await expect(
        auth.loginWithTwoFactor(
          {
            challengeToken: 'challenge-token-not-to-be-logged',
            code: '654321',
          },
          { ip: '127.0.0.1' },
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(db.auditoria.create).toHaveBeenCalledTimes(1);
      expect(db.auditoria.create).toHaveBeenCalledWith({
        data: {
          ...(challenge ? { actor_id: usuario.id } : {}),
          accion: 'LOGIN_2FA_FALLIDO',
          entidad: 'auth',
          ip: '127.0.0.1',
        },
      });
      expect(JSON.stringify(db.auditoria.create.mock.calls)).not.toContain(
        'challenge-token-not-to-be-logged',
      );
      expect(JSON.stringify(db.auditoria.create.mock.calls)).not.toContain(
        '654321',
      );
    },
  );
});

describe('Logout durante la rotación en otra pestaña', () => {
  let db: ReturnType<typeof database>;
  let auth: AuthService;
  let session: Record<string, unknown> | null;

  beforeEach(() => {
    db = database();
    session = null;
    db.sesiones.create.mockImplementation(async ({ data }) => {
      session = { ...data, revocada_en: null };
      return session;
    });
    db.sesiones.findUnique.mockImplementation(async ({ where }) => {
      if (!session) return null;
      if (
        (where.id && where.id === session.id) ||
        where.refresh_token_hash === session.refresh_token_hash
      ) {
        return { ...session, usuarios: usuario };
      }
      return null;
    });
    db.sesiones.updateMany.mockImplementation(async ({ where, data }) => {
      if (
        !session ||
        session.revocada_en ||
        where.refresh_token_hash !== session.refresh_token_hash
      )
        return { count: 0 };
      Object.assign(session, data);
      return { count: 1 };
    });
    db.sesiones.update.mockImplementation(async ({ data }) => {
      Object.assign(session!, data);
      return session;
    });
    auth = new AuthService(
      db as never,
      { signAsync: vi.fn().mockResolvedValue('access') } as never,
      {} as never,
    );
  });

  async function login() {
    const result = await auth.login({ email: usuario.email, password });
    if (!('refreshToken' in result))
      throw new Error('Expected a completed login');
    return result.refreshToken;
  }

  describe('gracia de reentrega tras rotar', () => {
    const navegador = { userAgent: 'navegador-a' };
    afterEach(() => vi.useRealTimers());

    it('una respuesta perdida se recupera: reenviar el token da el mismo resultado', async () => {
      const original = await login();
      const primera = await auth.refresh({ refreshToken: original }, navegador);
      const segunda = await auth.refresh({ refreshToken: original }, navegador);

      expect(segunda.refreshToken).toBe(primera.refreshToken);
      expect(segunda.accessToken).toBe(primera.accessToken);
      expect(db.sesiones.updateMany).toHaveBeenCalledTimes(1);
    });

    it('dos renovaciones simultáneas comparten una sola rotación', async () => {
      const original = await login();
      const [a, b] = await Promise.all([
        auth.refresh({ refreshToken: original }, navegador),
        auth.refresh({ refreshToken: original }, navegador),
      ]);

      expect(a.refreshToken).toBe(b.refreshToken);
      expect(db.sesiones.updateMany).toHaveBeenCalledTimes(1);
    });

    it('otro navegador no puede reutilizar el token dentro de la gracia', async () => {
      const original = await login();
      await auth.refresh({ refreshToken: original }, navegador);

      await expect(
        auth.refresh({ refreshToken: original }, { userAgent: 'otro' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('caduca: pasados 30 s el token rotado ya no renueva', async () => {
      const original = await login();
      await auth.refresh({ refreshToken: original }, navegador);
      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 31_000 });

      await expect(
        auth.refresh({ refreshToken: original }, navegador),
      ).rejects.toThrow(UnauthorizedException);
    });

    it.each([
      [
        'la sesión se revocó',
        () => {
          session!.revocada_en = new Date();
        },
      ],
      [
        'la cuenta se desactivó',
        () => {
          db.sesiones.findUnique.mockResolvedValue({
            ...session,
            usuarios: { ...usuario, activo: false },
          });
        },
      ],
      [
        'el token nuevo ya se volvió a rotar',
        () => {
          session!.refresh_token_hash = 'otro-hash';
        },
      ],
    ])('no reentrega si %s', async (_n, cambio) => {
      const original = await login();
      await auth.refresh({ refreshToken: original }, navegador);
      cambio();

      await expect(
        auth.refresh({ refreshToken: original }, navegador),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('un refresh rechazado no se recuerda como rotación válida', async () => {
      const original = await login();
      db.sesiones.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(
        auth.refresh({ refreshToken: original }, navegador),
      ).rejects.toThrow(UnauthorizedException);

      const reintento = await auth.refresh({ refreshToken: original }, navegador);
      expect(reintento.refreshToken).not.toBe(original);
    });
  });

  it('un refresh consumido ya no renueva, pero aún revoca su misma sesión sin access token', async () => {
    const original = await login();
    const renewed = await auth.refresh({ refreshToken: original });
    expect(renewed.refreshToken).not.toBe(original);
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 31_000 });
    try {
      await expect(auth.refresh({ refreshToken: original })).rejects.toThrow(
        UnauthorizedException,
      );
    } finally {
      vi.useRealTimers();
    }
    await auth.logout({ refreshToken: original });
    expect(session?.revocada_en).toBeInstanceOf(Date);
    await expect(
      auth.refresh({ refreshToken: renewed.refreshToken }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza modificar el identificador o la firma de un refresh consumido', async () => {
    const original = await login();
    await auth.refresh({ refreshToken: original });
    const segments = original.split('.');
    expect(segments).toHaveLength(3);
    const forgedSession = [
      '22222222-2222-4222-8222-222222222222',
      segments[1],
      segments[2],
    ].join('.');
    const forgedSignature = [
      segments[0],
      segments[1],
      `${segments[2]!.startsWith('A') ? 'B' : 'A'}${segments[2]!.slice(1)}`,
    ].join('.');
    await auth.logout({ refreshToken: forgedSession });
    await auth.logout({ refreshToken: forgedSignature });
    expect(session?.revocada_en).toBeNull();
    expect(
      db.sesiones.findUnique.mock.calls.some(([args]) => 'id' in args.where),
    ).toBe(false);
    expect(db.sesiones.update).not.toHaveBeenCalled();
  });

  it('mantiene logout de tokens opacos previos mientras su hash siga vigente', async () => {
    await login();
    const legacy = 'opaque-legacy-refresh-token';
    session!.refresh_token_hash = createHash('sha256')
      .update(legacy)
      .digest('hex');
    await auth.logout({ refreshToken: legacy });
    expect(session?.revocada_en).toBeInstanceOf(Date);
  });

  it('registra logout con actor y metadatos, sin guardar el refresh token', async () => {
    const token = await login();
    db.auditoria.create.mockClear();
    await auth.logout(
      { refreshToken: token },
      { ip: '127.0.0.1', userAgent: 'test-browser' },
    );
    expect(db.auditoria.create).toHaveBeenCalledWith({
      data: {
        actor_id: usuario.id,
        accion: 'LOGOUT',
        entidad: 'auth',
        ip: '127.0.0.1',
        user_agent: 'test-browser',
      },
    });
    expect(JSON.stringify(db.auditoria.create.mock.calls)).not.toContain(token);
  });
});

describe('Recuperación de contraseña', () => {
  it('limita intentos de código por cuenta antes de consultar otro código', async () => {
    const db = database();
    const auth = new AuthService(db as never, {} as never, {} as never);
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(
        auth.resetPassword({
          email: ' ANA@ribani.test ',
          codigo: '123456',
          password: 'new-password-123',
        }),
      ).rejects.toThrow(/inválido/);
    }
    await expect(
      auth.resetPassword({
        email: 'ana@ribani.test',
        codigo: '654321',
        password: 'new-password-123',
      }),
    ).rejects.toThrow(/Demasiados/);
    expect(db.password_reset_tokens.findUnique).toHaveBeenCalledTimes(5);
  });

  it('limita solicitudes de recuperación también para correos inexistentes', async () => {
    const db = database();
    db.usuarios.findUnique.mockResolvedValue(null);
    const sendReset = vi.fn();
    const auth = new AuthService(
      db as never,
      {} as never,
      { enviarResetPassword: sendReset } as never,
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(
        await auth.solicitarResetPassword({ email: 'unknown@ribani.test' }),
      ).toHaveProperty('mensaje');
    }
    await expect(
      auth.solicitarResetPassword({ email: 'unknown@ribani.test' }),
    ).rejects.toThrow(/Demasiados/);
    expect(sendReset).not.toHaveBeenCalled();
  });

  it('registra solicitudes de recuperación sin guardar correo ni código', async () => {
    const db = database();
    db.usuarios.findUnique.mockResolvedValue({ ...usuario, activo: false });
    const auth = new AuthService(db as never, {} as never, {} as never);
    await auth.solicitarResetPassword(
      { email: usuario.email },
      { ip: '127.0.0.1', userAgent: 'test-browser' },
    );
    expect(db.auditoria.create).toHaveBeenCalledWith({
      data: {
        actor_id: usuario.id,
        accion: 'PASSWORD_RECUPERACION_SOLICITADA',
        entidad: 'auth',
        ip: '127.0.0.1',
        user_agent: 'test-browser',
      },
    });
    expect(JSON.stringify(db.auditoria.create.mock.calls)).not.toContain(
      usuario.email,
    );
  });

  it('consume el código una sola vez y revoca sesiones aunque dos resets se validen a la vez', async () => {
    const db = database();
    const token = {
      id: 'reset-token',
      usuario_id: usuario.id,
      usado_en: null,
      expira_en: new Date(Date.now() + 60_000),
    };
    db.password_reset_tokens.findUnique.mockResolvedValue(token);
    let consumed = false;
    db.password_reset_tokens.updateMany.mockImplementation(async () => {
      if (consumed) return { count: 0 };
      consumed = true;
      return { count: 1 };
    });
    const auth = new AuthService(db as never, {} as never, {} as never);
    const dto = {
      email: usuario.email,
      codigo: '123456',
      password: 'new-password-after-reset',
    };
    const results = await Promise.allSettled([
      auth.resetPassword(dto),
      auth.resetPassword(dto),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(db.usuarios.update).toHaveBeenCalledTimes(1);
    expect(db.sesiones.updateMany).toHaveBeenCalledTimes(1);
    expect(db.codigos_2fa.updateMany).toHaveBeenCalledTimes(1);
    expect(db.auditoria.create).toHaveBeenCalledWith({
      data: {
        actor_id: usuario.id,
        accion: 'PASSWORD_RESTABLECIDA',
        entidad: 'auth',
      },
    });
  });

  it('rechaza un código correcto cuando el consumo atómico detecta que otra solicitud lo usó', async () => {
    const db = database();
    db.password_reset_tokens.findUnique.mockResolvedValue({
      id: 'reset-token',
      usuario_id: usuario.id,
      usado_en: null,
      expira_en: new Date(Date.now() + 60_000),
    });
    db.password_reset_tokens.updateMany.mockResolvedValue({ count: 0 });
    const auth = new AuthService(db as never, {} as never, {} as never);
    await expect(
      auth.resetPassword({
        email: usuario.email,
        codigo: '123456',
        password: 'new-password-123',
      }),
    ).rejects.toThrow(/inválido/);
    expect(db.usuarios.update).not.toHaveBeenCalled();
    expect(db.sesiones.updateMany).not.toHaveBeenCalled();
    const expectedHash = createHmac('sha256', process.env.JWT_ACCESS_SECRET!)
      .update(`${usuario.id}:123456`)
      .digest('hex');
    expect(db.password_reset_tokens.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token_hash: expectedHash } }),
    );
  });
});
