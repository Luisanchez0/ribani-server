import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import {
  ROLES_KEY,
} from '../decorators/roles.decorator.js';

interface AuthenticatedUser {
  id: string;
  email: string;
  rol: {
    id: number;
    codigo: string;
    nombre: string;
  };
}

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user?.rol?.codigo) {
      throw new ForbiddenException(
        'El usuario no tiene un rol válido.',
      );
    }

    const hasRole = requiredRoles.includes(user.rol.codigo);

    if (!hasRole) {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta acción.',
      );
    }

    return true;
  }
}