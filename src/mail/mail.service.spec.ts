import { Logger } from '@nestjs/common';
import { vi } from 'vitest';
import { MailService } from './mail.service.js';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

describe('MailService invitación y bienvenida', () => {
  const invitacion = {
    emailAdulto: 'persona@example.com',
    nombreFamiliar: 'Luis <a href="https://mal.example">entra</a>',
    nombreAdulto: 'Ana <img src=x>',
    mensaje: 'Hola <script>alert(1)</script>',
  };
  let registros: unknown[];

  beforeEach(() => {
    registros = [];
    vi.stubEnv('RESEND_API_KEY', 'test-key');
    vi.stubEnv('RESEND_TEMPLATE_INVITACION_ID', '');
    vi.stubEnv('RESEND_TEMPLATE_BIENVENIDA_ID', '');
    send.mockReset();
    const registrar = (...args: unknown[]) => {
      registros.push(args);
    };
    vi.spyOn(Logger.prototype, 'log').mockImplementation(registrar);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(registrar);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(registrar);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('escapa los datos del usuario en el HTML de la invitación', async () => {
    send.mockResolvedValue({ error: null, data: { id: 'sent' } });

    await new MailService().enviarInvitacion(invitacion);

    const { html } = send.mock.calls[0][0];
    expect(html).not.toContain('<a href');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('Luis &lt;a href=&quot;');
    expect(html).toContain('Ana &lt;img src=x&gt;');
  });

  it('usa HTML escapado si la plantilla de invitación no está disponible', async () => {
    vi.stubEnv('RESEND_TEMPLATE_INVITACION_ID', 'invitacion');
    send.mockResolvedValueOnce({
      error: {
        name: 'not_found',
        statusCode: 404,
        message: 'Template not found',
      },
      data: null,
    });
    send.mockResolvedValueOnce({ error: null, data: { id: 'sent' } });

    await new MailService().enviarInvitacion(invitacion);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].html).not.toContain('<img');
  });

  it.each([
    { name: 'application_error', statusCode: 500, message: 'Template failure' },
    { name: 'rate_limit_exceeded', statusCode: 429, message: 'Rate limited' },
  ])(
    'no duplica la invitación ante un error $statusCode de la plantilla',
    async (error) => {
      vi.stubEnv('RESEND_TEMPLATE_INVITACION_ID', 'invitacion');
      send.mockResolvedValue({ error, data: null });

      await expect(
        new MailService().enviarInvitacion(invitacion),
      ).rejects.toThrow();

      expect(send).toHaveBeenCalledTimes(1);
    },
  );

  it('no duplica la invitación ante un error de transporte', async () => {
    vi.stubEnv('RESEND_TEMPLATE_INVITACION_ID', 'invitacion');
    send.mockRejectedValue(new Error('timeout persona@example.com'));

    await expect(
      new MailService().enviarInvitacion(invitacion),
    ).rejects.toThrow();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('no registra el correo del destinatario en la invitación', async () => {
    send.mockResolvedValueOnce({ error: null, data: { id: 'sent' } });
    await new MailService().enviarInvitacion(invitacion);

    send.mockRejectedValueOnce(new Error('fallo persona@example.com'));
    await expect(
      new MailService().enviarInvitacion(invitacion),
    ).rejects.toThrow();

    expect(registros.length).toBeGreaterThan(0);
    expect(JSON.stringify(registros)).not.toContain('persona@example.com');
  });

  it('escapa el nombre y no registra el correo en la bienvenida', async () => {
    send.mockResolvedValueOnce({ error: null, data: { id: 'sent' } });
    await new MailService().enviarBienvenida(
      'persona@example.com',
      'Ana <img src=x>',
    );
    expect(send.mock.calls[0][0].html).toContain('Ana &lt;img src=x&gt;');
    expect(send.mock.calls[0][0].html).not.toContain('<img');

    send.mockRejectedValueOnce(new Error('fallo persona@example.com'));
    await expect(
      new MailService().enviarBienvenida('persona@example.com', 'Ana'),
    ).resolves.toBeUndefined();

    expect(registros.length).toBeGreaterThan(0);
    expect(JSON.stringify(registros)).not.toContain('persona@example.com');
  });
});

describe('MailService reset de contraseña', () => {
  let erroresRegistrados: unknown[];

  beforeEach(() => {
    erroresRegistrados = [];
    vi.stubEnv('RESEND_API_KEY', 'test-key');
    vi.stubEnv('RESEND_TEMPLATE_RESET_ID', 'reset-password');
    send.mockReset();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(
      (message: unknown) => {
        erroresRegistrados.push(message);
      },
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: 'validation_error',
      statusCode: 422,
      message:
        'The requested template is in draft status and cannot be used to send emails. Please publish the template to use it',
    },
    {
      name: 'validation_error',
      statusCode: 422,
      message:
        'The template is not published. Publish the template before sending emails.',
    },
    { name: 'not_found', statusCode: 404, message: 'Template not found' },
  ])(
    'envía HTML cuando la plantilla no está disponible: $message',
    async (error) => {
      send.mockResolvedValueOnce({ error, data: null });
      send.mockResolvedValueOnce({ error: null, data: { id: 'sent' } });

      await expect(
        new MailService().enviarResetPassword(
          'persona@example.com',
          'Ana <img src=x> & familia',
          '123456',
        ),
      ).resolves.toBeUndefined();

      expect(send).toHaveBeenCalledTimes(2);
      const fallback = send.mock.calls[1][0];
      expect(fallback.to).toEqual(['persona@example.com']);
      expect(fallback).not.toHaveProperty('template');
      expect(fallback.html).toContain('Ana &lt;img src=x&gt; &amp; familia');
      expect(fallback.html).toContain('123456');
      expect(fallback.html).toContain('10 minutos');
      expect(fallback.html).not.toContain('<img');
    },
  );

  it('no reenvía una plantilla aceptada', async () => {
    send.mockResolvedValue({ error: null, data: { id: 'sent' } });

    await new MailService().enviarResetPassword(
      'persona@example.com',
      'Ana',
      '123456',
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].template).toEqual({
      id: 'reset-password',
      variables: { NOMBRE: 'Ana', CODIGO: '123456', MINUTOS: '10' },
    });
  });

  it.each([
    {
      name: 'application_error',
      statusCode: 500,
      message: 'Template service temporarily unavailable',
    },
    { name: 'rate_limit_exceeded', statusCode: 429, message: 'Rate limited' },
    { name: 'validation_error', statusCode: 422, message: 'Invalid recipient' },
    {
      name: 'validation_error',
      statusCode: 401,
      message: 'Template API key invalid',
    },
  ])(
    'no intenta otro envío ante un error que no es de disponibilidad de plantilla: $statusCode',
    async (error) => {
      send.mockResolvedValue({ error, data: null });

      await expect(
        new MailService().enviarResetPassword(
          'persona@example.com',
          'Ana',
          '123456',
        ),
      ).rejects.toThrow();
      expect(send).toHaveBeenCalledTimes(1);
    },
  );

  it('no reintenta ni registra datos del correo ante un error de transporte', async () => {
    send.mockRejectedValue(
      new Error('Request failed for persona@example.com code 123456'),
    );

    await expect(
      new MailService().enviarResetPassword(
        'persona@example.com',
        'Ana',
        '123456',
      ),
    ).rejects.toThrow();

    expect(send).toHaveBeenCalledTimes(1);
    const logs = JSON.stringify(erroresRegistrados);
    expect(logs).not.toContain('persona@example.com');
    expect(logs).not.toContain('123456');
  });

  it('propaga el fallo del fallback sin volver a enviar', async () => {
    send.mockResolvedValueOnce({
      error: {
        name: 'validation_error',
        statusCode: 422,
        message: 'Template is in draft status',
      },
      data: null,
    });
    send.mockResolvedValueOnce({
      error: { name: 'application_error', statusCode: 500, message: 'Failure' },
      data: null,
    });

    await expect(
      new MailService().enviarResetPassword(
        'persona@example.com',
        'Ana',
        '123456',
      ),
    ).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('envía HTML escapado directamente cuando no hay plantilla configurada', async () => {
    vi.stubEnv('RESEND_TEMPLATE_RESET_ID', '');
    send.mockResolvedValue({ error: null, data: { id: 'sent' } });

    await new MailService().enviarResetPassword(
      'persona@example.com',
      'Ana <b>',
      '123456',
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].html).toContain('Ana &lt;b&gt;');
  });
});
