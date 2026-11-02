/**
 * Suscribe la app de Meta del token a la WABA para recibir sus webhooks.
 * Es idempotente y no envía mensajes. Nunca imprime el token.
 *
 *   node scripts/whatsapp-suscribir-app.mjs
 */
import 'dotenv/config'

const env = (clave) => (process.env[clave] ?? '').trim()
const url = `https://graph.facebook.com/${env('WHATSAPP_API_VERSION')}/${env('WHATSAPP_BUSINESS_ACCOUNT_ID')}/subscribed_apps`
const headers = { Authorization: `Bearer ${env('WHATSAPP_ACCESS_TOKEN')}` }

const alta = await fetch(url, { method: 'POST', headers, signal: AbortSignal.timeout(15_000) })
const cuerpo = await alta.json().catch(() => null)
if (!alta.ok) {
  console.error(`RECHAZADO — HTTP ${alta.status}; código ${cuerpo?.error?.code ?? 'desconocido'}.`)
  process.exit(1)
}

const lista = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
const apps = (await lista.json().catch(() => null))?.data ?? []
console.log('SUSCRITA. Apps de la WABA:')
for (const app of apps) console.log(`  - ${app.whatsapp_business_api_data?.name ?? 'sin nombre'}`)
