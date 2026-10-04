import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import { AlertasService } from '../alertas/alertas.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { CreateUbicacionDto } from './dto/create-ubicacion.dto.js';

const SELECT_UBICACION = {
  id: true,
  adulto_id: true,
  dispositivo_id: true,
  latitud: true,
  longitud: true,
  precision_metros: true,
  altitud_metros: true,
  fuente: true,
  registrada_en: true,
} as const;

@Injectable()
export class UbicacionesService {
  private readonly canales = new Map<string, Subject<Record<string, unknown>>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertasService: AlertasService,
  ) {}

  private serializar<T extends { id: bigint }>(ubicacion: T) {
    return { ...ubicacion, id: ubicacion.id.toString() };
  }

  async reportar(
    usuarioId: string,
    dto: CreateUbicacionDto,
    dispositivoId?: string,
  ) {
    if (dispositivoId) {
      const dispositivo = await this.prisma.dispositivos.findUnique({
        where: { id: dispositivoId },
        select: { id: true, usuario_id: true, activo: true },
      });

      if (!dispositivo || dispositivo.usuario_id !== usuarioId) {
        throw new ForbiddenException(
          'El dispositivo indicado no pertenece al usuario autenticado.',
        );
      }

      if (!dispositivo.activo) {
        throw new ForbiddenException(
          'El dispositivo indicado está dado de baja.',
        );
      }
    }

    const ubicacion = await this.prisma.ubicaciones.create({
      data: {
        adulto_id: usuarioId,
        ...(dispositivoId ? { dispositivo_id: dispositivoId } : {}),
        latitud: dto.latitud,
        longitud: dto.longitud,
        precision_metros: dto.precision_metros,
        altitud_metros: dto.altitud_metros,
        fuente: dto.fuente ?? 'GPS',
        ...(dto.registrada_en
          ? { registrada_en: new Date(dto.registrada_en) }
          : {}),
      },
      select: SELECT_UBICACION,
    });

    const serializada = this.serializar(ubicacion);

    // Emitir a los paneles conectados vía SSE (ignora errores de canal).
    this.emitir(usuarioId, serializada as unknown as Record<string, unknown>);


    try {
      await this.alertasService.evaluarSalidaZonaSegura(
        usuarioId,
        dto.latitud,
        dto.longitud,
        dispositivoId,
      );
    } catch (error) {
      Logger.warn(
        `No se pudo evaluar la geocerca del adulto ${usuarioId}: ${String(error)}`,
        UbicacionesService.name,
      );
    }

    return serializada;
  }


  async ultima(
    usuarioId: string,
    adultoId: string,
  ) {
    await this.assertPuedeVerUbicacion(usuarioId, adultoId);

    const ubicacion = await this.prisma.ubicaciones.findFirst({
      where: { adulto_id: adultoId },
      select: SELECT_UBICACION,
      orderBy: { registrada_en: 'desc' },
    });

    if (!ubicacion) {
      throw new NotFoundException(
        'El adulto mayor aún no ha reportado ubicación.',
      );
    }

    return this.serializar(ubicacion);
  }

  async historial(
    usuarioId: string,
    adultoId: string,
    options: { desde?: string; hasta?: string; limite?: number },
  ) {
    await this.assertPuedeVerUbicacion(usuarioId, adultoId);

    const { desde, hasta, limite } = options;
    const limiteSeguro = Math.min(Math.max(limite ?? 100, 1), 500);
    const desdeFecha = desde ? new Date(desde) : undefined;
    const hastaFecha = hasta ? new Date(hasta) : undefined;

    if (desde && Number.isNaN(desdeFecha?.getTime())) {
      throw new BadRequestException('desde no es una fecha válida.');
    }

    if (hasta && Number.isNaN(hastaFecha?.getTime())) {
      throw new BadRequestException('hasta no es una fecha válida.');
    }

    const ubicaciones = await this.prisma.ubicaciones.findMany({
      where: {
        adulto_id: adultoId,
        ...(desdeFecha || hastaFecha
          ? {
              registrada_en: {
                ...(desdeFecha ? { gte: desdeFecha } : {}),
                ...(hastaFecha ? { lte: hastaFecha } : {}),
              },
            }
          : {}),
      },
      select: SELECT_UBICACION,
      orderBy: { registrada_en: 'desc' },
      take: limiteSeguro,
    });

    return ubicaciones.map((ubicacion) => this.serializar(ubicacion));
  }

  stream(usuarioId: string, adultoId: string): Observable<MessageEvent> {
    const canal = this.obtenerOCrearCanal(adultoId);

    return new Observable<MessageEvent>((suscriptor) => {
      const cargarInicial = async () => {
        try {
          const inicial = await this.prisma.ubicaciones.findFirst({
            where: { adulto_id: adultoId },
            select: SELECT_UBICACION,
            orderBy: { registrada_en: 'desc' },
          });

          if (inicial) {
            suscriptor.next({
              type: 'ubicacion',
              data: JSON.stringify(this.serializar(inicial)),
            } as MessageEvent);
          }
        } catch {
        }
      };

      void cargarInicial();

      const suscripcion = canal.subscribe({
        next: (ubicacion) => {
          suscriptor.next({
            type: 'ubicacion',
            data: JSON.stringify(ubicacion),
          } as MessageEvent);
        },
      });
      return () => {
        suscripcion.unsubscribe();
        this.liberarCanalSiHuerfano(adultoId);
      };
    });
  }


  async verificarAcceso(usuarioId: string, adultoId: string): Promise<void> {
    await this.assertPuedeVerUbicacion(usuarioId, adultoId);
  }

  private async assertPuedeVerUbicacion(
    usuarioId: string,
    adultoId: string,
  ): Promise<void> {
    if (usuarioId === adultoId) {
      return;
    }

    const vinculo = await this.prisma.adulto_familiares.findFirst({
      where: {
        adulto_id: adultoId,
        familiar_id: usuarioId,
        estado: 'ACTIVA',
        puede_ver_ubicacion: true,
      },
      select: { id: true },
    });

    if (!vinculo) {
      throw new ForbiddenException(
        'No tienes permisos para ver la ubicación de este adulto mayor.',
      );
    }
  }

  private obtenerOCrearCanal(
    adultoId: string,
  ): Subject<Record<string, unknown>> {
    let canal = this.canales.get(adultoId);

    if (!canal) {
      canal = new Subject<Record<string, unknown>>();
      this.canales.set(adultoId, canal);
    }

    return canal;
  }

  private emitir(adultoId: string, ubicacion: Record<string, unknown>): void {
    const canal = this.canales.get(adultoId);

    if (canal) {
      canal.next(ubicacion);
    }
  }

  private liberarCanalSiHuerfano(adultoId: string): void {
    const canal = this.canales.get(adultoId);

    if (canal && canal.observed === false) {
      canal.complete();
      this.canales.delete(adultoId);
    }
  }
}
