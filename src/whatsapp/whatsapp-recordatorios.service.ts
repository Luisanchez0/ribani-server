import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { idiomaWhatsapp } from './whatsapp.service.js';
import { ESTADOS_PENDIENTES, recordarEn } from '../tomas/toma-pendiente.js';

@Injectable()
export class WhatsappRecordatoriosService {
  private readonly logger = new Logger(WhatsappRecordatoriosService.name);
  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 * * * * *')
  async generar() {
    const plantilla = process.env.WHATSAPP_REMINDER_TEMPLATE;
    if (
      process.env.WHATSAPP_ENABLED !== 'true' ||
      process.env.WHATSAPP_REMINDERS_ENABLED !== 'true' ||
      !plantilla
    )
      return;
    try {
      const ahora = new Date();
      // Ventana máxima SQL: (12 repeticiones + inicial) * 120 minutos.
      let cursor: string | undefined;
      for (;;) {
        const tomas = await this.prisma.tomas_medicamento.findMany({
          where: {
            estado: { in: ESTADOS_PENDIENTES },
            programada_para: {
              lte: ahora,
              gte: new Date(ahora.getTime() - 26 * 3600_000),
            },
            medicamentos: { activo: true },
          },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const { id } of tomas)
          await this.encolarToma(id, plantilla, ahora);
        if (tomas.length < 100) break;
        cursor = tomas[tomas.length - 1].id;
      }
    } catch {
      this.logger.error('No se pudieron generar los recordatorios WhatsApp.');
    }
  }

  async encolarToma(id: string, plantilla: string, ahora: Date) {
    await this.prisma.$transaction(async (tx) => {
      // Exclusión entre instancias sin añadir columnas ni índices al esquema real.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`recordatorio:${id}`}))::text`;
      const t = await tx.tomas_medicamento.findUnique({
        where: { id },
        include: { medicamentos: true },
      });
      if (
        !t ||
        !ESTADOS_PENDIENTES.includes(t.estado) ||
        !t.medicamentos.activo ||
        ahora < recordarEn(t)
      )
        return;
      const c = await tx.configuracion_adulto.findUnique({
        where: { adulto_id: t.adulto_id },
      });
      if (
        c?.notificaciones_habilitadas === false ||
        c?.recordatorio_medicamentos === false
      )
        return;
      const minutos = c?.minutos_repeticion ?? 10;
      const max = c?.max_repeticiones ?? 3;
      const elapsed = ahora.getTime() - recordarEn(t).getTime();
      if (elapsed < 0 || elapsed >= (max + 1) * minutos * 60_000) return;
      const destinatarios = await tx.whatsapp_destinatarios.findMany({
        where: {
          usuario_id: t.adulto_id,
          contacto_emergencia_id: null,
          activo: true,
          consentimiento: 'ACEPTADO',
          usuarios: { activo: true },
        },
        select: { id: true },
      });
      for (const d of destinatarios) {
        const previas = await tx.notificaciones_whatsapp.findMany({
          where: {
            toma_id: id,
            destinatario_id: d.id,
            tipo: 'MEDICAMENTO',
            estado: { not: 'CANCELADA' },
          },
          select: {
            created_at: true,
            enviada_en: true,
            estado: true,
            siguiente_intento_en: true,
          },
          orderBy: { created_at: 'desc' },
          take: 14,
        });
        const pendiente = previas.some(
          (p) =>
            p.estado === 'EN_COLA' ||
            p.estado === 'PROCESANDO' ||
            (p.estado === 'FALLIDA' && p.siguiente_intento_en !== null),
        );
        const ultima = previas[0]?.enviada_en ?? previas[0]?.created_at;
        if (
          pendiente ||
          previas.length >= max + 1 ||
          (ultima && ahora.getTime() - ultima.getTime() < minutos * 60_000)
        )
          continue;
        await tx.notificaciones_whatsapp.create({
          data: {
            destinatario_id: d.id,
            toma_id: id,
            tipo: 'MEDICAMENTO',
            plantilla,
            idioma: idiomaWhatsapp(),
            parametros: [],
          },
        });
      }
    });
  }
}
