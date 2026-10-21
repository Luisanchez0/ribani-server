import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export class MetaError extends Error {
  constructor(
    readonly codigo: string,
    readonly reintentable = false,
  ) {
    super(`Meta rechazó el envío (${codigo}).`);
  }
}

@Injectable()
export class MetaWhatsappService {
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
      );
    const id = body?.messages?.[0]?.id;
    if (typeof id !== 'string' || !id || id.length > 150)
      throw new MetaError('RESULTADO_DESCONOCIDO');
    return id;
  }
}
