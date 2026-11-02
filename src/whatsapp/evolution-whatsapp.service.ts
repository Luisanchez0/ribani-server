import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { EnvioError, type TransporteWhatsapp } from './whatsapp-transporte.js';

const TEXTO_PRUEBA =
  'RIBANI: prueba del canal de WhatsApp. Si recibes este mensaje, la configuración es correcta.';
const TEXTO_RECORDATORIO =
  'RIBANI: recuerda registrar tu toma de medicamento en la aplicación.';

const baseUrl = () =>
  (process.env.WHATSAPP_EVOLUTION_URL ?? '').trim().replace(/\/+$/, '');

/**
 * Proveedor alterno para desarrollo: Evolution API sobre WhatsApp Web.
 * No usa plantillas aprobadas, por lo que compone texto libre a partir de la
 * plantilla interna y sus parámetros. No sustituye a Meta en producción.
 */
@Injectable()
export class EvolutionWhatsappService implements TransporteWhatsapp {
  readonly proveedor = 'EVOLUTION_API' as const;

  disponible(): boolean {
    return (
      process.env.WHATSAPP_ENABLED === 'true' &&
      Boolean(baseUrl()) &&
      Boolean((process.env.WHATSAPP_EVOLUTION_APIKEY ?? '').trim()) &&
      Boolean((process.env.WHATSAPP_EVOLUTION_INSTANCE ?? '').trim())
    );
  }

  texto(tipo: string | undefined, plantilla: string, parametros: string[]) {
    if (tipo === 'ALERTA' || tipo === 'SOS') {
      const [nombre, tipoAlerta, titulo, fecha] = parametros;
      const detalle = [
        nombre ? `Adulto mayor: ${nombre}.` : '',
        tipoAlerta ? `Tipo de alerta: ${tipoAlerta}.` : '',
        titulo ? `Detalle: ${titulo}.` : '',
        fecha ? `Registrada: ${fecha}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `RIBANI — Alerta. ${detalle}`.trim();
    }
    if (tipo === 'MEDICAMENTO')
      return (
        process.env.WHATSAPP_EVOLUTION_REMINDER_TEXTO?.trim() ||
        TEXTO_RECORDATORIO
      );
    if (tipo === 'PRUEBA' || tipo === 'OTRA')
      return (
        process.env.WHATSAPP_EVOLUTION_TEST_TEXTO?.trim() || TEXTO_PRUEBA
      );
    return parametros.length ? parametros.join(' ') : `RIBANI: ${plantilla}`;
  }

  async enviar(
    telefono: string,
    plantilla: string,
    _idioma: string,
    parametros: string[],
    tipo?: string,
  ): Promise<string> {
    if (!this.disponible())
      throw new ServiceUnavailableException(
        'WhatsApp no está habilitado o falta configurar Evolution API.',
      );
    const instancia = encodeURIComponent(
      (process.env.WHATSAPP_EVOLUTION_INSTANCE ?? '').trim(),
    );
    let response: Response;
    try {
      response = await fetch(`${baseUrl()}/message/sendText/${instancia}`, {
        method: 'POST',
        headers: {
          apikey: (process.env.WHATSAPP_EVOLUTION_APIKEY ?? '').trim(),
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          number: telefono.replace(/^\+/, ''),
          text: this.texto(tipo, plantilla, parametros),
        }),
      });
    } catch {
      throw new EnvioError('RESULTADO_DESCONOCIDO');
    }
    const body = (await response.json().catch(() => null)) as {
      key?: { id?: unknown };
      status?: unknown;
      response?: { message?: unknown };
    } | null;
    if (!response.ok)
      throw new EnvioError(`HTTP_${response.status}`, response.status === 429);
    const id = body?.key?.id;
    if (typeof id !== 'string' || !id || id.length > 150)
      throw new EnvioError('RESULTADO_DESCONOCIDO');
    return id;
  }
}
