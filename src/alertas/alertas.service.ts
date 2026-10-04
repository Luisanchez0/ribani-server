import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import { PrismaService } from '../prisma/prisma.service.js';

import { CreateAlertaDto } from './dto/create-alerta.dto.js';
import { ResolverAlertaDto } from './dto/resolver-alerta.dto.js';

const SELECT_ALERTA = {
  id: true,
  adulto_id: true,
  dispositivo_id: true,
  tipo: true,
  severidad: true,
  estado: true,
  titulo: true,
  descripcion: true,
  latitud: true,
  longitud: true,
  ocurrida_en: true,
  atendida_por: true,
  atendida_en: true,
  cerrada_en: true,
  created_at: true,
} as const;

const ESTADOS_VALIDOS = ['ABIERTA', 'EN_ATENCION', 'RESUELTA', 'CANCELADA'];

@Injectable()
export class AlertasService {
  /** Canales SSE activos, uno por adulto_id. */
  private readonly canales = new Map<string, Subject<Record<string, unknown>>>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea una alerta. El adulto reporta sobre sí mismo (SOS, caída, etc.);
   * dejar constancia en alerta_eventos y emitir por SSE a los paneles.
   */
  async crear(usuarioId: string, dto: CreateAlertaDto) {
    if (dto.adulto_id && dto.adulto_id !== usuarioId) {
      throw new ForbiddenException('Solo puedes crear alertas para ti mismo.');
    }
    const adultoId = usuarioId;

    let dispositivoId: string | undefined;
    if (dto.dispositivo_id) {
      const dispositivo = await this.prisma.dispositivos.findUnique({
        where: { id: dto.dispositivo_id },
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
      dispositivoId = dto.dispositivo_id;
    }

    const alerta = await this.prisma.alertas.create({
      data: {
        adulto_id: adultoId,
        ...(dispositivoId ? { dispositivo_id: dispositivoId } : {}),
        tipo: dto.tipo,
        severidad: dto.severidad ?? 'MEDIA',
        titulo: dto.titulo,
        ...(dto.descripcion ? { descripcion: dto.descripcion } : {}),
        ...(dto.latitud !== undefined && dto.longitud !== undefined
          ? { latitud: dto.latitud, longitud: dto.longitud }
          : {}),
      },
      select: SELECT_ALERTA,
    });

    await this.registrarEvento({
      alertaId: alerta.id,
      usuarioId,
      evento: 'CREADA',
      detalle: `Alerta ${alerta.tipo} (${alerta.severidad}) creada`,
    });

    // Alertas CRITICA: encolar notificaciones WhatsApp para los
    // destinatarios con consentimiento. Un fallo aquí NO invalida la alerta.
    if (alerta.severidad === 'CRITICA') {
      try {
        const encoladas = await this.encolarNotificacionesCriticas(alerta);
        if (encoladas > 0) {
          await this.registrarEvento({
            alertaId: alerta.id,
            usuarioId,
            evento: 'NOTIFICADA',
            detalle: `${encoladas} notificación(es) WhatsApp encolada(s).`,
          });
        }
      } catch (error) {
        Logger.warn(
          `No se pudieron encolar notificaciones WhatsApp para la alerta ${alerta.id}: ${String(error)}`,
          AlertasService.name,
        );
      }
    }

    this.emitir(adultoId, alerta as unknown as Record<string, unknown>);

    return alerta;
  }

  /**
   * Lista alertas: el admin ve todas (filtros opcionales); los demás ven
   * las de sus adultos con vínculo ACTIVA y las propias.
   */
  async listar(
    usuarioId: string,
    esAdmin: boolean,
    options: { adultoId?: string; estado?: string; limite?: number },
  ) {
    const { adultoId, estado, limite } = options;
    const limiteSeguro = Math.min(Math.max(limite ?? 100, 1), 500);

    if (estado && !ESTADOS_VALIDOS.includes(estado)) {
      throw new BadRequestException(
        `estado debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}.`,
      );
    }

    let adultos: string[] | undefined;

    if (esAdmin) {
      adultos = adultoId ? [adultoId] : undefined;
    } else {
      if (adultoId) {
        await this.assertPuedeVer(usuarioId, false, adultoId);
        adultos = [adultoId];
      } else {
        const vinculos = await this.prisma.adulto_familiares.findMany({
          where: { familiar_id: usuarioId, estado: 'ACTIVA' },
          select: { adulto_id: true },
        });
        adultos = [...new Set([usuarioId, ...vinculos.map((v) => v.adulto_id)])];
      }
    }

    return this.prisma.alertas.findMany({
      where: {
        ...(adultos ? { adulto_id: { in: adultos } } : {}),
        ...(estado ? { estado } : {}),
      },
      select: SELECT_ALERTA,
      orderBy: { ocurrida_en: 'desc' },
      take: limiteSeguro,
    });
  }

  /** Obtiene una alerta con su bitácora de eventos. */
  async obtener(usuarioId: string, esAdmin: boolean, alertaId: string) {
    const alerta = await this.prisma.alertas.findUnique({
      where: { id: alertaId },
      select: SELECT_ALERTA,
    });

    if (!alerta) {
      throw new NotFoundException('Alerta no encontrada.');
    }

    await this.assertPuedeVer(usuarioId, esAdmin, alerta.adulto_id);

    const eventos = await this.prisma.alerta_eventos.findMany({
      where: { alerta_id: alertaId },
      orderBy: { created_at: 'asc' },
    });

    return {
      ...alerta,
      eventos: eventos.map((e) => this.serializarConIdBigInt(e)),
    };
  }

  /**
   * Transición de estado (familiar/admin con vínculo o el propio adulto):
   * ABIERTA → EN_ATENCION → RESUELTA; ABIERTA/EN_ATENCION → CANCELADA.
   */
  async actualizar(
    usuarioId: string,
    esAdmin: boolean,
    alertaId: string,
    dto: ResolverAlertaDto,
  ) {
    const alerta = await this.prisma.alertas.findUnique({
      where: { id: alertaId },
      select: { id: true, adulto_id: true, estado: true, atendida_por: true },
    });

    if (!alerta) {
      throw new NotFoundException('Alerta no encontrada.');
    }

    await this.assertPuedeVer(usuarioId, esAdmin, alerta.adulto_id);

    const transicionesValidas: Record<string, string[]> = {
      ABIERTA: ['EN_ATENCION', 'RESUELTA', 'CANCELADA'],
      EN_ATENCION: ['RESUELTA', 'CANCELADA'],
      RESUELTA: [],
      CANCELADA: [],
    };

    if (!transicionesValidas[alerta.estado]?.includes(dto.estado)) {
      throw new ConflictException(
        `Transición inválida: ${alerta.estado} → ${dto.estado}.`,
      );
    }

    const ahora = new Date();
    const datos: {
      estado: string;
      atendida_por?: string;
      atendida_en?: Date;
      cerrada_en?: Date;
    } = { estado: dto.estado };

    if (dto.estado === 'EN_ATENCION') {
      datos.atendida_por = usuarioId;
      datos.atendida_en = ahora;
    }
    if (dto.estado === 'RESUELTA' || dto.estado === 'CANCELADA') {
      datos.cerrada_en = ahora;
      if (!alerta.atendida_por) {
        datos.atendida_por = usuarioId;
        datos.atendida_en = ahora;
      }
    }

    const actualizada = await this.prisma.alertas.update({
      where: { id: alertaId },
      data: datos,
      select: SELECT_ALERTA,
    });

    const tipoEvento =
      dto.estado === 'CANCELADA'
        ? 'CANCELADA'
        : dto.estado === 'RESUELTA'
          ? 'RESUELTA'
          : 'ACTUALIZADA';

    await this.registrarEvento({
      alertaId,
      usuarioId,
      evento: tipoEvento,
      detalle: dto.detalle ?? `Estado: ${alerta.estado} → ${dto.estado}`,
    });

    this.emitir(alerta.adulto_id, actualizada as unknown as Record<string, unknown>);

    return actualizada;
  }

  /**
   * Stream SSE en tiempo real: el panel se conecta una vez y recibe las
   * alertas abiertas del adulto y cada nueva alerta/cambio en vivo.
   */
  stream(adultoId: string): Observable<MessageEvent> {
    const canal = this.obtenerOCrearCanal(adultoId);

    return new Observable<MessageEvent>((suscriptor) => {
      const cargaInicial = async () => {
        try {
          const abiertas = await this.prisma.alertas.findMany({
            where: {
              adulto_id: adultoId,
              estado: { in: ['ABIERTA', 'EN_ATENCION'] },
            },
            select: SELECT_ALERTA,
            orderBy: { ocurrida_en: 'desc' },
            take: 10,
          });

          suscriptor.next({
            type: 'alerta',
            data: JSON.stringify(abiertas),
          } as MessageEvent);
        } catch {
          // El stream continúa aunque falle la carga inicial.
        }
      };

      void cargaInicial();

      const suscripcion = canal.subscribe({
        next: (alerta) => {
          suscriptor.next({
            type: 'alerta',
            data: JSON.stringify(alerta),
          } as MessageEvent);
        },
      });

      return () => {
        suscripcion.unsubscribe();
        this.liberarCanalSiHuerfano(adultoId);
      };
    });
  }

  /** Autorización para ver alertas del adulto (403 si no procede). */
  async verificarAcceso(
    usuarioId: string,
    esAdmin: boolean,
    adultoId: string,
  ): Promise<void> {
    await this.assertPuedeVer(usuarioId, esAdmin, adultoId);
  }

  private async assertPuedeVer(
    usuarioId: string,
    esAdmin: boolean,
    adultoId: string,
  ): Promise<void> {
    if (esAdmin || usuarioId === adultoId) {
      return;
    }

    const vinculo = await this.prisma.adulto_familiares.findFirst({
      where: {
        adulto_id: adultoId,
        familiar_id: usuarioId,
        estado: 'ACTIVA',
      },
      select: { id: true },
    });

    if (!vinculo) {
      throw new ForbiddenException(
        'No tienes permisos para ver las alertas de este adulto mayor.',
      );
    }
  }

  /**
   * Encola notificaciones WhatsApp para una alerta CRITICA en
   * notificaciones_whatsapp (estado EN_COLA). El envío real lo hará el
   * worker/proveedor (Meta Cloud API) — aquí solo se deja la cola.
   *
   * Destinatarios (opt-in: activo + consentimiento ACEPTADO):
   *  1. WhatsApp ligado a los contactos de emergencia del adulto.
   *  2. WhatsApp ligado a los familiares con vínculo ACTIVA.
   *
   * Devuelve la cantidad de notificaciones creadas.
   */
  private async encolarNotificacionesCriticas(alerta: {
    id: string;
    adulto_id: string;
    tipo: string;
    titulo: string;
    ocurrida_en: Date;
  }): Promise<number> {
    // 1) Destinatarios vía contactos de emergencia del adulto.
    const contactos = await this.prisma.contactos_emergencia.findMany({
      where: { adulto_id: alerta.adulto_id, activo: true },
      select: { id: true },
    });

    const porContacto = contactos.length
      ? await this.prisma.whatsapp_destinatarios.findMany({
          where: {
            contacto_emergencia_id: { in: contactos.map((c) => c.id) },
            activo: true,
            consentimiento: 'ACEPTADO',
          },
          select: { id: true },
        })
      : [];

    // 2) Destinatarios vía familiares vinculados ACTIVA.
    const vinculados = await this.prisma.adulto_familiares.findMany({
      where: { adulto_id: alerta.adulto_id, estado: 'ACTIVA' },
      select: { familiar_id: true },
    });

    const porFamiliar = vinculados.length
      ? await this.prisma.whatsapp_destinatarios.findMany({
          where: {
            usuario_id: { in: vinculados.map((v) => v.familiar_id) },
            activo: true,
            consentimiento: 'ACEPTADO',
          },
          select: { id: true },
        })
      : [];

    // Deduplicar (alguien podría aparecer por ambas vías).
    const destinatarioIds = [
      ...new Set([...porContacto, ...porFamiliar].map((d) => d.id)),
    ];
    if (destinatarioIds.length === 0) {
      return 0;
    }

    const adulto = await this.prisma.usuarios.findUnique({
      where: { id: alerta.adulto_id },
      select: { nombre: true, apellido: true },
    });

    // Parámetros ordenados para la plantilla de Meta Cloud API.
    const parametros = [
      adulto ? `${adulto.nombre} ${adulto.apellido ?? ''}`.trim() : 'Adulto mayor',
      alerta.tipo,
      alerta.titulo,
      alerta.ocurrida_en.toISOString(),
    ];

    const resultado = await this.prisma.notificaciones_whatsapp.createMany({
      data: destinatarioIds.map((destinatarioId) => ({
        destinatario_id: destinatarioId,
        alerta_id: alerta.id,
        // El CHECK admite SOS | ALERTA | MEDICAMENTO | PRUEBA | OTRA.
        tipo: alerta.tipo === 'SOS' ? 'SOS' : 'ALERTA',
        plantilla: 'alerta_critica',
        parametros,
      })),
    });

    return resultado.count;
  }

  /**
   * Evaluación de geocerca, invocada en cada reporte de ubicación:
   *
   *  - Si el adulto está FUERA de todas sus zonas seguras activas y la
   *    familia monitorea salidas (notificar_salida), crea UNA alerta
   *    ZONA_SEGURA CRITICA por episodio (reutiliza crear(): bitácora,
   *    SSE y cola de WhatsApp). No duplica si ya hay una abierta.
   *  - Si regresa dentro de alguna zona, cierra automáticamente la
   *    alerta abierta (RESUELTA, cierre automático).
   *
   * Devuelve los ids involucrados; nunca lanza (el llamador loguea).
   */
  async evaluarSalidaZonaSegura(
    adultoId: string,
    latitud: number,
    longitud: number,
    dispositivoId?: string,
  ): Promise<{ alertaCreada?: string; alertaCerrada?: string }> {
    const zonas = await this.prisma.zonas_seguras.findMany({
      where: { adulto_id: adultoId, activa: true },
      select: {
        id: true,
        nombre: true,
        latitud_centro: true,
        longitud_centro: true,
        radio_metros: true,
        notificar_salida: true,
      },
    });

    if (zonas.length === 0) {
      return {};
    }

    const distancias = zonas.map((zona) => ({
      nombre: zona.nombre,
      radio: zona.radio_metros,
      distancia: this.distanciaMetros(
        latitud,
        longitud,
        Number(zona.latitud_centro),
        Number(zona.longitud_centro),
      ),
    }));
    const dentroDeAlguna = distancias.some((d) => d.distancia <= d.radio);
    const masCercana = distancias.reduce((a, b) =>
      b.distancia < a.distancia ? b : a,
    );

    const abierta = await this.prisma.alertas.findFirst({
      where: {
        adulto_id: adultoId,
        tipo: 'ZONA_SEGURA',
        estado: { in: ['ABIERTA', 'EN_ATENCION'] },
      },
      select: { id: true },
    });

    // Regreso a zona segura: cierre automático de la alerta abierta.
    if (dentroDeAlguna) {
      if (abierta) {
        await this.actualizar(adultoId, true, abierta.id, {
          estado: 'RESUELTA',
          detalle: `Regresó a la zona segura '${masCercana.nombre}' (cierre automático).`,
        });
        return { alertaCerrada: abierta.id };
      }
      return {};
    }

    // Fuera de todas las zonas: alertar solo si la familia lo monitorea
    // y no hay ya una alerta abierta para este episodio.
    const monitoreadas = zonas.filter((zona) => zona.notificar_salida);
    if (monitoreadas.length === 0 || abierta) {
      return {};
    }

    const alerta = await this.crear(adultoId, {
      tipo: 'ZONA_SEGURA',
      severidad: 'CRITICA',
      titulo: 'Salida de zona segura',
      descripcion: `El adulto está fuera de todas sus zonas seguras. La más cercana es '${masCercana.nombre}' a ${Math.round(masCercana.distancia)} m (radio ${masCercana.radio} m).`,
      latitud,
      longitud,
      ...(dispositivoId ? { dispositivo_id: dispositivoId } : {}),
    });

    return { alertaCreada: alerta.id };
  }

  /** Distancia haversine en metros entre dos coordenadas. */
  private distanciaMetros(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const radioTierra = 6_371_000;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return radioTierra * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private async registrarEvento(input: {
    alertaId: string;
    usuarioId: string;
    evento: string;
    detalle?: string;
  }) {
    return this.prisma.alerta_eventos.create({
      data: {
        alerta_id: input.alertaId,
        usuario_id: input.usuarioId,
        evento: input.evento,
        detalle: input.detalle,
      },
    });
  }

  private emitir(adultoId: string, alerta: Record<string, unknown>): void {
    const canal = this.canales.get(adultoId);
    if (canal) {
      canal.next(alerta);
    }
  }

  /** El id de alerta_eventos es BigInt: se serializa a string para JSON. */
  private serializarConIdBigInt<T extends { id: bigint }>(evento: T) {
    return { ...evento, id: evento.id.toString() };
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

  private liberarCanalSiHuerfano(adultoId: string): void {
    const canal = this.canales.get(adultoId);
    if (canal && canal.observed === false) {
      canal.complete();
      this.canales.delete(adultoId);
    }
  }
}
