import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { EnvioError, type TransporteWhatsapp } from './whatsapp-transporte.js';

export class MetaError extends EnvioError {
  constructor(codigo: string, reintentable = false, credencialInvalida = false) {
    super(codigo, reintentable, credencialInvalida);
    this.message = `Meta rechazó el envío (${codigo}).`;
  }
}

@Injectable()
export class MetaWhatsappService implements TransporteWhatsapp {
  readonly proveedor = 'META_CLOUD_API' as const;

  disponible(): boolean {
    return (
      process.env.WHATSAPP_ENABLED === 'true' &&
      Boolean(process.env.WHATSAPP_ACCESS_TOKEN) &&
      /^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID ?? '') &&
      /^v\d+\.\d+$/.test(process.env.WHATSAPP_API_VERSION ?? '')
    );
  }

  async enviar(
    telefono: string,
    plantilla: string,
    idioma: string,
    parametros: string[],
  ): Promise<string> {
    if (!this.disponible())
      throw new ServiceUnavailableException(
        'WhatsApp no está habilitado o falta configurar Meta.',
      );
    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: telefono.replace(/^\+/, ''),
            type: 'template',
            template: {
              name: plantilla,
              language: { code: idioma },
              ...(parametros.length
                ? {
                    components: [
                      {
                        type: 'body',
                        parameters: parametros.map((text) => ({
                          type: 'text',
                          text,
                        })),
                      },
                    ],
                  }
                : {}),
            },
          }),
        },
      );
    } catch {
      throw new MetaError('RESULTADO_DESCONOCIDO');
    }
    const body = (await response.json().catch(() => null)) as {
      messages?: { id?: unknown }[];
      error?: { code?: unknown };
    } | null;
    if (!response.ok)
      throw new MetaError(
        typeof body?.error?.code === 'number'
          ? String(body.error.code)
          : `HTTP_${response.status}`,
        response.status === 429,
        // 190: token caducado o inválido. Meta no aceptó el mensaje.
        body?.error?.code === 190,
      );
    const id = body?.messages?.[0]?.id;
    if (typeof id !== 'string' || !id || id.length > 150)
      throw new MetaError('RESULTADO_DESCONOCIDO');
    return id;
  }
}
