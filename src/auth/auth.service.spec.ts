import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { generateSecret, generateSync } from 'otplib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service.js';

process.env.TWO_FACTOR_ENCRYPTION_KEY ??= 'test-encryption-key-for-vitest-only';

// Secreto real de >= 128 bits (otplib v13 lo exige) y hash bcrypt real,
// para que las comparaciones de la lógica funcionen sin mocks.
const TEST_TOTP_SECRET = generateSecret();
const TEST_PASSWORD = 'password123';
const TEST_PASSWORD_HASH = await bcrypt.hash(TEST_PASSWORD, 4);

function createUsuarioFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    nombre: 'Ana',
    apellido: 'Perez',
    email: 'ana@ribani.test',
    telefono: null,
    email_verificado_en: null,
    two_factor_enabled: false,
    two_factor_secret: null,
    password_hash: TEST_PASSWORD_HASH,
    activo: true,
    roles: {
      id: 1,
      codigo: 'ADULTO_MAYOR',
      nombre: 'Adulto Mayor',
      activo: true,
      rol_permisos: [
        { permisos: { codigo: 'perfil:leer' } },
      ],
    },
    ...overrides,
  };
}

function createPrismaMock() {
  return {
    usuarios: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    codigos_2fa: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    sesiones: {
      create: vi.fn(),
    },
    adulto_familiares: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

function createJwtMock() {
  return { signAsync: vi.fn().mockResolvedValue('access-token') };
}

function encryptWith(service: AuthService, secret: string): string {
  return (
    service as never as {
      encryptSecret(secret: string): string;
    }
  ).encryptSecret(secret);
}

describe('AuthService', () => {
  let prismaMock: ReturnType<typeof createPrismaMock>;
  let jwtMock: ReturnType<typeof createJwtMock>;
  let service: AuthService;

  beforeEach(() => {
    prismaMock = createPrismaMock();
    jwtMock = createJwtMock();
    service = new AuthService(
      prismaMock as never,
      jwtMock as never,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('emite tokens cuando el usuario no tiene 2FA', async () => {
      prismaMock.usuarios.findUnique.mockResolvedValue(
        createUsuarioFixture(),
      );
      prismaMock.sesiones.create.mockResolvedValue({});
      prismaMock.usuarios.update.mockResolvedValue({});
      prismaMock.$transaction.mockResolvedValue([]);

      const result = await service.login(
        { email: 'ana@ribani.test', password: TEST_PASSWORD },
        {},
      );

      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(result).toHaveProperty('refreshToken');
      expect(result).not.toHaveProperty('twoFactorRequired');
      expect(prismaMock.codigos_2fa.create).not.toHaveBeenCalled();
    });

    it('devuelve challengeToken cuando el usuario tiene 2FA activado', async () => {
      prismaMock.usuarios.findUnique.mockResolvedValue(
        createUsuarioFixture({
          two_factor_enabled: true,
          two_factor_secret: encryptWith(service, TEST_TOTP_SECRET),
        }),
      );
      prismaMock.codigos_2fa.create.mockResolvedValue({});

      const result = await service.login(
        { email: 'ana@ribani.test', password: TEST_PASSWORD },
        {},
      );

      expect(result).toMatchObject({
        twoFactorRequired: true,
        expiresIn: 300,
      });
      expect(typeof result.challengeToken).toBe('string');
      expect(result.challengeToken.length).toBeGreaterThan(20);
      expect(jwtMock.signAsync).not.toHaveBeenCalled();
      expect(prismaMock.codigos_2fa.create).toHaveBeenCalledTimes(1);
    });

    it('rechaza credenciales incorrectas', async () => {
      prismaMock.usuarios.findUnique.mockResolvedValue(
        createUsuarioFixture(),
      );

      await expect(
        service.login(
          { email: 'ana@ribani.test', password: 'wrong-password' },
          {},
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('loginWithTwoFactor', () => {
    function arrangeChallenge(
      overrides: Record<string, unknown> = {},
    ) {
      const challenge = {
        id: '22222222-2222-2222-2222-222222222222',
        usuario_id: '11111111-1111-1111-1111-111111111111',
        token_hash: 'hashed',
        tipo: 'LOGIN',
        intentos: 0,
        expira_en: new Date(Date.now() + 60_000),
        usado_en: null,
        ...overrides,
      };
      prismaMock.codigos_2fa.findUnique.mockResolvedValue(challenge);
      prismaMock.usuarios.findUnique.mockResolvedValue(
        createUsuarioFixture({
          two_factor_enabled: true,
          two_factor_secret: encryptWith(service, TEST_TOTP_SECRET),
        }),
      );
      prismaMock.sesiones.create.mockResolvedValue({});
      prismaMock.usuarios.update.mockResolvedValue({});
      prismaMock.$transaction.mockResolvedValue([]);
      return challenge;
    }

    it('emite tokens con un código TOTP válido', async () => {
      arrangeChallenge();
      const code = generateSync({ secret: TEST_TOTP_SECRET });

      const result = await service.loginWithTwoFactor(
        {
          challengeToken: 'challenge-token-raw-value-000',
          code,
        },
        {},
      );

      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(prismaMock.codigos_2fa.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: '22222222-2222-2222-2222-222222222222' },
          data: { usado_en: expect.any(Date) },
        }),
      );
    });

    it('rechaza un código incorrecto e incrementa los intentos', async () => {
      arrangeChallenge();

      await expect(
        service.loginWithTwoFactor(
          {
            challengeToken: 'challenge-token-raw-value-000',
            code: '000000',
          },
          {},
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(prismaMock.codigos_2fa.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { intentos: { increment: 1 } },
        }),
      );
    });

    it('rechaza un desafío expirado', async () => {
      arrangeChallenge({
        expira_en: new Date(Date.now() - 60_000),
      });

      await expect(
        service.loginWithTwoFactor(
          {
            challengeToken: 'challenge-token-raw-value-000',
            code: '123456',
          },
          {},
        ),
      ).rejects.toThrow('expirado');
    });

    it('revoca el desafío al superar el máximo de intentos', async () => {
      arrangeChallenge({ intentos: 5 });

      await expect(
        service.loginWithTwoFactor(
          {
            challengeToken: 'challenge-token-raw-value-000',
            code: '123456',
          },
          {},
        ),
      ).rejects.toThrow('Demasiados intentos');

      expect(prismaMock.codigos_2fa.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { usado_en: expect.any(Date) },
        }),
      );
    });

    it('rechaza un desafío ya utilizado', async () => {
      arrangeChallenge({ usado_en: new Date() });

      await expect(
        service.loginWithTwoFactor(
          {
            challengeToken: 'challenge-token-raw-value-000',
            code: '123456',
          },
          {},
        ),
      ).rejects.toThrow('Desafío 2FA inválido');
    });
  });

  describe('setupTwoFactor', () => {
    it('devuelve secreto y otpauthUrl, y guarda el secreto cifrado', async () => {
      prismaMock.usuarios.findUnique.mockResolvedValue(
        createUsuarioFixture(),
      );
      prismaMock.usuarios.update.mockResolvedValue({});

      const result = await service.setupTwoFactor(
        '11111111-1111-1111-1111-111111111111',
      );

      expect(result).toHaveProperty('secret');
      expect(result.otpauthUrl).toContain('otpauth://totp/RIBANI');
      expect(result.otpauthUrl).toContain('ana%40ribani.test');

      const updateCall = prismaMock.usuarios.update.mock.calls[0][0];
      expect(updateCall.data.two_factor_enabled).toBe(false);
      expect(updateCall.data.two_factor_secret).not.toContain(
        result.secret,
      );
    });

    it('rechaza si el 2FA ya está habilitado', async () => {
      prismaMock.usuarios.findUnique.mockResolvedValue(
        createUsuarioFixture({ two_factor_enabled: true }),
      );

      await expect(
        service.setupTwoFactor('11111111-1111-1111-1111-111111111111'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('verifyTwoFactor', () => {
    it('habilita el 2FA con un código válido', async () => {
      prismaMock.usuarios.findUnique.mockResolvedValue(
        createUsuarioFixture({
          two_factor_secret: encryptWith(service, TEST_TOTP_SECRET),
        }),
      );
      prismaMock.usuarios.update.mockResolvedValue({});
      const code = generateSync({ secret: TEST_TOTP_SECRET });

      const result = await service.verifyTwoFactor(
        '11111111-1111-1111-1111-111111111111',
        { code },
      );

      expect(result).toMatchObject({ twoFactorEnabled: true });
      expect(prismaMock.usuarios.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { two_factor_enabled: true },
        }),
      );
    });

    it('rechaza un código incorrecto', async () => {
      prismaMock.usuarios.findUnique.mockResolvedValue(
        createUsuarioFixture({
          two_factor_secret: encryptWith(service, TEST_TOTP_SECRET),
        }),
      );

      await expect(
        service.verifyTwoFactor('11111111-1111-1111-1111-111111111111', {
          code: '000000',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza si no hay configuración previa', async () => {
      prismaMock.usuarios.findUnique.mockResolvedValue(
        createUsuarioFixture({ two_factor_secret: null }),
      );

      await expect(
        service.verifyTwoFactor('11111111-1111-1111-1111-111111111111', {
          code: '123456',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('disableTwoFactor', () => {
    it('rechaza contraseña incorrecta', async () => {
      prismaMock.usuarios.findUnique.mockResolvedValue(
        createUsuarioFixture({ two_factor_enabled: true }),
      );

      await expect(
        service.disableTwoFactor('11111111-1111-1111-1111-111111111111', {
          password: 'wrong-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deshabilita el 2FA y limpia desafíos pendientes', async () => {
      prismaMock.usuarios.findUnique.mockResolvedValue(
        createUsuarioFixture({ two_factor_enabled: true }),
      );
      prismaMock.usuarios.update.mockResolvedValue({});
      prismaMock.codigos_2fa.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.disableTwoFactor(
        '11111111-1111-1111-1111-111111111111',
        { password: TEST_PASSWORD },
      );

      expect(result).toMatchObject({ twoFactorEnabled: false });
      expect(prismaMock.usuarios.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            two_factor_enabled: false,
            two_factor_secret: null,
          },
        }),
      );
      expect(prismaMock.codigos_2fa.deleteMany).toHaveBeenCalledWith({
        where: {
          usuario_id: '11111111-1111-1111-1111-111111111111',
          usado_en: null,
        },
      });
    });

    it('rechaza si el 2FA no está habilitado', async () => {
      prismaMock.usuarios.findUnique.mockResolvedValue(
        createUsuarioFixture(),
      );

      await expect(
        service.disableTwoFactor('11111111-1111-1111-1111-111111111111', {
          password: TEST_PASSWORD,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('flujo asistido (familiar/admin)', () => {
    const ADULTO_ID = '11111111-1111-1111-1111-111111111111';
    const FAMILIAR_ID = '33333333-3333-3333-3333-333333333333';

    function arrangeAdulto(
      overrides: Record<string, unknown> = {},
      rolCodigo = 'ADULTO_MAYOR',
    ) {
      const adulto = createUsuarioFixture({
        two_factor_secret: null,
        ...overrides,
        roles: { ...createUsuarioFixture().roles, codigo: rolCodigo },
      });
      prismaMock.usuarios.findUnique.mockResolvedValue(adulto);
      prismaMock.usuarios.update.mockResolvedValue({});
      return adulto;
    }

    it('familiar con vínculo ACTIVA genera el QR del adulto', async () => {
      arrangeAdulto();
      prismaMock.adulto_familiares.findFirst.mockResolvedValue({
        adulto_id: ADULTO_ID,
        familiar_id: FAMILIAR_ID,
        estado: 'ACTIVA',
      });

      const result = await service.setupTwoFactorForUser(
        { id: FAMILIAR_ID, rolCodigo: 'FAMILIAR_ENCARGADO' },
        ADULTO_ID,
      );

      expect(result.otpauthUrl).toContain('otpauth://totp/RIBANI');
      const updateCall = prismaMock.usuarios.update.mock.calls[0][0];
      expect(updateCall.where.id).toBe(ADULTO_ID);
      expect(updateCall.data.two_factor_secret).not.toContain(
        result.secret,
      );
    });

    it('familiar sin vínculo es rechazado', async () => {
      arrangeAdulto();
      prismaMock.adulto_familiares.findFirst.mockResolvedValue(null);

      await expect(
        service.setupTwoFactorForUser(
          { id: FAMILIAR_ID, rolCodigo: 'FAMILIAR_ENCARGADO' },
          ADULTO_ID,
        ),
      ).rejects.toThrow('No eres el familiar encargado');
    });

    it('ADMINISTRADOR no requiere vínculo', async () => {
      arrangeAdulto();

      const result = await service.setupTwoFactorForUser(
        { id: '44444444-4444-4444-4444-444444444444', rolCodigo: 'ADMINISTRADOR' },
        ADULTO_ID,
      );

      expect(result).toHaveProperty('otpauthUrl');
      expect(prismaMock.adulto_familiares.findFirst).not.toHaveBeenCalled();
    });

    it('rechaza si el destino no es ADULTO_MAYOR', async () => {
      arrangeAdulto({}, 'FAMILIAR_ENCARGADO');

      await expect(
        service.setupTwoFactorForUser(
          { id: '44444444-4444-4444-4444-444444444444', rolCodigo: 'ADMINISTRADOR' },
          ADULTO_ID,
        ),
      ).rejects.toThrow('solo aplica a cuentas con rol ADULTO_MAYOR');
    });

    it('familiar confirma el 2FA con el código leído por el adulto', async () => {
      const encrypted = encryptWith(service, TEST_TOTP_SECRET);
      arrangeAdulto({ two_factor_secret: encrypted });
      prismaMock.adulto_familiares.findFirst.mockResolvedValue({
        adulto_id: ADULTO_ID,
        familiar_id: FAMILIAR_ID,
        estado: 'ACTIVA',
      });
      const code = generateSync({ secret: TEST_TOTP_SECRET });

      const result = await service.verifyTwoFactorForUser(
        { id: FAMILIAR_ID, rolCodigo: 'FAMILIAR_ENCARGADO' },
        ADULTO_ID,
        { code },
      );

      expect(result).toMatchObject({ twoFactorEnabled: true });
      expect(prismaMock.usuarios.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { two_factor_enabled: true },
        }),
      );
    });

    it('familiar con código incorrecto es rechazado', async () => {
      arrangeAdulto({
        two_factor_secret: encryptWith(service, TEST_TOTP_SECRET),
      });
      prismaMock.adulto_familiares.findFirst.mockResolvedValue({
        adulto_id: ADULTO_ID,
        familiar_id: FAMILIAR_ID,
        estado: 'ACTIVA',
      });

      await expect(
        service.verifyTwoFactorForUser(
          { id: FAMILIAR_ID, rolCodigo: 'FAMILIAR_ENCARGADO' },
          ADULTO_ID,
          { code: '000000' },
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
