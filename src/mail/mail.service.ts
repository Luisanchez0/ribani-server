import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Resend } from 'resend';

const REMITENTE = 'Invitaciones RIBANI <onboarding@resend.dev>';



const PLANTILLA_INVITACION_ID =
  process.env.RESEND_TEMPLATE_INVITACION_ID ||
  'ee11cd7e-48f3-4598-801d-f22cc34a5cba'; // supervisor-invitation
const PLANTILLA_BIENVENIDA_ID =
  process.env.RESEND_TEMPLATE_BIENVENIDA_ID ||
  'a0d77949-f31b-4b29-80fe-6934e3153f9a'; // welcome-email

interface PlantillaInvitacion {
  emailAdulto: string;
  nombreFamiliar: string;
  nombreAdulto?: string;
  mensaje: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;

  constructor() {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY es obligatoria.');
    }

    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  /**
   * Correo de invitación de vínculo familiar. Lanzará error si Resend falla:
   * orientado a invocarse DENTRO de la transacción del vínculo, para no dejar
   * vínculos PENDIENTE "silenciosos" sin correo enviado.
   */
  async enviarInvitacion(plantilla: PlantillaInvitacion): Promise<void> {
    const nombreAdulto =
      plantilla.nombreAdulto?.trim() || 'persona mayor';

    try {
      // Plantilla principal: "supervisor-invitation". Con fallback al HTML
      // inline si el envío con plantilla falla (p. ej. id inexistente en dev).
      if (PLANTILLA_INVITACION_ID) {
        const conPlantilla = await this.resend.emails.send({
          from: REMITENTE,
          to: [plantilla.emailAdulto],
          // La API exige subject aunque la plantilla lo defina:
          // https://resend.com/docs/api-reference/send-email
          subject: `${plantilla.nombreFamiliar} te invitó a ser parte de RIBANI`,
          template: {
            id: PLANTILLA_INVITACION_ID,
            variables: {
              FAMILIAR_ENCARGADO: plantilla.nombreFamiliar,
              ADULTO_MAYOR: nombreAdulto,
            },
          },
        });

        const errPlantilla = conPlantilla.error;

        if (!errPlantilla) {
          this.logger.log(
            `Invitación (plantilla welcome) enviada a ${plantilla.emailAdulto} (id ${conPlantilla.data?.id ?? 'n/a'})`,
          );
          return;
        }

        this.logger.warn(
          `Envío con plantilla falló (${errPlantilla.message}); usando HTML inline`,
        );
      }

      const { data, error } = await this.resend.emails.send({
        from: REMITENTE,
        to: [plantilla.emailAdulto],
        subject: `${plantilla.nombreFamiliar} te invitó a ser parte de RIBANI`,
        html: [
          '<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">',
          `  <h2>Hola${plantilla.nombreAdulto ? ` ${nombreAdulto}` : ''},</h2>`,
          `  <p><strong>${plantilla.nombreFamiliar}</strong> te invitó a usar RIBANI y quedará vinculado como tu familiar encargado.</p>`,
          plantilla.mensaje
            ? `  <p style="padding: 12px; background: #f5f5f5; border-radius: 8px; border-left: 4px solid #0070f3;">"${plantilla.mensaje}"</p>`
            : '',
          '  <p>Para continuar:</p>',
          '  <ol>',
          '    <li><strong>Descarga la app</strong> o entra a la web.</li>',
          '    <li><strong>Completa tu registro</strong> con contraseña para activar tu cuenta.</li>',
          '    <li><strong>Acepta la invitación</strong> para confirmar el vínculo.</li>',
          '  </ol>',
          '  <p style="color: #888; font-size: 12px; margin-top: 24px;">',
          '    Si no esperabas este correo, puedes ignorarlo y no se creará ningún vínculo.',
          '  </p>',
          '</div>',
        ].filter(Boolean).join('\n'),
      });

      if (error) {
        this.logger.error(
          `Error de Resend al enviar invitación a ${plantilla.emailAdulto}: ${error.message}`,
        );
        throw new ServiceUnavailableException(
          'No se pudo enviar el correo de invitación. Intenta de nuevo.',
        );
      }

      this.logger.log(`Invitación enviada a ${plantilla.emailAdulto} (id ${data?.id ?? 'n/a'})`);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.error(
        `Error inesperado al enviar invitación a ${plantilla.emailAdulto}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'No se pudo enviar el correo de invitación. Intenta de nuevo.',
      );
    }
  }

  /**
   * Correo de bienvenida: se envía cuando el adulto completa su registro y
   * sus vínculos quedan ACTIVA. No lanza si falla: la cuenta ya está activa y
   * el correo es solo un extra.
   */
  async enviarBienvenida(emailAdulto: string, nombreAdulto: string): Promise<void> {
    const nombre = nombreAdulto?.trim() || 'persona mayor';

    try {
      const { error } = await this.resend.emails.send({
        from: REMITENTE,
        to: [emailAdulto],
        subject: 'Bienvenido a RIBANI',
        template: {
          id: PLANTILLA_BIENVENIDA_ID,
          variables: { name: nombre },
        },
      });

      if (error) {
        this.logger.warn(
          `Bienvenida no enviada a ${emailAdulto}: ${error.message}`,
        );
        return;
      }

      this.logger.log(`Bienvenida enviada a ${emailAdulto}`);
    } catch (error) {
      this.logger.warn(
        `Error inesperado en bienvenida a ${emailAdulto}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
