import { createHash, timingSafeEqual } from 'node:crypto';
import type { EstadoMeta, EventoMeta } from './whatsapp.protocol.js';

const objeto = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/** Evolution API autentica webhooks con `apikey`, no con HMAC del cuerpo. */
export function claveValida(
  recibida: string | undefined,
  esperada: string,
): boolean {
  if (!recibida || !esperada.trim()) return false;
  return timingSafeEqual(
    createHash('sha256').update(recibida).digest(),
    createHash('sha256').update(esperada.trim()).digest(),
  );
}

const ESTADOS: Record<string, EstadoMeta> = {
  SERVER_ACK: 'ENVIADA',
  DELIVERY_ACK: 'ENTREGADA',
  READ: 'LEIDA',
  PLAYED: 'LEIDA',
  ERROR: 'FALLIDA',
};

/** Algunas versiones reenvían el enum numérico de Baileys en lugar del texto. */
const ESTADOS_NUMERICOS: Record<number, EstadoMeta> = {
  1: 'ENVIADA',
  2: 'ENTREGADA',
  3: 'LEIDA',
  4: 'LEIDA',
  5: 'FALLIDA',
};

const nombreEvento = (event: unknown) =>
  typeof event === 'string'
    ? event.trim().toLowerCase().replace(/_/g, '.')
    : '';

const idDe = (d: Record<string, unknown>): string | undefined => {
  for (const valor of [d.keyId, d.messageId, objeto(d.key).id]) {
    if (typeof valor === 'string' && valor && valor.length <= 150) return valor;
  }
  return undefined;
};

function fechaDe(d: Record<string, unknown>): Date {
  const ahora = Date.now();
  for (const clave of ['messageTimestamp', 'timestamp', 'updatedAt']) {
    const valor = d[clave];
    const numero =
      typeof valor === 'number'
        ? valor
        : typeof valor === 'string' && /^\d{1,13}$/.test(valor)
          ? Number(valor)
          : NaN;
    if (Number.isFinite(numero) && numero > 0) {
      const fecha = new Date(numero > 1e12 ? numero : numero * 1000);
      return fecha.getTime() > ahora + 300_000 ? new Date(ahora) : fecha;
    }
  }
  return new Date(ahora);
}

/**
 * Traduce los eventos de Evolution API al mismo contrato que usa el webhook de
 * Meta. Solo se aceptan callbacks de la instancia configurada.
 */
export function extraerEstadosEvolution(
  body: unknown,
  instancia: string,
): EventoMeta[] {
  const root = objeto(body);
  const evento = nombreEvento(root.event);
  if (evento !== 'messages.update' && evento !== 'send.message') return [];
  if (typeof root.instance === 'string' && root.instance !== instancia)
    return [];
  const resultado: EventoMeta[] = [];
  const datos = Array.isArray(root.data) ? root.data : [root.data];
  for (const crudo of datos) {
    const d = objeto(crudo);
    const messageId = idDe(d);
    if (!messageId) continue;
    const fecha = fechaDe(d);
    if (evento === 'send.message') {
      resultado.push({ messageId, estado: 'ENVIADA', fecha });
      continue;
    }
    const estado =
      typeof d.status === 'string'
        ? ESTADOS[d.status.toUpperCase()]
        : typeof d.status === 'number'
          ? ESTADOS_NUMERICOS[d.status]
          : undefined;
    if (!estado) continue;
    resultado.push({
      messageId,
      estado,
      fecha,
      ...(estado === 'FALLIDA' ? { codigo: 'EVOLUTION_ERROR' } : {}),
    });
  }
  return resultado;
}
