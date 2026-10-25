import 'dotenv/config';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../prisma/prisma.service.js';

export interface JwtPayload {
  sub: string;
  /** Identificador de la sesión persistida: permite revocar el access token. */
  sid: string;
  exp?: number;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const secret = process.env.JWT_ACCESS_SECRET;

    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is required.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      !payload ||
      !uuid.test(payload.sub ?? '') ||
      !uuid.test(payload.sid ?? '')
    ) {
      throw new UnauthorizedException(
        'Sesión inválida. Inicia sesión nuevamente.',
      );
    }
    const session = await this.prisma.sesiones.findFirst({
      where: {
        id: payload.sid,
        usuario_id: payload.sub,
        revocada_en: null,
        expira_en: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!session)
      throw new UnauthorizedException(
        'La sesión ha expirado o ha sido revocada.',
      );
    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id: payload.sub,
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
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    if (!usuario.activo) {
      throw new UnauthorizedException('Usuario inactivo.');
    }

    if (!usuario.roles.activo) {
      throw new UnauthorizedException('Rol inactivo.');
    }

    return {
      id: usuario.id,
      sessionId: session.id,
      accessExpiresAt: (payload.exp ?? 0) * 1000,
      email: usuario.email,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
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
}
