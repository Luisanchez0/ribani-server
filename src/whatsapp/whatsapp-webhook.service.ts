import { createHash } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  estadoSiguiente,
  extraerEstados,
  firmaValida,
} from './whatsapp.protocol.js';

@Injectable()
export class WhatsappWebhookService {
  constructor(private readonly prisma: PrismaService) {}

  verificar(mode?: string, token?: string, challenge?: string) {
    if (
      !process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
      mode !== 'subscribe' ||
      token !== process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
      !challenge ||
      !/^\d{1,100}$/.test(challenge)
    )
      throw new ForbiddenException('Verificación inválida.');
    return challenge;
  }

  async recibir(
    raw: Buffer | undefined,
    firma: string | undefined,
    body: unknown,
  ) {
    if (!firmaValida(raw, firma, process.env.META_APP_SECRET ?? ''))
      throw new ForbiddenException('Firma de Meta inválida.');
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID)
      throw new ServiceUnavailableException(
        'Falta configurar el número de Meta.',
      );
    for (const evento of extraerEstados(
      body,
      process.env.WHATSAPP_PHONE_NUMBER_ID,
    )) {
      await this.prisma.$transaction(async (tx) => {
        const filas = await tx.$queryRaw<
          { id: string; estado: string }[]
        >`SELECT id, estado FROM notificaciones_whatsapp WHERE proveedor = 'META_CLOUD_API' AND proveedor_message_id = ${evento.messageId} FOR UPDATE`;
        const n = filas[0];
        // El callback puede adelantarse al guardado de wamid. Solicitar reentrega.
        if (!n) {
          if (Date.now() - evento.fecha.getTime() < 120_000)
            throw new ServiceUnavailableException(
              'Identificador aún no persistido; reintentar callback.',
            );
          return; // Mensajes antiguos o enviados fuera de RIBANI no tienen fila local.
        }
        const clave = createHash('sha256')
          .update(
            `${evento.messageId}|${evento.estado}|${evento.fecha.toISOString()}|${evento.codigo ?? ''}`,
          )
          .digest('hex');
        await tx.whatsapp_estados_proveedor.createMany({
          data: [
            {
              notificacion_id: n.id,
              proveedor_evento_id: clave,
              estado: evento.estado,
              ocurrido_en: evento.fecha,
              codigo_error: evento.codigo,
              payload_minimo: {
                message_id: evento.messageId,
                estado: evento.estado,
              },
            },
          ],
          skipDuplicates: true,
        });
        const estado = estadoSiguiente(n.estado, evento.estado);
        if (estado !== n.estado) {
          const campo = {
            ENVIADA: 'enviada_en',
            ENTREGADA: 'entregada_en',
            LEIDA: 'leida_en',
            FALLIDA: 'fallida_en',
          }[evento.estado];
          await tx.notificaciones_whatsapp.update({
            where: { id: n.id },
            data: {
              estado,
              [campo]: evento.fecha,
              siguiente_intento_en: null,
              codigo_error:
                estado === 'FALLIDA' ? (evento.codigo ?? 'META_FALLIDA') : null,
              updated_at: new Date(),
            },
          });
        }
      });
    }
    return { recibido: true };
  }
}
