import { createHmac, timingSafeEqual } from 'node:crypto';

export type EstadoMeta = 'ENVIADA' | 'ENTREGADA' | 'LEIDA' | 'FALLIDA';
export interface EventoMeta {
  messageId: string;
  estado: EstadoMeta;
  fecha: Date;
  codigo?: string;
}

export function firmaValida(
  raw: Buffer | undefined,
  firma: string | undefined,
  secret: string,
): boolean {
  if (!raw || !secret || !firma || !/^sha256=[a-f0-9]{64}$/.test(firma))
    return false;
  return timingSafeEqual(
    createHmac('sha256', secret).update(raw).digest(),
    Buffer.from(firma.slice(7), 'hex'),
  );
}

export function estadoSiguiente(actual: string, nuevo: EstadoMeta): string {
  if (actual === 'LEIDA' || (actual === 'ENTREGADA' && nuevo !== 'LEIDA'))
    return actual;
  if (actual === 'FALLIDA' && nuevo === 'ENVIADA') return actual;
  return nuevo;
}

const objeto = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const arreglo = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export function extraerEstados(body: unknown, phoneId: string): EventoMeta[] {
  const root = objeto(body);
  if (root.object !== 'whatsapp_business_account' || !phoneId) return [];
  const resultado: EventoMeta[] = [];
  const estados: Record<string, EstadoMeta> = {
    sent: 'ENVIADA',
    delivered: 'ENTREGADA',
    read: 'LEIDA',
    failed: 'FALLIDA',
  };
  for (const entry of arreglo(root.entry))
    for (const change of arreglo(objeto(entry).changes)) {
      const c = objeto(change);
      const value = objeto(c.value);
      if (
        c.field !== 'messages' ||
        objeto(value.metadata).phone_number_id !== phoneId
      )
        continue;
      for (const status of arreglo(value.statuses)) {
        const s = objeto(status);
        const estado =
          typeof s.status === 'string' ? estados[s.status] : undefined;
        const seconds =
          typeof s.timestamp === 'string' && /^\d{1,12}$/.test(s.timestamp)
            ? Number(s.timestamp)
            : NaN;
        if (
          !estado ||
          typeof s.id !== 'string' ||
          !s.id ||
          s.id.length > 150 ||
          !Number.isFinite(seconds) ||
          seconds <= 0 ||
          seconds > Date.now() / 1000 + 300
        )
          continue;
        const code = objeto(arreglo(s.errors)[0]).code;
        resultado.push({
          messageId: s.id,
          estado,
          fecha: new Date(seconds * 1000),
          ...(typeof code === 'number'
            ? { codigo: String(code).slice(0, 40) }
            : {}),
        });
      }
    }
  return resultado;
}
