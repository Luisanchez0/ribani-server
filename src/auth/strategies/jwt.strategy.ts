import 'dotenv/config';

import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../prisma/prisma.service.js';

export interface JwtPayload {
  sub: string;
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
    });
  }

  async validate(payload: JwtPayload) {
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