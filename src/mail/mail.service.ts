import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Resend } from 'resend';
import type { ErrorResponse } from 'resend';


const REMITENTE = 'Invitaciones RIBANI <notifications@ribani.lat>';



interface PlantillaInvitacion {
  emailAdulto: string;
  nombreFamiliar: string;
  nombreAdulto?: string;
  mensaje: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function plantillaNoDisponible(error: ErrorResponse): boolean {
  // Solo una respuesta definitiva de rechazo permite un segundo envío.
  // Un timeout/5xx puede haber aceptado el correo y duplicarlo al reintentar.
  return (
    (error.statusCode === 404 || error.statusCode === 422) &&
    /template/i.test(error.message) &&
    /not[ -]found|does not exist|not published|unpublished|draft/i.test(error.message)
  );
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
    const plantillaId = process.env.RESEND_TEMPLATE_INVITACION_ID;

    try {
      // Plantilla principal: "supervisor-invitation". El HTML inline solo se usa
      // si Resend confirma que no está disponible: otro fallo podría duplicar.
      if (plantillaId) {
        const conPlantilla = await this.resend.emails.send({
          from: REMITENTE,
          to: [plantilla.emailAdulto],
          // La API exige subject aunque la plantilla lo defina:
          // https://resend.com/docs/api-reference/send-email
          subject: `${plantilla.nombreFamiliar} te invitó a ser parte de RIBANI`,
          template: {
            id: plantillaId,
            variables: {
              FAMILIAR_ENCARGADO: plantilla.nombreFamiliar,
              ADULTO_MAYOR: nombreAdulto,
            },
          },
        });

        const errPlantilla = conPlantilla.error;

        if (!errPlantilla) {
          this.logger.log(
            `Invitación enviada con plantilla (id ${conPlantilla.data?.id ?? 'n/a'}).`,
          );
          return;
        }

        if (!plantillaNoDisponible(errPlantilla)) {
          throw new ServiceUnavailableException(
            'No se pudo enviar el correo de invitación. Intenta de nuevo.',
          );
        }

        this.logger.warn('Plantilla de invitación no disponible; usando HTML inline.');
      }

      const { data, error } = await this.resend.emails.send({
        from: REMITENTE,
        to: [plantilla.emailAdulto],
        subject: `${plantilla.nombreFamiliar} te invitó a ser parte de RIBANI`,
        html: [
          '<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">',
          `  <h2>Hola${plantilla.nombreAdulto ? ` ${escapeHtml(nombreAdulto)}` : ''},</h2>`,
          `  <p><strong>${escapeHtml(plantilla.nombreFamiliar)}</strong> te invitó a usar RIBANI y quedará vinculado como tu familiar encargado.</p>`,
          plantilla.mensaje
            ? `  <p style="padding: 12px; background: #f5f5f5; border-radius: 8px; border-left: 4px solid #0070f3;">"${escapeHtml(plantilla.mensaje)}"</p>`
            : '',
          '  <p>Para continuar:</p>',
          '  <ol>',
          '    <li><strong>Descarga la app</strong> o entra a la web.</li>',
          '    <li>Elige <strong>Activar mi invitación</strong> y pide un código con este correo.</li>',
          '    <li>Escribe el código y crea tu contraseña: tu cuenta y el vínculo quedarán activos.</li>',
          '  </ol>',
          '  <p style="color: #888; font-size: 12px; margin-top: 24px;">',
          '    Si no esperabas este correo, puedes ignorarlo y no se creará ningún vínculo.',
          '  </p>',
          '</div>',
        ].filter(Boolean).join('\n'),
      });

      if (error) {
        throw new ServiceUnavailableException(
          'No se pudo enviar el correo de invitación. Intenta de nuevo.',
        );
      }

      this.logger.log(`Invitación enviada con HTML inline (id ${data?.id ?? 'n/a'}).`);
    } catch {
      // No registrar errores externos: podrían incluir al destinatario.
      this.logger.error('No se pudo enviar el correo de invitación.');
      throw new ServiceUnavailableException(
        'No se pudo enviar el correo de invitación. Intenta de nuevo.',
      );
    }
  }

  /**
   * Correo de recuperación de contraseña con un código de 6 dígitos que
   * caduca en 10 minutos. Preferencia: plantilla "reset-password" de
   * Resend (RESEND_TEMPLATE_RESET_ID); fallback: HTML inline si no está
   * publicada/disponible. Propaga fallos al service del reset, que mantiene
   * una respuesta genérica para el cliente.
   */
  async enviarResetPassword(
    emailAdulto: string,
    nombreAdulto: string,
    codigo: string,
  ): Promise<void> {
    const nombre = nombreAdulto?.trim() || 'persona';
    const plantillaId = process.env.RESEND_TEMPLATE_RESET_ID;

    try {
      const mensaje = {
        from: REMITENTE,
        to: [emailAdulto],
        subject: 'Tu código para recuperar la contraseña de RIBANI',
      };

      if (plantillaId) {
        const { error } = await this.resend.emails.send({
          ...mensaje,
          template: {
            id: plantillaId,
            variables: { NOMBRE: nombre, CODIGO: codigo, MINUTOS: '10' },
          },
        });

        if (!error) {
          this.logger.log('Código de recuperación enviado con plantilla.');
          return;
        }
        if (!plantillaNoDisponible(error)) {
          throw new ServiceUnavailableException('No se pudo enviar el correo de recuperación.');
        }
        this.logger.warn('Plantilla de recuperación no disponible; usando HTML inline.');
      }

      const { error } = await this.resend.emails.send({
        ...mensaje,
        html: [
          '<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">',
          `  <h2>Hola ${escapeHtml(nombre)},</h2>`,
          '  <p>Usa este código para restablecer tu contraseña de RIBANI:</p>',
          `  <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; text-align: center; padding: 12px; background: #f0f7ee; border-radius: 8px;">${escapeHtml(codigo)}</p>`,
          '  <p>El código <strong>caduca en 10 minutos</strong>. Si no solicitaste este correo, puedes ignorarlo: tu contraseña no cambia por este mensaje.</p>',
          '</div>',
        ].join('\n'),
      });
      if (error) {
        throw new ServiceUnavailableException('No se pudo enviar el correo de recuperación.');
      }
      this.logger.log('Código de recuperación enviado con HTML inline.');
    } catch {
      // No registrar errores externos: podrían incluir destinatario o código.
      this.logger.error('No se pudo enviar el correo de recuperación.');
      throw new ServiceUnavailableException('No se pudo enviar el correo de recuperación.');
    }
  }

  /**
   * Código de 6 dígitos para activar una cuenta invitada; caduca en 10 minutos.
   * El llamador mantiene una respuesta genérica aunque el envío falle.
   */
  async enviarCodigoInvitacion(
    emailAdulto: string,
    nombreAdulto: string,
    codigo: string,
  ): Promise<void> {
    const nombre = nombreAdulto?.trim() || 'persona mayor';

    try {
      const { error } = await this.resend.emails.send({
        from: REMITENTE,
        to: [emailAdulto],
        subject: 'Tu código para activar tu cuenta de RIBANI',
        html: [
          '<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">',
          `  <h2>Hola ${escapeHtml(nombre)},</h2>`,
          '  <p>Usa este código en la app RIBANI para activar tu cuenta y aceptar la invitación de tu familiar:</p>',
          `  <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; text-align: center; padding: 12px; background: #f0f7ee; border-radius: 8px;">${escapeHtml(codigo)}</p>`,
          '  <p>El código <strong>caduca en 10 minutos</strong>. Si no lo pediste, ignora este correo: nadie podrá activar la cuenta sin él. No lo compartas con nadie.</p>',
          '</div>',
        ].join('\n'),
      });
      if (error) {
        throw new ServiceUnavailableException('No se pudo enviar el código de invitación.');
      }
      this.logger.log('Código de invitación enviado.');
    } catch {
      // No registrar errores externos: podrían incluir destinatario o código.
      this.logger.error('No se pudo enviar el código de invitación.');
      throw new ServiceUnavailableException('No se pudo enviar el código de invitación.');
    }
  }

  /**
   * Correo de bienvenida: se envía cuando el adulto completa su registro y
   * sus vínculos quedan ACTIVA. No lanza si falla: la cuenta ya está activa y
   * el correo es solo un extra.
   */
  async enviarBienvenida(emailAdulto: string, nombreAdulto: string): Promise<void> {
    const nombre = nombreAdulto?.trim() || 'persona mayor';
    const plantillaId = process.env.RESEND_TEMPLATE_BIENVENIDA_ID;

    try {
      const { error } = await this.resend.emails.send({
        from: REMITENTE,
        to: [emailAdulto],
        subject: 'Bienvenido a RIBANI',
        ...(plantillaId
          ? {
              template: {
                id: plantillaId,
                variables: { name: nombre },
              },
            }
          : {
              html: `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;"><h2>Hola ${escapeHtml(nombre)},</h2><p>Te damos la bienvenida a RIBANI.</p></div>`,
            }),
      });

      if (error) {
        this.logger.warn('Correo de bienvenida no enviado.');
        return;
      }

      this.logger.log('Correo de bienvenida enviado.');
    } catch {
      // No registrar errores externos: podrían incluir al destinatario.
      this.logger.warn('Correo de bienvenida no enviado.');
    }
  }
}
