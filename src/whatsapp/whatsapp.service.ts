import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MetaWhatsappService } from './meta-whatsapp.service.js';
import type {
  ConsentimientoWhatsappDto,
  PreferenciasWhatsappDto,
  RegistrarDestinatarioDto,
} from './dto/whatsapp.dto.js';

export const SELECT_DESTINATARIO = {
  id: true,
  usuario_id: true,
  contacto_emergencia_id: true,
  telefono_e164: true,
  nombre: true,
  consentimiento: true,
  consentimiento_origen: true,
  consentimiento_en: true,
  revocado_en: true,
  activo: true,
} as const;
export const telefonoPerfil = (value: string | null | undefined) =>
  (value ?? '').replace(/[\s()-]/g, '');
export const idiomaWhatsapp = () =>
  process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'es_MX';

@Injectable()
export class WhatsappService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meta: MetaWhatsappService,
  ) {}

  integracion() {
    return {
      habilitada: this.meta.disponible(),
      procesador_habilitado: process.env.WHATSAPP_WORKER_ENABLED === 'true',
      recordatorios_habilitados:
        process.env.WHATSAPP_REMINDERS_ENABLED === 'true',
      prueba_configurada: Boolean(process.env.WHATSAPP_TEST_TEMPLATE),
    };
  }

  listar(usuarioId: string, admin: boolean) {
    return this.prisma.whatsapp_destinatarios.findMany({
      where: admin ? {} : { usuario_id: usuarioId },
      select: SELECT_DESTINATARIO,
      orderBy: { created_at: 'desc' },
      take: 200,
    });
  }

  async registrar(
    usuarioId: string,
    admin: boolean,
    dto: RegistrarDestinatarioDto,
  ) {
    let nombre: string;
    let usuario: string | undefined;
    if (dto.contacto_emergencia_id) {
      if (!admin)
        throw new ForbiddenException(
          'El alta de contactos WhatsApp requiere administrador.',
        );
      const contacto = await this.prisma.contactos_emergencia.findUnique({
        where: { id: dto.contacto_emergencia_id },
      });
      if (
        !contacto?.activo ||
        telefonoPerfil(contacto.telefono) !== dto.telefono_e164
      )
        throw new BadRequestException(
          'El teléfono debe coincidir con el contacto activo en formato E.164.',
        );
      nombre = contacto.nombre;
    } else {
      const perfil = await this.prisma.usuarios.findUnique({
        where: { id: usuarioId },
        select: { telefono: true, nombre: true, activo: true },
      });
      if (
        !perfil?.activo ||
        telefonoPerfil(perfil.telefono) !== dto.telefono_e164
      )
        throw new BadRequestException(
          'Guarda primero este teléfono en tu perfil en formato internacional E.164.',
        );
      nombre = perfil.nombre;
      usuario = usuarioId;
    }
    try {
      return await this.prisma.whatsapp_destinatarios.create({
        data: {
          telefono_e164: dto.telefono_e164,
          nombre,
          usuario_id: usuario,
          contacto_emergencia_id: dto.contacto_emergencia_id,
          consentimiento: 'PENDIENTE',
        },
        select: SELECT_DESTINATARIO,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException(
          'El número ya está registrado; administra su consentimiento desde el registro existente.',
        );
      throw error;
    }
  }

  async consentimiento(
    usuarioId: string,
    admin: boolean,
    id: string,
    dto: ConsentimientoWhatsappDto,
  ) {
    const destino = await this.prisma.whatsapp_destinatarios.findUnique({
      where: { id },
    });
    if (!destino) throw new NotFoundException('Destinatario no encontrado.');
    const propio =
      destino.usuario_id === usuarioId && !destino.contacto_emergencia_id;
    if (!propio && !admin)
      throw new ForbiddenException(
        'El consentimiento solo lo declara su titular.',
      );
    if (dto.aceptado) {
      if (destino.usuario_id && !propio)
        throw new ForbiddenException(
          'Cada usuario debe aceptar su propio consentimiento.',
        );
      if (!propio && (!destino.contacto_emergencia_id || !dto.origen))
        throw new BadRequestException(
          'Registra el origen de la evidencia externa del consentimiento del contacto.',
        );
      if (!(await this.destinatarioVigente(id)))
        throw new BadRequestException(
          'El teléfono ya no coincide con el perfil o contacto activo.',
        );
    }
    return this.prisma.$transaction(
      async (tx) => {
        // Comparte el bloqueo con el alta de pruebas para serializar la revocación.
        await tx.$queryRaw`SELECT id FROM whatsapp_destinatarios WHERE id = ${id}::uuid FOR UPDATE`;
        const actualizado = await tx.whatsapp_destinatarios.update({
          where: { id },
          data: {
            consentimiento: dto.aceptado ? 'ACEPTADO' : 'REVOCADO',
            consentimiento_origen: propio
              ? 'WEB'
              : (dto.origen ?? destino.consentimiento_origen),
            ...(dto.aceptado
              ? {
                  consentimiento_en: new Date(),
                  revocado_en: null,
                  activo: true,
                }
              : { revocado_en: new Date() }),
            updated_at: new Date(),
          },
          select: SELECT_DESTINATARIO,
        });
        if (!dto.aceptado)
          await tx.notificaciones_whatsapp.updateMany({
            where: {
              destinatario_id: id,
              estado: { in: ['EN_COLA', 'FALLIDA'] },
              proveedor_message_id: null,
            },
            data: {
              estado: 'CANCELADA',
              siguiente_intento_en: null,
              updated_at: new Date(),
            },
          });
        return actualizado;
      },
      { timeout: 25_000 },
    );
  }

  async destinatarioVigente(
    id: string,
    db: Pick<PrismaService, 'whatsapp_destinatarios'> = this.prisma,
  ): Promise<boolean> {
    const d = await db.whatsapp_destinatarios.findUnique({
      where: { id },
      include: {
        usuarios: { select: { activo: true, telefono: true } },
        contactos_emergencia: { select: { activo: true, telefono: true } },
      },
    });
    if (
      !d ||
      !d.activo ||
      Boolean(d.usuario_id) === Boolean(d.contacto_emergencia_id)
    )
      return false;
    const fuente = d.usuario_id ? d.usuarios : d.contactos_emergencia;
    return Boolean(
      fuente?.activo && telefonoPerfil(fuente.telefono) === d.telefono_e164,
    );
  }

  async prueba(usuarioId: string, admin: boolean, id: string) {
    if (!this.meta.disponible() || !process.env.WHATSAPP_TEST_TEMPLATE)
      throw new ServiceUnavailableException(
        'Configura Meta y una plantilla de prueba sin parámetros antes de encolar.',
      );
    const destino = await this.prisma.whatsapp_destinatarios.findUnique({
      where: { id },
    });
    if (!destino || (!admin && destino.usuario_id !== usuarioId))
      throw new ForbiddenException('No puedes enviar a ese destinatario.');
    if (!(await this.destinatarioVigente(id)))
      throw new BadRequestException('Destinatario no vigente.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM whatsapp_destinatarios WHERE id = ${id}::uuid FOR UPDATE`;
      const actual = await tx.whatsapp_destinatarios.findUnique({
        where: { id },
      });
      if (!actual?.activo || actual.consentimiento !== 'ACEPTADO')
        throw new BadRequestException('Se necesita consentimiento aceptado.');
      const reciente = await tx.notificaciones_whatsapp.findFirst({
        where: {
          destinatario_id: id,
          tipo: 'PRUEBA',
          created_at: { gte: new Date(Date.now() - 60_000) },
        },
      });
      if (reciente)
        throw new ConflictException('Espera un minuto entre pruebas.');
      const n = await tx.notificaciones_whatsapp.create({
        data: {
          destinatario_id: id,
          tipo: 'PRUEBA',
          plantilla: process.env.WHATSAPP_TEST_TEMPLATE!,
          idioma: idiomaWhatsapp(),
          parametros: [],
        },
      });
      return this.serializarNotificacion({
        ...n,
        whatsapp_estados_proveedor: [],
      });
    });
  }

  async historial(usuarioId: string, admin: boolean) {
    const filas = await this.prisma.notificaciones_whatsapp.findMany({
      where: admin ? {} : { whatsapp_destinatarios: { usuario_id: usuarioId } },
      orderBy: { created_at: 'desc' },
      take: 100,
      include: {
        whatsapp_estados_proveedor: {
          orderBy: { ocurrido_en: 'desc' },
          take: 20,
        },
      },
    });
    return filas.map((n) => this.serializarNotificacion(n));
  }

  async resumenAlertas(usuarioId: string, admin: boolean) {
    const vinculos = admin
      ? []
      : await this.prisma.adulto_familiares.findMany({
          where: { familiar_id: usuarioId, estado: 'ACTIVA' },
          select: { adulto_id: true },
        });
    const grupos = await this.prisma.notificaciones_whatsapp.groupBy({
      by: ['alerta_id', 'estado'],
      where: {
        alerta_id: { not: null },
        ...(admin
          ? {}
          : {
              alertas: {
                adulto_id: {
                  in: [usuarioId, ...vinculos.map((v) => v.adulto_id)],
                },
              },
            }),
      },
      _count: { _all: true },
    });
    return grupos.map((g) => ({
      alerta_id: g.alerta_id!,
      estado: g.estado,
      cantidad: g._count._all,
    }));
  }

  private serializarNotificacion(n: {
    id: string;
    destinatario_id: string;
    alerta_id: string | null;
    toma_id: string | null;
    tipo: string;
    estado: string;
    intentos: number;
    created_at: Date;
    codigo_error: string | null;
    siguiente_intento_en: Date | null;
    whatsapp_estados_proveedor: {
      id: bigint;
      estado: string;
      ocurrido_en: Date;
      codigo_error: string | null;
    }[];
  }) {
    return {
      id: n.id,
      destinatario_id: n.destinatario_id,
      alerta_id: n.alerta_id,
      toma_id: n.toma_id,
      tipo: n.tipo,
      estado: n.estado,
      intentos: n.intentos,
      created_at: n.created_at,
      codigo_error: n.codigo_error,
      siguiente_intento_en: n.siguiente_intento_en,
      eventos: n.whatsapp_estados_proveedor.map((e) => ({
        id: String(e.id),
        estado: e.estado,
        ocurrido_en: e.ocurrido_en,
        codigo_error: e.codigo_error,
      })),
    };
  }

  async accesoAdulto(
    usuarioId: string,
    admin: boolean,
    adultoId: string,
    escritura = false,
  ) {
    const adulto = await this.prisma.usuarios.findUnique({
      where: { id: adultoId },
      select: { activo: true, roles: { select: { codigo: true } } },
    });
    if (!adulto?.activo || adulto.roles.codigo !== 'ADULTO_MAYOR')
      throw new NotFoundException('Adulto mayor activo no encontrado.');
    if (admin || usuarioId === adultoId) return;
    const vinculo = await this.prisma.adulto_familiares.findFirst({
      where: {
        adulto_id: adultoId,
        familiar_id: usuarioId,
        estado: 'ACTIVA',
        ...(escritura ? { puede_gestionar_medicamentos: true } : {}),
      },
      select: { id: true },
    });
    if (!vinculo)
      throw new ForbiddenException(
        'Se requiere un vínculo activo y permiso para administrar recordatorios.',
      );
  }

  async preferencias(usuarioId: string, admin: boolean, adultoId: string) {
    await this.accesoAdulto(usuarioId, admin, adultoId);
    const c = await this.prisma.configuracion_adulto.findUnique({
      where: { adulto_id: adultoId },
    });
    return {
      adulto_id: adultoId,
      notificaciones_habilitadas: c?.notificaciones_habilitadas ?? true,
      recordatorio_medicamentos: c?.recordatorio_medicamentos ?? true,
      minutos_repeticion: c?.minutos_repeticion ?? 10,
      max_repeticiones: c?.max_repeticiones ?? 3,
    };
  }

  async guardarPreferencias(
    usuarioId: string,
    admin: boolean,
    adultoId: string,
    dto: PreferenciasWhatsappDto,
  ) {
    await this.accesoAdulto(usuarioId, admin, adultoId, true);
    if (
      !admin &&
      usuarioId !== adultoId &&
      dto.notificaciones_habilitadas !== undefined
    ) {
      const actual = await this.prisma.configuracion_adulto.findUnique({
        where: { adulto_id: adultoId },
      });
      if (
        dto.notificaciones_habilitadas !==
        (actual?.notificaciones_habilitadas ?? true)
      ) {
        throw new ForbiddenException(
          'El permiso de medicamentos no permite cambiar las notificaciones generales del adulto.',
        );
      }
    }
    const datos = {
      notificaciones_habilitadas:
        admin || usuarioId === adultoId
          ? dto.notificaciones_habilitadas
          : undefined,
      recordatorio_medicamentos: dto.recordatorio_medicamentos,
      minutos_repeticion: dto.minutos_repeticion,
      max_repeticiones: dto.max_repeticiones,
    };
    await this.prisma.configuracion_adulto.upsert({
      where: { adulto_id: adultoId },
      create: { adulto_id: adultoId, ...datos },
      update: { ...datos, updated_at: new Date() },
    });
    return this.preferencias(usuarioId, admin, adultoId);
  }

  async destinatariosAlerta(adultoId: string) {
    const vinculos = await this.prisma.adulto_familiares.findMany({
      where: { adulto_id: adultoId, estado: 'ACTIVA' },
      select: { familiar_id: true },
    });
    return this.prisma.whatsapp_destinatarios.findMany({
      where: {
        activo: true,
        consentimiento: 'ACEPTADO',
        OR: [
          {
            contacto_emergencia_id: { not: null },
            usuario_id: null,
            contactos_emergencia: { adulto_id: adultoId, activo: true },
          },
          {
            usuario_id: { in: vinculos.map((v) => v.familiar_id) },
            contacto_emergencia_id: null,
            usuarios: { activo: true },
          },
        ],
      },
      select: { id: true },
    });
  }

  async encolarAlerta(alerta: {
    id: string;
    adulto_id: string;
    tipo: string;
    titulo: string;
    ocurrida_en: Date;
  }) {
    const plantilla = process.env.WHATSAPP_ALERT_TEMPLATE;
    if (!plantilla) return 0;
    const config = await this.prisma.configuracion_adulto.findUnique({
      where: { adulto_id: alerta.adulto_id },
    });
    if (config?.notificaciones_habilitadas === false) return 0;
    const destinos = await this.destinatariosAlerta(alerta.adulto_id);
    const adulto = await this.prisma.usuarios.findUnique({
      where: { id: alerta.adulto_id },
      select: { nombre: true, activo: true },
    });
    if (!adulto?.activo || !destinos.length) return 0;
    const resultado = await this.prisma.notificaciones_whatsapp.createMany({
      data: destinos.map((d) => ({
        destinatario_id: d.id,
        alerta_id: alerta.id,
        tipo: alerta.tipo === 'SOS' ? 'SOS' : 'ALERTA',
        plantilla,
        idioma: idiomaWhatsapp(),
        parametros: [
          adulto.nombre,
          alerta.tipo,
          alerta.titulo,
          alerta.ocurrida_en.toISOString(),
        ],
      })),
    });
    return resultado.count;
  }
}
