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
  randomBytes,
} from 'node:crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';

import { PrismaService } from '../prisma/prisma.service.js';
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
    }    const rolCodigo = dto.rolCodigo ?? 'ADULTO_MAYOR';

    const role = await this.prisma.roles.findUnique({
      where: {
        codigo: rolCodigo,
      },
    });

    if (!role || !role.activo) {
      throw new ConflictException(
        `El rol ${rolCodigo} no está disponible.`,
      );
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

  async login(
    dto: LoginDto,
    metadata: RequestMetadata = {},
  ) {
    const email = dto.email.trim().toLowerCase();

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

    if (!usuario) {
      throw new UnauthorizedException(
        'Correo o contraseña incorrectos.',
      );
    }

    if (!usuario.activo) {
      throw new UnauthorizedException(
        'La cuenta se encuentra desactivada.',
      );
    }

    if (!usuario.roles.activo) {
      throw new UnauthorizedException(
        'El rol del usuario se encuentra desactivado.',
      );
    }

    const passwordValid = await bcrypt.compare(
      dto.password,
      usuario.password_hash,
    );

    if (!passwordValid) {
      throw new UnauthorizedException(
        'Correo o contraseña incorrectos.',
      );
    }

    if (usuario.two_factor_enabled && usuario.two_factor_secret) {
      const challengeToken =
        await this.signChallengeToken(usuario.id);

      return {
        twoFactorRequired: true,
        challengeToken,
        expiresIn:
          AuthService.challengeExpirationSeconds,
      };
    }

    return this.issueTokens(usuario, metadata);
  }

  async refresh(
    dto: RefreshTokenDto,
    metadata: RequestMetadata = {},
  ) {
    const refreshTokenHash = this.hashToken(
      dto.refreshToken,
    );

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
      throw new UnauthorizedException(
        'Refresh token inválido.',
      );
    }

    if (session.revocada_en) {
      throw new UnauthorizedException(
        'La sesión ha sido revocada.',
      );
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

      throw new UnauthorizedException(
        'La sesión ha expirado.',
      );
    }

    const usuario = session.usuarios;

    if (!usuario.activo) {
      throw new UnauthorizedException(
        'La cuenta se encuentra desactivada.',
      );
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
      email: usuario.email,
      role: usuario.roles.codigo,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const newRefreshToken = this.generateRefreshToken();
    const newRefreshTokenHash =
      this.hashToken(newRefreshToken);

    const newExpiration = new Date(
      Date.now() +
        this.refreshTokenExpirationSeconds * 1000,
    );

    await this.prisma.sesiones.update({
      where: {
        id: session.id,
      },
      data: {
        refresh_token_hash: newRefreshTokenHash,
        expira_en: newExpiration,
        ip: metadata.ip ?? session.ip,
        user_agent:
          metadata.userAgent ?? session.user_agent,
      },
    });

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
        emailVerificado:
          usuario.email_verificado_en !== null,
        rol: {
          id: usuario.roles.id,
          codigo: usuario.roles.codigo,
          nombre: usuario.roles.nombre,
        },
        permisos,
      },
    };
  }

  async logout(dto: RefreshTokenDto) {
    const refreshTokenHash = this.hashToken(
      dto.refreshToken,
    );

    const session = await this.prisma.sesiones.findUnique({
      where: {
        refresh_token_hash: refreshTokenHash,
      },
    });

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
      throw new UnauthorizedException(
        'Usuario no encontrado o inactivo.',
      );
    }

    return {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      telefono: usuario.telefono,
      emailVerificado:
        usuario.email_verificado_en !== null,
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

  private generateRefreshToken(): string {
    return randomBytes(64).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256')
      .update(token)
      .digest('hex');
  }

  async loginWithTwoFactor(
    dto: TwoFactorLoginDto,
    metadata: RequestMetadata = {},
  ) {
    const tokenHash = this.hashToken(dto.challengeToken);

    const challenge = await this.prisma.codigos_2fa.findUnique({
      where: {
        token_hash: tokenHash,
      },
    });

    if (!challenge || challenge.usado_en) {
      throw new UnauthorizedException(
        'Desafío 2FA inválido.',
      );
    }

    if (challenge.expira_en <= new Date()) {
      throw new UnauthorizedException(
        'El desafío 2FA ha expirado. Inicia sesión nuevamente.',
      );
    }

    if (
      challenge.intentos >=
      AuthService.maxChallengeAttempts
    ) {
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
      !usuario.two_factor_enabled ||
      !usuario.two_factor_secret
    ) {
      throw new UnauthorizedException(
        'Desafío 2FA inválido.',
      );
    }

    const secret = this.decryptSecret(
      usuario.two_factor_secret,
    );

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

      throw new UnauthorizedException(
        'Código 2FA incorrecto.',
      );
    }

    await this.prisma.codigos_2fa.update({
      where: {
        id: challenge.id,
      },
      data: {
        usado_en: new Date(),
      },
    });

    return this.issueTokens(usuario, metadata);
  }

  async setupTwoFactor(userId: string) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id: userId,
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException(
        'Usuario no encontrado o inactivo.',
      );
    }

    if (usuario.two_factor_enabled) {
      throw new ConflictException(
        'El 2FA ya está habilitado en esta cuenta.',
      );
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

  async verifyTwoFactor(
    userId: string,
    dto: VerifyTwoFactorDto,
  ) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id: userId,
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException(
        'Usuario no encontrado o inactivo.',
      );
    }

    if (!usuario.two_factor_secret) {
      throw new BadRequestException(
        'Solicita primero la configuración con POST /auth/2fa/setup.',
      );
    }

    if (usuario.two_factor_enabled) {
      throw new ConflictException(
        'El 2FA ya está habilitado en esta cuenta.',
      );
    }

    const secret = this.decryptSecret(
      usuario.two_factor_secret,
    );

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

  async disableTwoFactor(
    userId: string,
    dto: DisableTwoFactorDto,
  ) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id: userId,
      },
    });

    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException(
        'Usuario no encontrado o inactivo.',
      );
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
      throw new UnauthorizedException(
        'Contraseña incorrecta.',
      );
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
    const target = await this.assertCanAssistTwoFactor(
      caller,
      targetId,
    );

    if (target.two_factor_enabled) {
      throw new ConflictException(
        'El 2FA ya está habilitado en esta cuenta.',
      );
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
    const target = await this.assertCanAssistTwoFactor(
      caller,
      targetId,
    );

    if (!target.two_factor_secret) {
      throw new BadRequestException(
        'No hay configuración 2FA pendiente. Genera el código QR primero.',
      );
    }

    if (target.two_factor_enabled) {
      throw new ConflictException(
        'El 2FA ya está habilitado en esta cuenta.',
      );
    }

    const secret = this.decryptSecret(
      target.two_factor_secret,
    );

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
      mensaje:
        '2FA habilitado correctamente para el adulto mayor.',
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
      throw new NotFoundException(
        'Usuario no encontrado o inactivo.',
      );
    }

    if (target.roles.codigo !== 'ADULTO_MAYOR') {
      throw new BadRequestException(
        'El 2FA asistido solo aplica a cuentas con rol ADULTO_MAYOR.',
      );
    }

    if (caller.rolCodigo !== 'ADMINISTRADOR') {
      const vinculo =
        await this.prisma.adulto_familiares.findFirst({
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

    const payload: JwtPayload = {
      sub: usuario.id,
      email: usuario.email,
      role: usuario.roles.codigo,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const refreshToken = this.generateRefreshToken();
    const refreshTokenHash = this.hashToken(refreshToken);

    const expiraEn = new Date(
      Date.now() +
        this.refreshTokenExpirationSeconds * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.sesiones.create({
        data: {
          usuario_id: usuario.id,
          refresh_token_hash: refreshTokenHash,
          ip: metadata.ip ?? null,
          user_agent: metadata.userAgent ?? null,
          expira_en: expiraEn,
        },
      }),

      this.prisma.usuarios.update({
        where: {
          id: usuario.id,
        },
        data: {
          ultimo_acceso_en: new Date(),
        },
      }),
    ]);

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
  ): Promise<string> {
    const rawToken = randomBytes(32).toString('base64url');

    await this.prisma.codigos_2fa.create({
      data: {
        usuario_id: userId,
        token_hash: this.hashToken(rawToken),
        tipo: 'LOGIN',
        expira_en: new Date(
          Date.now() +
            AuthService.challengeExpirationSeconds * 1000,
        ),
      },
    });

    return rawToken;
  }

  private get twoFactorEncryptionKey(): string {
    const secret = process.env.TWO_FACTOR_ENCRYPTION_KEY;

    if (!secret) {
      throw new Error(
        'TWO_FACTOR_ENCRYPTION_KEY is required.',
      );
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