import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomUUID,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { isIP } from 'node:net';
import { AuthAttemptsService } from './auth-attempts.service.js';

import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { SolicitarResetPasswordDto } from './dto/reset-password.dto.js';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/registrer.dto.js';
import { TwoFactorLoginDto } from './dto/two-factor-login.dto.js';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto.js';
import { JwtPayload } from './strategies/jwt.strategy.js';

interface RequestMetadata {
  ip?: string;
  userAgent?: string;
}

interface UsuarioConRoles {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  password_hash: string;
  telefono: string | null;
  email_verificado_en: Date | null;
  two_factor_enabled: boolean;
  two_factor_secret: string | null;
  roles: {
    id: number;
    codigo: string;
    nombre: string;
    rol_permisos: {
      permisos: {
        codigo: string;
      };
    }[];
  };
}

@Injectable()
export class AuthService {
  private readonly accessTokenExpirationSeconds = Number(
    process.env.JWT_ACCESS_EXPIRES_IN_SECONDS ?? 900,
  );

  private readonly refreshTokenExpirationSeconds = Number(
    process.env.JWT_REFRESH_EXPIRES_IN_SECONDS ?? 604800,
  );

  private static readonly challengeExpirationSeconds = 300;

  private static readonly maxChallengeAttempts = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly attempts: AuthAttemptsService = new AuthAttemptsService(),
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.usuarios.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      throw new ConflictException(
        'Ya existe un usuario con ese correo electrónico.',
      );
    }
    const rolCodigo = dto.rolCodigo ?? 'ADULTO_MAYOR';

    const role = await this.prisma.roles.findUnique({
      where: {
        codigo: rolCodigo,
      },
    });

    if (!role || !role.activo) {
      throw new ConflictException(`El rol ${rolCodigo} no está disponible.`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const usuario = await this.prisma.usuarios.create({
      data: {
        rol_id: role.id,
        nombre: dto.nombre.trim(),
        apellido: dto.apellido.trim(),
        email,
        telefono: dto.telefono?.trim() || null,
        password_hash: passwordHash,
      },
      include: {
        roles: true,
      },
    });

    return {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      telefono: usuario.telefono,
      activo: usuario.activo,
      rol: {
        id: usuario.roles.id,
        codigo: usuario.roles.codigo,
        nombre: usuario.roles.nombre,
      },
      emailVerificado: usuario.email_verificado_en !== null,
      createdAt: usuario.created_at,
    };
  }

  async login(dto: LoginDto, metadata: RequestMetadata = {}) {
    const email = dto.email.trim().toLowerCase();

    const key = `login:${email}`;
    let actorId: string | undefined;
    try {
      this.attempts.consume(key, 5, 15 * 60_000);
      const usuario = await this.prisma.usuarios.findUnique({
        where: {
          email,
        },
        include: {
          roles: {
            include: {
              rol_permisos: {
                include: {
                  permisos: true,
                },
              },
            },
          },
        },
      });

      actorId = usuario?.id;
      if (!usuario) {
        throw new UnauthorizedException('Correo o contraseña incorrectos.');
      }

      if (!usuario.activo) {
        throw new UnauthorizedException('Correo o contraseña incorrectos.');
      }

      if (!usuario.roles.activo) {
        throw new UnauthorizedException('Correo o contraseña incorrectos.');
      }

      const passwordValid = await bcrypt.compare(
        dto.password,
        usuario.password_hash,
      );

      if (!passwordValid) {
        throw new UnauthorizedException('Correo o contraseña incorrectos.');
      }

      this.attempts.reset(key);
      if (usuario.two_factor_enabled && usuario.two_factor_secret) {
        const challengeToken = await this.signChallengeToken(
          usuario.id,
          usuario.password_hash,
        );

        return {
          twoFactorRequired: true,
          challengeToken,
          expiresIn: AuthService.challengeExpirationSeconds,
        };
      }

      return await this.issueTokens(usuario, metadata);
    } catch (error) {
      await this.recordAuth('LOGIN_FALLIDO', actorId, metadata);
      throw error;
    }
  }

  async refresh(dto: RefreshTokenDto, metadata: RequestMetadata = {}) {
    const refreshTokenHash = this.hashToken(dto.refreshToken);

    const session = await this.prisma.sesiones.findUnique({
      where: {
        refresh_token_hash: refreshTokenHash,
      },
      include: {
        usuarios: {
          include: {
            roles: {
              include: {
                rol_permisos: {
                  include: {
                    permisos: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    if (session.revocada_en) {
      throw new UnauthorizedException('La sesión ha sido revocada.');
    }

    if (session.expira_en <= new Date()) {
      await this.prisma.sesiones.update({
        where: {
          id: session.id,
        },
        data: {
          revocada_en: new Date(),
        },
      });

      throw new UnauthorizedException('La sesión ha expirado.');
    }

    const usuario = session.usuarios;

    if (!usuario.activo) {
      throw new UnauthorizedException('La cuenta se encuentra desactivada.');
    }

    if (!usuario.roles.activo) {
      throw new UnauthorizedException(
        'El rol del usuario se encuentra desactivado.',
      );
    }

    const permisos = usuario.roles.rol_permisos.map(
      ({ permisos }) => permisos.codigo,
    );

    const payload: JwtPayload = {
      sub: usuario.id,
      sid: session.id,
      email: usuario.email,
      role: usuario.roles.codigo,
    };

    const newRefreshToken = this.generateRefreshToken(session.id);
    const newRefreshTokenHash = this.hashToken(newRefreshToken);

    const newExpiration = new Date(
      Date.now() + this.refreshTokenExpirationSeconds * 1000,
    );

    const rotated = await this.prisma.sesiones.updateMany({
      where: {
        id: session.id,
        refresh_token_hash: refreshTokenHash,
        revocada_en: null,
        expira_en: { gt: new Date() },
      },
      data: {
        refresh_token_hash: newRefreshTokenHash,
        expira_en: newExpiration,
        ip: metadata.ip ?? session.ip,
        user_agent: metadata.userAgent ?? session.user_agent,
      },
    });

    if (rotated.count !== 1)
      throw new UnauthorizedException('Refresh token inválido o utilizado.');
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokenExpirationSeconds,

      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.email,
        telefono: usuario.telefono,
        emailVerificado: usuario.email_verificado_en !== null,
        twoFactorEnabled: usuario.two_factor_enabled,
        rol: {
          id: usuario.roles.id,
          codigo: usuario.roles.codigo,
          nombre: usuario.roles.nombre,
        },
        permisos,
      },
    };
  }

  async logout(dto: RefreshTokenDto, metadata: RequestMetadata = {}) {
    const refreshTokenHash = this.hashToken(dto.refreshToken);

    let session = await this.prisma.sesiones.findUnique({
      where: {
        refresh_token_hash: refreshTokenHash,
      },
    });

    if (!session) {
      // Otra pestaña puede haber rotado el token antes de recibir este logout.
      // La firma permite únicamente revocar la misma sesión; refresh continúa
      // exigiendo el hash vigente y nunca acepta esta prueba de un token viejo.
      const sessionId = this.sessionIdForRevocation(dto.refreshToken);
      if (sessionId)
        session = await this.prisma.sesiones.findUnique({
          where: { id: sessionId },
        });
    }

    if (!session) {
      return {
        message: 'Sesión cerrada correctamente.',
      };
    }

    if (!session.revocada_en) {
      await this.prisma.sesiones.update({
        where: {
          id: session.id,
        },
        data: {
          revocada_en: new Date(),
        },
      });
    }
    await this.recordAuth('LOGOUT', session.usuario_id, metadata);

    return {
      message: 'Sesión cerrada correctamente.',
    };
  }

  async getCurrentUser(userId: string) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id: userId,
      },
      include: {
        roles: {
          include: {
            rol_permisos: {
              include: {
                permisos: true,
              },
            },
          },
        },
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo.');
    }

    return {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      telefono: usuario.telefono,
      emailVerificado: usuario.email_verificado_en !== null,
      twoFactorEnabled: usuario.two_factor_enabled,
      ultimoAcceso: usuario.ultimo_acceso_en,

      rol: {
        id: usuario.roles.id,
        codigo: usuario.roles.codigo,
        nombre: usuario.roles.nombre,
      },

      permisos: usuario.roles.rol_permisos.map(
        ({ permisos }) => permisos.codigo,
      ),
    };
  }

  private generateRefreshToken(sessionId: string): string {
    const value = `${sessionId}.${randomBytes(64).toString('base64url')}`;
    return `${value}.${this.refreshRevocationSignature(value).toString('base64url')}`;
  }

  private refreshRevocationSignature(value: string): Buffer {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error('JWT_ACCESS_SECRET is required.');
    return createHmac('sha256', secret)
      .update(`ribani-refresh-revocation:v1:${value}`)
      .digest();
  }

  private sessionIdForRevocation(token: string): string | null {
    const match =
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{86})\.([A-Za-z0-9_-]{43})$/i.exec(
        token,
      );
    if (!match) return null;
    const [, sessionId, nonce, signature] = match;
    const received = Buffer.from(signature!, 'base64url');
    const expected = this.refreshRevocationSignature(`${sessionId}.${nonce}`);
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      return null;
    return sessionId!;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // ----- Recuperación de contraseña (código de 6 dígitos por correo) -----

  /** Tiempo de validez del código de recuperación, en minutos. */
  private static readonly resetCodeRetentionMinutes = 10;

  /**
   * POST /auth/forgot-password. Genera un código de 6 dígitos, guarda su
   * hash en password_reset_tokens (vigencia 10 min) y lo envía por correo.
   * Responde SIEMPRE con un mensaje genérico para no revelar si el email
   * existe en la base (enumeración de cuentas).
   */
  async solicitarResetPassword(
    dto: SolicitarResetPasswordDto,
    metadata: RequestMetadata = {},
  ) {
    const email = dto.email.trim().toLowerCase();
    const usuario = await this.prisma.usuarios.findUnique({
      where: { email },
      select: { id: true, nombre: true, activo: true },
    });

    this.attempts.consume(`forgot:${email}`, 3, 10 * 60_000);
    if (usuario && usuario.activo) {
      const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const expiraEn = new Date(
        Date.now() + AuthService.resetCodeRetentionMinutes * 60_000,
      );

      // Un solo código activo por cuenta: invalida los anteriores.
      await this.prisma.$transaction([
        this.prisma.password_reset_tokens.updateMany({
          where: { usuario_id: usuario.id, usado_en: null },
          data: { usado_en: new Date() },
        }),
        this.prisma.password_reset_tokens.create({
          data: {
            usuario_id: usuario.id,
            token_hash: this.hashResetCode(usuario.id, codigo),
            expira_en: expiraEn,
          },
        }),
      ]);

      // El correo puede fallar (Resend caído): el código queda guardado
      // pero inutilizable en la práctica; la respuesta es genérica igual.
      await this.mailService
        .enviarResetPassword(email, usuario.nombre, codigo)
        .catch(() => undefined);
    }
    await this.recordAuth(
      'PASSWORD_RECUPERACION_SOLICITADA',
      usuario?.id,
      metadata,
    );

    return {
      mensaje:
        'Si el correo existe en RIBANI, recibirás un código de recuperación en los próximos minutos.',
    };
  }

  /**
   * POST /auth/reset-password. Valida el código (no usado, no expirado),
   * actualiza la contraseña con bcrypt y cierra todas las sesiones
   * activas de la cuenta (todos los dispositivos vuelven al login).
   */
  async resetPassword(dto: ResetPasswordDto, metadata: RequestMetadata = {}) {
    const email = dto.email.trim().toLowerCase();
    this.attempts.consume(`reset:${email}`, 5, 10 * 60_000);
    const usuario = await this.prisma.usuarios.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!usuario) {
      throw new BadRequestException('Código inválido o expirado.');
    }

    const tokenHash = this.hashResetCode(usuario.id, dto.codigo.trim());
    const token = await this.prisma.password_reset_tokens.findUnique({
      where: { token_hash: tokenHash },
      select: { id: true, usuario_id: true, expira_en: true, usado_en: true },
    });

    if (!token || token.usuario_id !== usuario.id) {
      throw new BadRequestException('Código inválido o expirado.');
    }
    if (token.usado_en || token.expira_en <= new Date()) {
      throw new BadRequestException('Código inválido o expirado.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.password_reset_tokens.updateMany({
        where: {
          id: token.id,
          usuario_id: usuario.id,
          usado_en: null,
          expira_en: { gt: new Date() },
        },
        data: { usado_en: new Date() },
      });
      if (consumed.count !== 1)
        throw new BadRequestException('Código inválido o expirado.');
      await tx.usuarios.update({
        where: { id: usuario.id },
        data: { password_hash: passwordHash },
      });
      await tx.sesiones.updateMany({
        where: { usuario_id: usuario.id, revocada_en: null },
        data: { revocada_en: new Date() },
      });
      await tx.codigos_2fa.updateMany({
        where: { usuario_id: usuario.id, usado_en: null },
        data: { usado_en: new Date() },
      });
    });
    await this.recordAuth('PASSWORD_RESTABLECIDA', usuario.id, metadata);

    return {
      mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión con la nueva.',
    };
  }

  async loginWithTwoFactor(
    dto: TwoFactorLoginDto,
    metadata: RequestMetadata = {},
  ) {
    let actorId: string | undefined;
    try {
      const tokenHash = this.hashToken(dto.challengeToken);

      const challenge = await this.prisma.codigos_2fa.findUnique({
        where: {
          token_hash: tokenHash,
        },
      });
      actorId = challenge?.usuario_id;

      if (!challenge || challenge.usado_en) {
        throw new UnauthorizedException('Desafío 2FA inválido.');
      }

      if (challenge.expira_en <= new Date()) {
        throw new UnauthorizedException(
          'El desafío 2FA ha expirado. Inicia sesión nuevamente.',
        );
      }

      if (challenge.intentos >= AuthService.maxChallengeAttempts) {
        await this.prisma.codigos_2fa.update({
          where: {
            id: challenge.id,
          },
          data: {
            usado_en: new Date(),
          },
        });

        throw new UnauthorizedException(
          'Demasiados intentos. Inicia sesión nuevamente.',
        );
      }

      this.attempts.consume(`totp:${challenge.usuario_id}`, 5, 5 * 60_000);
      const usuario = await this.prisma.usuarios.findUnique({
        where: {
          id: challenge.usuario_id,
        },
        include: {
          roles: {
            include: {
              rol_permisos: {
                include: {
                  permisos: true,
                },
              },
            },
          },
        },
      });

      if (
        !usuario ||
        !usuario.activo ||
        !usuario.roles.activo ||
        !usuario.two_factor_enabled ||
        !usuario.two_factor_secret
      ) {
        throw new UnauthorizedException('Desafío 2FA inválido.');
      }

      const secret = this.decryptSecret(usuario.two_factor_secret);

      const { valid } = verifySync({
        secret,
        token: dto.code,
      });

      if (!valid) {
        await this.prisma.codigos_2fa.update({
          where: {
            id: challenge.id,
          },
          data: {
            intentos: {
              increment: 1,
            },
          },
        });

        throw new UnauthorizedException('Código 2FA incorrecto.');
      }

      const consumed = await this.prisma.codigos_2fa.updateMany({
        where: {
          id: challenge.id,
          usado_en: null,
          expira_en: { gt: new Date() },
          intentos: { lt: AuthService.maxChallengeAttempts },
        },
        data: { usado_en: new Date() },
      });
      if (consumed.count !== 1)
        throw new UnauthorizedException('Desafío 2FA inválido o utilizado.');
      this.attempts.reset(`totp:${challenge.usuario_id}`);

      return await this.issueTokens(usuario, metadata);
    } catch (error) {
      await this.recordAuth('LOGIN_2FA_FALLIDO', actorId, metadata);
      throw error;
    }
  }

  async setupTwoFactor(userId: string) {
    this.attempts.consume(`setupTwoFactor:${userId}`, 5, 5 * 60_000);
    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id: userId,
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo.');
    }

    if (usuario.two_factor_enabled) {
      throw new ConflictException('El 2FA ya está habilitado en esta cuenta.');
    }

    const secret = generateSecret();

    await this.prisma.usuarios.update({
      where: {
        id: userId,
      },
      data: {
        two_factor_secret: this.encryptSecret(secret),
        two_factor_enabled: false,
      },
    });

    const otpauthUrl = generateURI({
      issuer: 'RIBANI',
      label: usuario.email,
      secret,
    });

    return {
      secret,
      otpauthUrl,
      mensaje:
        'Escanea el código QR con tu app authenticator y confirma con POST /auth/2fa/verify.',
    };
  }

  async verifyTwoFactor(userId: string, dto: VerifyTwoFactorDto) {
    this.attempts.consume(`verifyTwoFactor:${userId}`, 5, 5 * 60_000);
    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id: userId,
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo.');
    }

    if (!usuario.two_factor_secret) {
      throw new BadRequestException(
        'Solicita primero la configuración con POST /auth/2fa/setup.',
      );
    }

    if (usuario.two_factor_enabled) {
      throw new ConflictException('El 2FA ya está habilitado en esta cuenta.');
    }

    const secret = this.decryptSecret(usuario.two_factor_secret);

    const { valid } = verifySync({
      secret,
      token: dto.code,
    });

    if (!valid) {
      throw new UnauthorizedException(
        'Código 2FA incorrecto. Vuelve a intentarlo.',
      );
    }

    await this.prisma.usuarios.update({
      where: {
        id: userId,
      },
      data: {
        two_factor_enabled: true,
      },
    });

    return {
      twoFactorEnabled: true,
      mensaje: '2FA habilitado correctamente.',
    };
  }

  async disableTwoFactor(userId: string, dto: DisableTwoFactorDto) {
    this.attempts.consume(`disableTwoFactor:${userId}`, 5, 5 * 60_000);
    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id: userId,
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo.');
    }

    if (!usuario.two_factor_enabled) {
      throw new BadRequestException(
        'El 2FA no está habilitado en esta cuenta.',
      );
    }

    const passwordValid = await bcrypt.compare(
      dto.password,
      usuario.password_hash,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Contraseña incorrecta.');
    }

    await this.prisma.usuarios.update({
      where: {
        id: userId,
      },
      data: {
        two_factor_enabled: false,
        two_factor_secret: null,
      },
    });

    await this.prisma.codigos_2fa.deleteMany({
      where: {
        usuario_id: userId,
        usado_en: null,
      },
    });

    return {
      twoFactorEnabled: false,
      mensaje: '2FA deshabilitado correctamente.',
    };
  }

  async setupTwoFactorForUser(
    caller: { id: string; rolCodigo: string },
    targetId: string,
  ) {
    const target = await this.assertCanAssistTwoFactor(caller, targetId);

    if (target.two_factor_enabled) {
      throw new ConflictException('El 2FA ya está habilitado en esta cuenta.');
    }

    const secret = generateSecret();

    await this.prisma.usuarios.update({
      where: {
        id: target.id,
      },
      data: {
        two_factor_secret: this.encryptSecret(secret),
        two_factor_enabled: false,
      },
    });

    const otpauthUrl = generateURI({
      issuer: 'RIBANI',
      label: target.email,
      secret,
    });

    return {
      secret,
      otpauthUrl,
      mensaje:
        'Muestra este QR al adulto mayor para que lo escanee con su app authenticator y confirma con POST /usuarios/{id}/2fa/verify.',
    };
  }

  async verifyTwoFactorForUser(
    caller: { id: string; rolCodigo: string },
    targetId: string,
    dto: VerifyTwoFactorDto,
  ) {
    const target = await this.assertCanAssistTwoFactor(caller, targetId);

    if (!target.two_factor_secret) {
      throw new BadRequestException(
        'No hay configuración 2FA pendiente. Genera el código QR primero.',
      );
    }

    if (target.two_factor_enabled) {
      throw new ConflictException('El 2FA ya está habilitado en esta cuenta.');
    }

    const secret = this.decryptSecret(target.two_factor_secret);

    const { valid } = verifySync({
      secret,
      token: dto.code,
    });

    if (!valid) {
      throw new UnauthorizedException(
        'Código 2FA incorrecto. Vuelve a intentarlo.',
      );
    }

    await this.prisma.usuarios.update({
      where: {
        id: target.id,
      },
      data: {
        two_factor_enabled: true,
      },
    });

    return {
      twoFactorEnabled: true,
      mensaje: '2FA habilitado correctamente para el adulto mayor.',
    };
  }

  private async assertCanAssistTwoFactor(
    caller: { id: string; rolCodigo: string },
    targetId: string,
  ) {
    const target = await this.prisma.usuarios.findUnique({
      where: {
        id: targetId,
      },
      include: {
        roles: true,
      },
    });

    if (!target || !target.activo) {
      throw new NotFoundException('Usuario no encontrado o inactivo.');
    }

    if (target.roles.codigo !== 'ADULTO_MAYOR') {
      throw new BadRequestException(
        'El 2FA asistido solo aplica a cuentas con rol ADULTO_MAYOR.',
      );
    }

    if (caller.rolCodigo !== 'ADMINISTRADOR') {
      const vinculo = await this.prisma.adulto_familiares.findFirst({
        where: {
          adulto_id: targetId,
          familiar_id: caller.id,
          estado: 'ACTIVA',
        },
      });

      if (!vinculo) {
        throw new ForbiddenException(
          'No eres el familiar encargado de este adulto mayor.',
        );
      }
    }

    return target;
  }

  private async issueTokens(
    usuario: UsuarioConRoles,
    metadata: RequestMetadata,
  ) {
    const permisos = usuario.roles.rol_permisos.map(
      ({ permisos }) => permisos.codigo,
    );

    const sessionId = randomUUID();
    const payload: JwtPayload = {
      sub: usuario.id,
      sid: sessionId,
      email: usuario.email,
      role: usuario.roles.codigo,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const refreshToken = this.generateRefreshToken(sessionId);
    const refreshTokenHash = this.hashToken(refreshToken);

    const expiraEn = new Date(
      Date.now() + this.refreshTokenExpirationSeconds * 1000,
    );

    await this.prisma.$transaction(async (tx) => {
      // El UPDATE bloquea la misma fila que cambio/reset de contraseña. Si ese
      // cambio terminó antes, el hash ya no coincide; si termina después,
      // deberá esperar y revocará también la sesión creada aquí.
      const current = await tx.usuarios.updateMany({
        where: {
          id: usuario.id,
          password_hash: usuario.password_hash,
          activo: true,
        },
        data: { ultimo_acceso_en: new Date() },
      });
      if (current.count !== 1)
        throw new UnauthorizedException(
          'Las credenciales cambiaron. Inicia sesión nuevamente.',
        );
      await tx.sesiones.create({
        data: {
          id: sessionId,
          usuario_id: usuario.id,
          refresh_token_hash: refreshTokenHash,
          ip: metadata.ip && isIP(metadata.ip) ? metadata.ip : null,
          user_agent: metadata.userAgent?.slice(0, 500) ?? null,
          expira_en: expiraEn,
        },
      });
      await tx.auditoria.create({
        data: this.authAuditData('LOGIN_EXITOSO', usuario.id, metadata),
      });
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokenExpirationSeconds,

      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.email,
        telefono: usuario.telefono,
        emailVerificado: usuario.email_verificado_en !== null,
        twoFactorEnabled: usuario.two_factor_enabled,
        rol: {
          id: usuario.roles.id,
          codigo: usuario.roles.codigo,
          nombre: usuario.roles.nombre,
        },
        permisos,
      },
    };
  }

  private async signChallengeToken(
    userId: string,
    expectedPasswordHash: string,
  ): Promise<string> {
    const rawToken = randomBytes(32).toString('base64url');

    await this.prisma.$transaction(async (tx) => {
      // Bloquear sin cambiar la contraseña ni marcar un login aún incompleto.
      // El reset debe invalidar también este desafío si se ejecuta después.
      const current = await tx.usuarios.updateMany({
        where: {
          id: userId,
          password_hash: expectedPasswordHash,
          activo: true,
        },
        data: { password_hash: expectedPasswordHash },
      });
      if (current.count !== 1)
        throw new UnauthorizedException(
          'Las credenciales cambiaron. Inicia sesión nuevamente.',
        );
      await tx.codigos_2fa.create({
        data: {
          usuario_id: userId,
          token_hash: this.hashToken(rawToken),
          tipo: 'LOGIN',
          expira_en: new Date(
            Date.now() + AuthService.challengeExpirationSeconds * 1000,
          ),
        },
      });
    });

    return rawToken;
  }

  private hashResetCode(userId: string, code: string): string {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error('JWT_ACCESS_SECRET is required.');
    return createHmac('sha256', secret)
      .update(`${userId}:${code}`)
      .digest('hex');
  }

  private authAuditData(
    action: string,
    actorId?: string,
    metadata: RequestMetadata = {},
  ) {
    return {
      ...(actorId ? { actor_id: actorId } : {}),
      accion: action,
      entidad: 'auth',
      ...(metadata.ip && isIP(metadata.ip) ? { ip: metadata.ip } : {}),
      ...(metadata.userAgent
        ? { user_agent: metadata.userAgent.slice(0, 500) }
        : {}),
    };
  }

  private async recordAuth(
    action: string,
    actorId?: string,
    metadata: RequestMetadata = {},
  ) {
    await this.prisma.auditoria.create({
      data: this.authAuditData(action, actorId, metadata),
    });
  }

  private get twoFactorEncryptionKey(): string {
    const secret = process.env.TWO_FACTOR_ENCRYPTION_KEY;

    if (!secret) {
      throw new Error('TWO_FACTOR_ENCRYPTION_KEY is required.');
    }

    return secret;
  }

  private encryptSecret(plain: string): string {
    const key = createHash('sha256')
      .update(this.twoFactorEncryptionKey)
      .digest();

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  private decryptSecret(payload: string): string {
    const key = createHash('sha256')
      .update(this.twoFactorEncryptionKey)
      .digest();

    const [ivPart, tagPart, dataPart] = payload.split('.');

    if (!ivPart || !tagPart || !dataPart) {
      throw new Error('Formato de secreto 2FA inválido.');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
