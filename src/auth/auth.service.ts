import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/registrer.dto.js';
import { JwtPayload } from './strategies/jwt.strategy.js';

interface RequestMetadata {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly accessTokenExpirationSeconds = Number(
    process.env.JWT_ACCESS_EXPIRES_IN_SECONDS ?? 900,
  );

  private readonly refreshTokenExpirationSeconds = Number(
    process.env.JWT_REFRESH_EXPIRES_IN_SECONDS ?? 604800,
  );

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
    }

    const role = await this.prisma.roles.findUnique({
      where: {
        codigo: 'ADULTO_MAYOR',
      },
    });

    if (!role || !role.activo) {
      throw new ConflictException(
        'El rol ADULTO_MAYOR no está disponible.',
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
        rol: {
          id: usuario.roles.id,
          codigo: usuario.roles.codigo,
          nombre: usuario.roles.nombre,
        },
        permisos,
      },
    };
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
}