import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

export interface RegistrarAuditoriaInput {
  actorId?: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  datosDespues?: unknown;
}

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un evento de auditoria. Nunca lanza hacia el llamador
   * (los fallos se registran en el log del servidor): la auditoria
   * no debe interrumpir la operacion del negocio.
   */
  async registrar(input: RegistrarAuditoriaInput): Promise<void> {
    try {
      await this.prisma.auditoria.create({
        data: {
          ...(input.actorId ? { actor_id: input.actorId } : {}),
          accion: input.accion,
          entidad: input.entidad,
          ...(input.entidadId ? { entidad_id: input.entidadId } : {}),
          ...(input.ip ? { ip: input.ip } : {}),
          ...(input.userAgent ? { user_agent: input.userAgent } : {}),
          ...(input.datosDespues !== undefined
            ? { datos_despues: input.datosDespues as object }
            : {}),
        },
      });
    } catch (error) {
      console.error('No se pudo registrar la auditoria:', String(error));
    }
  }

  /** Consulta paginada de eventos: quien hizo que, cuando y desde donde. */
  async listar(options: {
    actorId?: string;
    entidad?: string;
    entidadId?: string;
    accion?: string;
    desde?: string;
    hasta?: string;
    limite?: number;
  }) {
    const { actorId, entidad, entidadId, accion, desde, hasta, limite } =
      options;
    const limiteSeguro = Math.min(Math.max(limite ?? 50, 1), 200);

    const desdeFecha = desde ? new Date(desde) : undefined;
    const hastaFecha = hasta ? new Date(hasta) : undefined;

    if (desde && Number.isNaN(desdeFecha?.getTime())) {
      throw new BadRequestException('desde no es una fecha valida.');
    }
    if (hasta && Number.isNaN(hastaFecha?.getTime())) {
      throw new BadRequestException('hasta no es una fecha valida.');
    }

    const eventos = await this.prisma.auditoria.findMany({
      where: {
        ...(actorId ? { actor_id: actorId } : {}),
        ...(entidad ? { entidad } : {}),
        ...(entidadId ? { entidad_id: entidadId } : {}),
        ...(accion ? { accion: { contains: accion } } : {}),
        ...(desdeFecha || hastaFecha
          ? {
              created_at: {
                ...(desdeFecha ? { gte: desdeFecha } : {}),
                ...(hastaFecha ? { lte: hastaFecha } : {}),
              },
            }
          : {}),
      },
      orderBy: { created_at: 'desc' },
      take: limiteSeguro,
    });

    // El id es BigInt: se serializa a string para JSON.
    return eventos.map((e) => ({ ...e, id: e.id.toString() }));
  }
}
