import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import {
  PERMISSIONS_KEY,
} from '../decorators/permissions.decorator.js';

interface AuthenticatedUser {
  id: string;
  email: string;
  permisos: string[];
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
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(
        PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException(
        'Usuario no autenticado.',
      );
    }

    const userPermissions = user.permisos ?? [];

    const hasAllPermissions = requiredPermissions.every(
      (permission) => userPermissions.includes(permission),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        'No tienes los permisos necesarios para realizar esta acción.',
      );
    }

    return true;
  }
}