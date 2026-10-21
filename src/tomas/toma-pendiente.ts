export const MINUTOS_POSPONER = 10;
export const ESTADOS_PENDIENTES = ['PENDIENTE', 'POSPUESTA'];
export function recordarEn(toma: {
  estado: string;
  programada_para: Date;
  updated_at: Date;
}): Date {
  return toma.estado === 'POSPUESTA'
    ? new Date(toma.updated_at.getTime() + MINUTOS_POSPONER * 60_000)
    : toma.programada_para;
}
