/**
 * Plantillas de WhatsApp (Meta Cloud API) de RIBANI.
 *
 * Define las tres plantillas que el backend espera (docs/whatsapp.md) y, si se
 * pide, las registra en la WABA configurada. Los nombres devueltos son los que
 * deben ir en las variables de .env del mismo nombre.
 *
 * Modos:
 *   node scripts/whatsapp-plantillas.mjs          muestra el payload (no llama a Meta)
 *   node scripts/whatsapp-plantillas.mjs --crear  las registra en la WABA
 *
 * El segundo modo requiere WHATSAPP_ACCESS_TOKEN, WHATSAPP_API_VERSION y
 * WHATSAPP_BUSINESS_ACCOUNT_ID. Nunca imprime el token ni envía mensajes a
 * destinatarios; solo da de alta plantillas (quedan PENDING hasta la revisión
 * de Meta).
 *
 * Código de salida: 0 correcto o solo dry-run, 1 error de configuración o de Meta.
 */
import 'dotenv/config'

const IDIOMA =
  (process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? '').trim() || 'es_MX'
const CATEGORIA = 'UTILITY'

/**
 * Cuerpos sin datos clínicos ni enlaces: la plantilla de alerta recibe los
 * cuatro parámetros en el orden en que los encola whatsapp.service.ts
 * (nombre del adulto, tipo, título, fecha UTC ISO 8601). Las variables no
 * pueden abrir ni cerrar el cuerpo.
 */
const PLANTILLAS = [
  {
    variable: 'WHATSAPP_TEST_TEMPLATE',
    nombre: 'ribani_prueba',
    parametros: [],
    cuerpo:
      'Mensaje de prueba de RIBANI. Si estás leyendo esto, tus notificaciones por WhatsApp están funcionando. No necesitas responder.',
  },
  {
    variable: 'WHATSAPP_ALERT_TEMPLATE',
    nombre: 'ribani_alerta_critica',
    parametros: [
      'Ana Pérez',
      'SOS',
      'Botón de emergencia activado',
      '2026-01-31T18:42:00.000Z',
    ],
    cuerpo:
      'RIBANI: alerta para {{1}}. Motivo: {{2}}. Detalle: {{3}}, registrada el {{4}} (UTC). Abre la app para revisarla.',
  },
  {
    variable: 'WHATSAPP_REMINDER_TEMPLATE',
    nombre: 'ribani_recordatorio_medicamento',
    parametros: [],
    cuerpo:
      'RIBANI: es hora de tu medicamento. Abre la app y confirma la toma o márcala como omitida. Si ya la registraste, ignora este mensaje.',
  },
]

const env = (clave) => (process.env[clave] ?? '').trim()

function variablesDe(cuerpo) {
  return [...cuerpo.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]))
}

function construir(plantilla) {
  const encontradas = variablesDe(plantilla.cuerpo)
  const esperadas = plantilla.parametros.length
  const secuenciales = encontradas.every((n, i) => n === i + 1)
  if (encontradas.length !== esperadas || !secuenciales)
    throw new Error(
      `${plantilla.nombre}: el cuerpo debe usar exactamente {{1}}..{{${esperadas}}} en orden.`,
    )
  if (plantilla.cuerpo.length > 1024)
    throw new Error(`${plantilla.nombre}: el cuerpo supera los 1024 caracteres.`)
  if (plantilla.cuerpo.startsWith('{{') || plantilla.cuerpo.endsWith('}}'))
    throw new Error(
      `${plantilla.nombre}: Meta no admite una variable al inicio ni al final del cuerpo.`,
    )

  const body = { type: 'BODY', text: plantilla.cuerpo }
  if (esperadas)
    body.example = { body_text: [plantilla.parametros] }

  return {
    name: plantilla.nombre,
    language: IDIOMA,
    category: CATEGORIA,
    components: [body],
  }
}

async function crear(payload) {
  const version = env('WHATSAPP_API_VERSION')
  const waba = env('WHATSAPP_BUSINESS_ACCOUNT_ID')
  const token = env('WHATSAPP_ACCESS_TOKEN')
  const url = `https://graph.facebook.com/${version}/${waba}/message_templates`
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify(payload),
  })
  const cuerpo = await respuesta.json().catch(() => null)
  return { ok: respuesta.ok, status: respuesta.status, cuerpo }
}

const crearDeVerdad = process.argv.includes('--crear')

if (crearDeVerdad) {
  const faltantes = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_API_VERSION',
    'WHATSAPP_BUSINESS_ACCOUNT_ID',
  ].filter((clave) => !env(clave))
  if (faltantes.length) {
    console.error(
      `FALTAN VARIABLES para --crear: ${faltantes.join(', ')} (usa los datos de la WABA de prueba).`,
    )
    process.exit(1)
  }
  if (!/^v\d+\.\d+$/.test(env('WHATSAPP_API_VERSION'))) {
    console.error('WHATSAPP_API_VERSION debe tener el formato vX.Y (p. ej. v21.0).')
    process.exit(1)
  }
  if (!/^\d+$/.test(env('WHATSAPP_BUSINESS_ACCOUNT_ID'))) {
    console.error('WHATSAPP_BUSINESS_ACCOUNT_ID debe ser el id numérico del WABA.')
    process.exit(1)
  }
}

let fallos = 0
for (const plantilla of PLANTILLAS) {
  const payload = construir(plantilla)
  const resumen =
    `${plantilla.variable}="${plantilla.nombre}"` +
    `  · ${plantilla.parametros.length ? `${plantilla.parametros.length} parámetros` : 'sin parámetros'}` +
    `  · ${CATEGORIA} · ${IDIOMA}`

  if (!crearDeVerdad) {
    console.log(resumen)
    console.log(JSON.stringify(payload, null, 2))
    console.log('')
    continue
  }

  const { ok, status, cuerpo } = await crear(payload)
  const yaExiste =
    !ok && typeof cuerpo?.error?.error_user_msg === 'string'
      ? /already exists/i.test(cuerpo.error.error_user_msg)
      : false

  if (ok) {
    console.log(
      `CREADA   ${plantilla.nombre} (id ${cuerpo?.id ?? 'n/a'}, estado ${cuerpo?.status ?? 'PENDING'}) → ${plantilla.variable}`,
    )
  } else if (yaExiste) {
    console.log(
      `YA EXISTE ${plantilla.nombre} → ${plantilla.variable} (revisa idioma y categoría en Meta)`,
    )
  } else {
    fallos++
    const detalle =
      cuerpo?.error?.error_user_msg ??
      cuerpo?.error?.message ??
      `HTTP ${status}`
    console.error(`ERROR    ${plantilla.nombre}: ${detalle}`)
  }
}

console.log('')
if (crearDeVerdad) {
  console.log(
    'Meta revisa cada plantilla: mientras estén PENDING el envío falla. Cuando aparezcan como APPROVED,',
  )
  console.log('repite este script sin --crear para comparar nombres y luego activa los envíos.')
} else {
  console.log(
    'Nombres para .env (deben coincidir con Meta, en minúsculas y sin espacios):',
  )
  for (const p of PLANTILLAS) console.log(`  ${p.variable}="${p.nombre}"`)
  console.log('')
  console.log(
    'Para registrarlas en la WABA: node scripts/whatsapp-plantillas.mjs --crear',
  )
  console.log(
    `Idioma usado: ${IDIOMA.trim()}. Debe coincidir con WHATSAPP_TEMPLATE_LANGUAGE.`,
  )
}

if (fallos) process.exit(1)
