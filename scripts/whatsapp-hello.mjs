/**
 * Prueba de canal: envía la plantilla hello_world de Meta a un número.
 * No usa la cola ni el worker, y sirve mientras las plantillas de RIBANI siguen
 * en revisión. Con la app suscrita, el webhook recibe sus estados y los ignora
 * porque el mensaje no pertenece a la cola.
 *
 *   node scripts/whatsapp-hello.mjs +5215512345678
 *   node scripts/whatsapp-hello.mjs +5215512345678 --texto
 *
 * --texto envía texto libre: Meta solo lo entrega si esa persona escribió al
 * número en las últimas 24 horas, y no depende de plantillas.
 *
 * El número debe estar autorizado en Meta si se usa el número de prueba.
 * Nunca imprime el token.
 */
import 'dotenv/config'

const env = (clave) => (process.env[clave] ?? '').trim()
const telefono = (process.argv[2] ?? '').trim()

if (!/^\+[1-9]\d{7,14}$/.test(telefono)) {
  console.error('Indica el número en formato E.164, por ejemplo: +5215512345678')
  process.exit(1)
}

const response = await fetch(
  `https://graph.facebook.com/${env('WHATSAPP_API_VERSION')}/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('WHATSAPP_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefono.slice(1),
      ...(process.argv.includes('--texto')
        ? {
            type: 'text',
            text: { body: 'Prueba de RIBANI: mensaje dentro de la ventana de 24 horas.' },
          }
        : {
            type: 'template',
            template: { name: 'hello_world', language: { code: 'en_US' } },
          }),
    }),
  },
)
const cuerpo = await response.json().catch(() => null)

if (response.ok && cuerpo?.messages?.[0]?.id) {
  console.log(`ACEPTADO por Meta. Revisa WhatsApp en ${telefono}.`)
} else {
  const error = cuerpo?.error
  console.error(`RECHAZADO — HTTP ${response.status}; código ${error?.code ?? 'desconocido'}.`)
  if (error?.code === 131030) {
    console.error('Ese número no está autorizado: añádelo en Meta, en WhatsApp > Configuración de la API.')
  }
  process.exitCode = 1
}
