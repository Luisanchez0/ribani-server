/**
 * Preflight de configuración WhatsApp (Meta Cloud API) de RIBANI.
 *
 * Valida las variables de entorno del módulo (ver docs/whatsapp.md,
 * sección "Activación posterior") SIN enviar nada a los destinatarios.
 *
 * Modos:
 *   node scripts/whatsapp-preflight.mjs          valida el .env y reporta estado
 *   node scripts/whatsapp-preflight.mjs --ping   además consulta Graph
 *                                                (GET /{version}/{phone_number_id})
 *                                                para verificar token y número
 *
 * Código de salida: 0 listo para activar, 1 pendiente/inválido.
 * Nunca imprime secretos completos: solo una máscara corta.
 */
import 'dotenv/config'

const CHEQUEOS = {
  WHATSAPP_ENABLED: {
    rol: 'Interruptor maestro del módulo.',
    valida: (v) => v === 'true' || v === 'false',
    nota: 'Esperado true o false; mantener false hasta tener consentimientos.',
  },
  WHATSAPP_ACCESS_TOKEN: {
    rol: 'Token de mensajería de la WABA (Bearer en Graph).',
    valida: (v) => v.length >= 30 && !/\s/.test(v),
    nota: 'Parece incompleto o con espacios.',
  },
  WHATSAPP_PHONE_NUMBER_ID: {
    rol: 'Id del teléfono de la WABA (envíos y filtro del webhook).',
    valida: (v) => /^\d+$/.test(v),
    nota: 'Debe ser numérico, sin +, espacios ni guiones.',
  },
  WHATSAPP_API_VERSION: {
    rol: 'Versión de Graph soportada por tu App de Meta.',
    valida: (v) => /^v\d+\.\d+$/.test(v),
    nota: 'Formato esperado: vX.Y (p. ej. v21.0).',
  },
  META_APP_SECRET: {
    rol: 'Firma HMAC del webhook POST (x-hub-signature-256).',
    valida: (v) => v.length >= 16 && !/\s/.test(v),
    nota: 'Longitud insuficiente; cópiala completa desde Meta > App > Secret.',
  },
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: {
    rol: 'Token propio para la verificación GET del webhook.',
    valida: (v) => v.length >= 12,
    nota: 'Genera un valor aleatorio largo; Meta lo compara en GET /webhooks/whatsapp.',
  },
  WHATSAPP_WORKER_ENABLED: {
    rol: 'Procesador de la cola (cada 15 s, lote de 10). Requerido para cualquier envío.',
    valida: (v) => v === 'true' || v === 'false',
    nota: 'Esperado true o false; actívalo tras validar una prueba del panel.',
  },
  WHATSAPP_REMINDERS_ENABLED: {
    rol: 'Cron de recordatorios de medicamento (cada minuto).',
    valida: (v) => v === 'true' || v === 'false',
    nota: 'Esperado true o false; último paso de la activación.',
  },
  WHATSAPP_BUSINESS_ACCOUNT_ID: {
    rol: 'Referencia operativa del WABA (no la usa el envío).',
    opcional: true,
  },
}

// Plantillas: no vacías; cada una alimenta un rincón distinto del flujo.
const PLANTILLAS = {
  WHATSAPP_TEST_TEMPLATE: {
    rol: 'Plantilla del botón de prueba del panel (cuerpo fijo, sin parámetros).',
    notaSiFalta: 'POST /whatsapp/destinatarios/:id/prueba no enviará nada.',
  },
  WHATSAPP_ALERT_TEMPLATE: {
    rol: 'Plantilla de alertas CRITICA. 4 parámetros de texto en orden: nombre del adulto, tipo, título, fecha UTC ISO 8601.',
    notaSiFalta: 'La cola no notificará alertas críticas por WhatsApp.',
  },
  WHATSAPP_REMINDER_TEMPLATE: {
    rol: 'Plantilla de recordatorios de medicamento (cuerpo fijo, sin parámetros).',
    notaSiFalta: 'El cron de recordatorios saltará todas las tomas.',
  },
}

const env = (clave) => (process.env[clave] ?? '').trim()

function evaluar(claves) {
  const pendientes = []
  const mejoras = []
  const filas = []

  for (const [clave, item] of Object.entries(claves)) {
    const valor = env(clave)
    const indefinida = typeof process.env[clave] === 'undefined'
    let estado
    if (indefinida || valor === '') {
      estado = item.opcional ? 'OPCIONAL VACÍA' : 'PENDIENTE'
    } else if (item.valida && !item.valida(valor)) {
      estado = 'INVÁLIDA'
    } else {
      estado = 'OK'
    }

    if (estado === 'PENDIENTE' || estado === 'INVÁLIDA') {
      pendientes.push(
        `${clave} — ${estado === 'INVÁLIDA' ? (item.nota ?? 'valor inválido') : item.rol}`,
      )
    } else if (estado === 'OPCIONAL VACÍA') {
      mejoras.push(
        item.notaSiFalta
          ? `${clave} — ${item.notaSiFalta}`
          : `${clave} (opcional, sin definir)`,
      )
    }

    const mascara = valor ? `${valor.slice(0, 4)}••••` : '(sin definir)'
    filas.push(
      `${clave.padEnd(32)} ${estado.padEnd(15)} ${mascara.padEnd(12)} ${item.rol}`,
    )
  }

  return { pendientes, mejoras, filas }
}

const resultado = evaluar({ ...CHEQUEOS, ...PLANTILLAS })
for (const linea of resultado.filas) console.log(linea)

const listo = env('WHATSAPP_ENABLED') === 'true' && resultado.pendientes.length === 0

if (listo && process.argv.includes('--ping')) {
  const version = env('WHATSAPP_API_VERSION')
  const phoneId = env('WHATSAPP_PHONE_NUMBER_ID')
  const url = `https://graph.facebook.com/${version}/${phoneId}?fields=verified_name,display_phone_number`
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${env('WHATSAPP_ACCESS_TOKEN')}` },
      signal: AbortSignal.timeout(15_000),
    })
    const cuerpo = await response.json().catch(() => null)
    if (response.ok && cuerpo?.id) {
      console.log(
        `PING OK — token y teléfono verificados en Meta (id: ${cuerpo.id}, número: ${cuerpo.display_phone_number ?? '—'}).`,
      )
    } else {
      console.log(
        `PING FALLO — Graph respondió HTTP ${response.status}; error: ${
          cuerpo?.error?.code ?? cuerpo?.error?.message ?? 'desconocido'
        }. Revisa el token y los permisos de mensajería de la app.`,
      )
    }
  } catch {
    console.log('PING FALLO — no se pudo contactar Graph (red o timeout). No se cambió nada.')
  }
} else if (listo) {
  console.log('SUGERENCIA — corre con --ping cuando quieras validar token y número contra Graph.')
}

console.log('')
if (!listo) {
  if (env('WHATSAPP_ENABLED') !== 'true') {
    console.log('DOBLE CHECK — WHATSAPP_ENABLED sigue false (deshabilitado a propósito; docs/whatsapp.md).')
  }
  if (resultado.pendientes.length) {
    console.log('REQUERIDAS POR COMPLETAR:')
    for (const p of resultado.pendientes) console.log(`  - ${p}`)
  }
  if (resultado.mejoras.length) {
    console.log('OPCIONALES / PASOS POSTERIORES:')
    for (const m of resultado.mejoras) console.log(`  - ${m}`)
  }
  process.exitCode = 1
} else {
  console.log(
    env('WHATSAPP_WORKER_ENABLED') === 'true'
      ? 'LISTO — reinicia el backend y envía una prueba desde /panel/whatsapp.'
      : 'LISTO — activa WHATSAPP_WORKER_ENABLED=true, reinicia y envía una prueba desde /panel/whatsapp.',
  )
}
