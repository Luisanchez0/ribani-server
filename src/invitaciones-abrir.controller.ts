import { Controller, Get, Header, Query } from '@nestjs/common';

/**
 * Página puente para el botón del correo:
 *
 * Gmail y la mayoría de clientes web desactivan los enlaces con esquemas
 * custom (ribani://) por anti-phishing. Este endpoint HTTPS sí es clicable
 * desde cualquier cliente y hace el intento de abrir la app con un redirect
 * client-side; si la app no está instalada, la página se queda mostrando
 * instrucciones.
 */
@Controller('invitaciones')
export class InvitacionesAbrirController {
  @Get('abrir')
  @Header('Content-Type', 'text/html; charset=utf-8')
  abrir(@Query('sub') _sub?: string): string {
    return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Abrir RIBANI</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        background: #f8fafc;
        color: #1e293b;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        margin: 0;
        padding: 24px;
        text-align: center;
      }
      .card {
        max-width: 420px;
      }
      .btn {
        display: inline-block;
        margin-top: 16px;
        padding: 12px 24px;
        background: #006b3c;
        color: #fff;
        border-radius: 6px;
        text-decoration: none;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Abrir la app RIBANI</h2>
      <p id="mensaje">Abriendo la app…</p>
      <a class="btn" href="ribani://invitaciones" id="btn">Abrir la app</a>
      <p style="margin-top:16px;color:#64748b;font-size:14px">
        Si no se abre, instala la app RIBANI desde Play Store y vuelve a
        tocar el botón de tu correo.
      </p>
    </div>
    <script>
      // Intento automático de deep link: si la app no responde, la
      // página queda abierta con el botón manual y las instrucciones.
      var abierto = false;
      function intentar() {
        abierto = true;
        window.location.href = 'ribani://invitaciones';
      }
      setTimeout(intentar, 300);
      setTimeout(function () {
        if (document.hidden) return;
      }, 1200);
    </script>
  </body>
</html>`;
  }
}
