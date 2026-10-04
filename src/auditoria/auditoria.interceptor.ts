import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Observable, tap } from 'rxjs';

import { AuditoriaService } from './auditoria.service.js';

const METODOS_AUDITABLES = new Set(['POST', 'PATCH', 'DELETE']);

/**
 * Registra en auditoria cada mutacion exitosa (2xx) de la API:
 * quien (JWT), que (metodo + ruta), sobre que entidad y desde donde.
 *
 * Exclusiones: /ubicaciones (alta frecuencia, ya cubierta por el
 * dominio) y /auth/refresh (ruido de tokens).
 *
 * Los fallos de auditoria nunca interrumpen la operacion.
 */
@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditoriaInterceptor.name);

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

    if (url.startsWith('/ubicaciones') || url.startsWith('/auth/refresh')) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const userAgent = Array.isArray(request.headers['user-agent'])
            ? request.headers['user-agent'][0]
            : request.headers['user-agent'];

          this.auditoria
            .registrar({
              actorId: request.user?.id ?? null,
              accion: `${request.method} ${request.route?.path ?? url}`,
              entidad: url.split('/').filter(Boolean)[0] ?? 'desconocida',
              entidadId:
                typeof request.params?.id === 'string'
                  ? request.params.id
                  : null,
              ip: request.ip ?? null,
              userAgent: userAgent ?? null,
            })
            .catch((error) =>
              this.logger.warn(`Auditoria omitida: ${String(error)}`),
            );
        },
      }),
    );
  }
}

/** Proveedor para registrar el interceptor globalmente en AppModule. */
export const AUDITORIA_INTERCEPTOR = {
  provide: APP_INTERCEPTOR,
  useClass: AuditoriaInterceptor,
};
