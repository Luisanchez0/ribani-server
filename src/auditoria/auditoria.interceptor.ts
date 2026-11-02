import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Observable, catchError, concatMap } from 'rxjs';

import { AuditoriaService } from './auditoria.service.js';

const METODOS_AUDITABLES = new Set(['POST', 'PATCH', 'DELETE']);

@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  constructor(private readonly auditoria: AuditoriaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<{
      method: string;
      originalUrl?: string;
      url: string;
      route?: { path?: string };
      params?: Record<string, string>;
      ip?: string;
      headers: Record<string, string | string[] | undefined>;
      user?: { id?: string };
    }>();

    if (!METODOS_AUDITABLES.has(request.method)) {
      return next.handle();
    }

    const url = (request.originalUrl ?? request.url).split('?')[0];

    if (
      url.startsWith('/ubicaciones') ||
      /^\/auth\/(?:web\/)?(?:login|2fa\/login|refresh|logout|forgot-password|reset-password)$/.test(
        url,
      )
    ) {
      return next.handle();
    }

    const userAgent = Array.isArray(request.headers['user-agent'])
      ? request.headers['user-agent'][0]
      : request.headers['user-agent'];
    const entry = {
      actorId: request.user?.id ?? null,
      accion: `${request.method} ${request.route?.path ?? url}`,
      entidad: url.split('/').filter(Boolean)[0] ?? 'desconocida',
      entidadId:
        typeof request.params?.id === 'string' ? request.params.id : null,
      ip: request.ip ?? null,
      userAgent: userAgent ?? null,
    };
    return next.handle().pipe(
      catchError(async (error: unknown) => {
        await this.auditoria.registrar({
          ...entry,
          accion: `${entry.accion} ERROR`,
        });
        throw error;
      }),
      concatMap(async (response: unknown) => {
        await this.auditoria.registrar(entry);
        return response;
      }),
    );
  }
}

export const AUDITORIA_INTERCEPTOR = {
  provide: APP_INTERCEPTOR,
  useClass: AuditoriaInterceptor,
};
