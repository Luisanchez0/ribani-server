import { UnauthorizedException } from '@nestjs/common';
import { Observable, concatMap, ignoreElements, merge, timer } from 'rxjs';
import type { PrismaService } from '../prisma/prisma.service.js';

export interface StreamIdentity {
  id: string;
  sessionId: string;
  accessExpiresAt: number;
}
export function sessionStream<T>(
  source: Observable<T>,
  prisma: PrismaService,
  identity: StreamIdentity,
  permission: string,
  checkObject: (role: string) => Promise<void>,
): Observable<T> {
  const check = async () => {
    if (
      !identity.sessionId ||
      !identity.accessExpiresAt ||
      identity.accessExpiresAt <= Date.now()
    )
      throw new UnauthorizedException('Sesión expirada.');
    const user = await prisma.usuarios.findFirst({
      where: {
        id: identity.id,
        activo: true,
        sesiones: {
          some: {
            id: identity.sessionId,
            revocada_en: null,
            expira_en: { gt: new Date() },
          },
        },
        roles: {
          activo: true,
          rol_permisos: { some: { permisos: { codigo: permission } } },
        },
      },
      select: { roles: { select: { codigo: true } } },
    });
    if (!user) throw new UnauthorizedException('Sesión o permiso revocado.');
    await checkObject(user.roles.codigo);
  };
  return merge(
    source.pipe(
      concatMap(async (value) => {
        await check();
        return value;
      }),
    ),
    timer(30_000, 30_000).pipe(concatMap(check), ignoreElements()),
    timer(Math.max(0, identity.accessExpiresAt - Date.now())).pipe(
      concatMap(async () => {
        throw new UnauthorizedException('Sesión expirada.');
      }),
      ignoreElements(),
    ),
  );
}
