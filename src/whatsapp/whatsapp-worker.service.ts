import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { MetaError, MetaWhatsappService } from './meta-whatsapp.service.js';
import { WhatsappService } from './whatsapp.service.js';
import { ESTADOS_PENDIENTES, recordarEn } from '../tomas/toma-pendiente.js';

@Injectable()
export class WhatsappWorkerService {
  private ejecutando = false;
  private readonly logger = new Logger(WhatsappWorkerService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly meta: MetaWhatsappService,
  ) {}

  @Cron('*/15 * * * * *')
  async procesar() {
    if (
      this.ejecutando ||
      process.env.WHATSAPP_WORKER_ENABLED !== 'true' ||
      !this.meta.disponible()
    )
      return;
    this.ejecutando = true;
    try {
      // Un proceso puede morir después de que Meta acepte el mensaje. No reenviarlo.
      await this.prisma.notificaciones_whatsapp.updateMany({
        where: {
          proveedor: 'META_CLOUD_API',
          estado: 'PROCESANDO',
          updated_at: { lt: new Date(Date.now() - 300_000) },
        },
        data: {
          estado: 'FALLIDA',
          codigo_error: 'RESULTADO_DESCONOCIDO',
          detalle_error: 'Revisar en Meta antes de cualquier reenvío.',
          fallida_en: new Date(),
          siguiente_intento_en: null,
          updated_at: new Date(),
        },
      });
      for (let i = 0; i < 10; i++) {
        const filas = await this.prisma.$queryRaw<{ id: string }[]>`
          UPDATE notificaciones_whatsapp SET estado = 'PROCESANDO', intentos = intentos + 1, updated_at = now(), siguiente_intento_en = NULL
          WHERE id = (SELECT id FROM notificaciones_whatsapp
            WHERE proveedor = 'META_CLOUD_API' AND proveedor_message_id IS NULL AND intentos < 3
            AND programada_para <= now() AND (estado = 'EN_COLA' OR (estado = 'FALLIDA' AND siguiente_intento_en IS NOT NULL AND siguiente_intento_en <= now()))
            ORDER BY programada_para, created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`;
        if (!filas.length) break;
        await this.procesarUna(filas[0].id);
      }
    } catch {
      this.logger.error(
        'Falló el procesador WhatsApp; se conservan los registros para revisión.',
      );
    } finally {
      this.ejecutando = false;
    }
  }

  async procesarUna(id: string) {
    const candidata = await this.prisma.notificaciones_whatsapp.findUnique({
      where: { id },
      include: {
        whatsapp_destinatarios: true,
        alertas: true,
        tomas_medicamento: { include: { medicamentos: true } },
      },
    });
    if (!candidata || candidata.estado !== 'PROCESANDO') return;
    await this.prisma.$transaction(
      async (tx) => {
        // La revocación espera hasta terminar el envío en curso. Después de que
        // responde la revocación ningún envío nuevo puede usar consentimiento viejo.
        await tx.$queryRaw`SELECT id FROM whatsapp_destinatarios WHERE id = ${candidata.destinatario_id}::uuid FOR UPDATE`;
        if (candidata.toma_id) {
          await tx.$queryRaw`SELECT id FROM tomas_medicamento WHERE id = ${candidata.toma_id}::uuid FOR UPDATE`;
        }
        // Una toma pudo registrarse mientras se esperaba el bloqueo del destino.
        const n = await tx.notificaciones_whatsapp.findUnique({
          where: { id },
          include: {
            alertas: true,
            tomas_medicamento: { include: { medicamentos: true } },
          },
        });
        if (!n || n.estado !== 'PROCESANDO') return;
        const d = await tx.whatsapp_destinatarios.findUnique({
          where: { id: n.destinatario_id },
        });
        if (!d) return;
        let permitido =
          d.activo &&
          d.consentimiento === 'ACEPTADO' &&
          (await this.whatsapp.destinatarioVigente(d.id, tx));
        const adultoId = n.alertas?.adulto_id ?? n.tomas_medicamento?.adulto_id;
        if (adultoId) {
          const c = await tx.configuracion_adulto.findUnique({
            where: { adulto_id: adultoId },
          });
          const adulto = await tx.usuarios.findUnique({
            where: { id: adultoId },
            select: { activo: true },
          });
          permitido =
            permitido &&
            Boolean(adulto?.activo) &&
            c?.notificaciones_habilitadas !== false;
          if (n.alerta_id)
            permitido =
              permitido &&
              Boolean(n.alertas) &&
              (await this.whatsapp.destinatariosAlerta(adultoId)).some(
                (dest) => dest.id === d.id,
              );
          if (n.toma_id) {
            const toma = n.tomas_medicamento;
            const ventana =
              ((c?.max_repeticiones ?? 3) + 1) *
              (c?.minutos_repeticion ?? 10) *
              60_000;
            permitido =
              permitido &&
              c?.recordatorio_medicamentos !== false &&
              process.env.WHATSAPP_REMINDERS_ENABLED === 'true' &&
              d.usuario_id === adultoId &&
              Boolean(
                toma &&
                ESTADOS_PENDIENTES.includes(toma.estado) &&
                new Date() >= recordarEn(toma),
              ) &&
              Boolean(toma?.medicamentos.activo) &&
              Boolean(
                toma && Date.now() - recordarEn(toma).getTime() < ventana,
              );
          }
        } else if (
          n.alerta_id ||
          n.toma_id ||
          !['PRUEBA', 'OTRA'].includes(n.tipo)
        )
          permitido = false;
        if (!permitido) {
          await tx.notificaciones_whatsapp.updateMany({
            where: { id, estado: 'PROCESANDO' },
            data: {
              estado: 'CANCELADA',
              codigo_error: 'DESTINO_NO_HABILITADO',
              updated_at: new Date(),
            },
          });
          return;
        }
        const permitidas = [
          process.env.WHATSAPP_TEST_TEMPLATE,
          process.env.WHATSAPP_ALERT_TEMPLATE,
          process.env.WHATSAPP_REMINDER_TEMPLATE,
        ].filter(Boolean);
        if (
          !permitidas.includes(n.plantilla) ||
          !Array.isArray(n.parametros) ||
          !n.parametros.every(
            (p) => typeof p === 'string' && p.length > 0 && p.length <= 1024,
          )
        ) {
          await tx.notificaciones_whatsapp.update({
            where: { id },
            data: {
              estado: 'FALLIDA',
              codigo_error: 'PLANTILLA_NO_CONFIGURADA',
              fallida_en: new Date(),
              updated_at: new Date(),
            },
          });
          return;
        }
        let messageId: string;
        try {
          messageId = await this.meta.enviar(
            d.telefono_e164,
            n.plantilla,
            n.idioma,
            n.parametros as string[],
          );
        } catch (error) {
          const codigo =
            error instanceof MetaError ? error.codigo : 'CONFIGURACION';
          const reintentar =
            error instanceof MetaError && error.reintentable && n.intentos < 3;
          await tx.notificaciones_whatsapp.updateMany({
            where: { id, estado: 'PROCESANDO' },
            data: {
              estado: 'FALLIDA',
              codigo_error: codigo,
              detalle_error:
                'Consulta el código en Meta; el contenido del proveedor no se almacena.',
              fallida_en: new Date(),
              siguiente_intento_en: reintentar
                ? new Date(Date.now() + 60_000 * 2 ** n.intentos)
                : null,
              updated_at: new Date(),
            },
          });
          return;
        }
        // Fuera del catch del transporte: si falla persistencia, conservar PROCESANDO.
        await tx.notificaciones_whatsapp.update({
          where: { id },
          data: {
            proveedor_message_id: messageId,
            estado: 'ENVIADA',
            enviada_en: new Date(),
            codigo_error: null,
            detalle_error: null,
            updated_at: new Date(),
          },
        });
      },
      { timeout: 25_000 },
    );
  }
}
