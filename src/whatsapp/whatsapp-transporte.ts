export type ProveedorWhatsapp = 'META_CLOUD_API' | 'EVOLUTION_API';

/**
 * Error de transporte compartido por todos los proveedores. Solo los códigos
 * marcados como reintentables vuelven a la cola; el mensaje nunca incluye la
 * respuesta cruda del proveedor.
 */
export class EnvioError extends Error {
  constructor(
    readonly codigo: string,
    readonly reintentable = false,
    /** El proveedor rechazó el token: no se envió nada y se resuelve renovándolo. */
    readonly credencialInvalida = false,
  ) {
    super(`El proveedor rechazó el envío (${codigo}).`);
  }
}

/**
 * Contrato mínimo de un canal WhatsApp. La cola guarda plantilla, idioma y
 * parámetros igual para todos los proveedores: Meta los envía como plantilla
 * aprobada y Evolution API los compone como texto libre.
 */
export interface TransporteWhatsapp {
  readonly proveedor: ProveedorWhatsapp;
  disponible(): boolean;
  enviar(
    telefono: string,
    plantilla: string,
    idioma: string,
    parametros: string[],
    tipo?: string,
  ): Promise<string>;
}

export const WHATSAPP_TRANSPORTE = 'WHATSAPP_TRANSPORTE';

export const proveedorConfigurado = (): ProveedorWhatsapp =>
  process.env.WHATSAPP_DRIVER?.trim().toLowerCase() === 'evolution'
    ? 'EVOLUTION_API'
    : 'META_CLOUD_API';
