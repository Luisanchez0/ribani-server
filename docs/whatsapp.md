# WhatsApp — Meta Cloud API

La integración está preparada y **deshabilitada por defecto**. No se han enviado
mensajes reales. No se cambiaron tablas, políticas ni datos en Supabase.

## Datos existentes y autorización

Se reutilizan `whatsapp_destinatarios`, `notificaciones_whatsapp`,
`whatsapp_estados_proveedor` y `configuracion_adulto`. Se verificaron restricciones,
índices y políticas en la base real mediante una transacción READ ONLY. RLS está
habilitado sin políticas en estas tablas: el acceso del producto pasa exclusivamente
por NestJS/Prisma y su autorización. La web no utiliza claves de Supabase.

- Cada usuario puede registrar únicamente el teléfono de su propio perfil en E.164
  y declarar o revocar su consentimiento. El registro inicial siempre es PENDIENTE.
- Solo un administrador registra contactos de emergencia. Para aceptar su opt-in
  indica FORMULARIO/OTRO y debe conservar la evidencia del titular fuera del sistema.
  El esquema actual guarda origen y fechas, no el documento de evidencia.
- Un administrador puede revocar cualquier destinatario, pero no aceptar por otro
  usuario con cuenta. El familiar tampoco acepta por el adulto.
- El teléfono sigue teniendo que coincidir con el perfil/contacto activo al enviar.
  No se implementó verificación OTP de propiedad del número.
- Historial individual: únicamente destinatarios del usuario. Administrador: todos.
  El resumen por alerta solo contiene conteos y requiere `alertas.leer` y acceso al
  adulto mediante vínculo ACTIVA. No revela teléfonos de otros destinatarios.
- Preferencias: adulto propio, administrador o familiar con vínculo ACTIVA; para
  modificar se exige `puede_gestionar_medicamentos` al familiar.
  Ese permiso no permite cambiar las notificaciones generales del adulto;
  ese interruptor lo administra el adulto o un administrador.

## Activación posterior

1. Crear/configurar portfolio empresarial, WABA y número en Meta. Conservar tokens
   y secretos únicamente en `ribani-server/.env`. Consultar `.env.example`.
2. Configurar `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, versión soportada
   `WHATSAPP_API_VERSION`, `META_APP_SECRET` y un `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   aleatorio. `WHATSAPP_BUSINESS_ACCOUNT_ID` es una referencia operativa; no es
   necesario para el endpoint de envío. El token requiere permisos de mensajería.
3. Crear plantillas aprobadas y configurar su idioma exacto:
   - `WHATSAPP_TEST_TEMPLATE`: cuerpo fijo, sin parámetros.
   - `WHATSAPP_ALERT_TEMPLATE`: cuatro parámetros de texto, en este orden: nombre
     del adulto, tipo de alerta, título y fecha UTC ISO 8601.
   - `WHATSAPP_REMINDER_TEMPLATE`: cuerpo fijo sin datos clínicos ni parámetros.
   - `WHATSAPP_TEMPLATE_LANGUAGE`: `es_MX` por defecto; debe coincidir con Meta.
4. Publicar HTTPS `GET/POST /webhooks/whatsapp`, verificarlo y suscribirse a
   `messages` para el número/WABA. GET compara verify token. POST valida HMAC
   SHA-256 con App Secret sobre los bytes originales (`rawBody`). No usa JWT.
5. Registrar un destinatario consentido. Activar `WHATSAPP_ENABLED=true` y
   `WHATSAPP_WORKER_ENABLED=true`, reiniciar backend y encolar una prueba desde
   `/panel/whatsapp` o `/admin/whatsapp`. Revisar historial y callbacks.
6. Activar `WHATSAPP_REMINDERS_ENABLED=true` únicamente después de validar la
   prueba y las preferencias del adulto. Los recordatorios se envían al propio
   adulto, no automáticamente a familiares. Las alertas críticas se envían a
   contactos activos y familiares con vínculo activo y consentimiento aceptado.

**Activar el procesador también procesa las notificaciones ya encoladas** cuya
plantilla esté configurada y cuyo destino siga habilitado. Revisar historial y
consentimientos antes de activar. Las alertas ya creadas no se reencolan al añadir
una plantilla posteriormente.

### Preflight rápido

Al completar las credenciales, valida el `.env` con:

```bash
node scripts/whatsapp-preflight.mjs        # reporte por variable (sin enviar)
node scripts/whatsapp-preflight.mjs --ping # además verifica token y número en Graph
```

El reporte marca OK/PENDIENTE/INVÁLIDA por variable con su propósito, lista las
faltantes y sale 0 solo cuando el módulo puede activarse (código 1 mientras haya
pendientes). El modo `--ping` hace una consulta de lectura a Graph con el token;
no envía mensajes ni modifica nada en Meta.

## Cola, entrega y recordatorios

El cron del procesador corre cada 15 segundos, con lotes de hasta diez filas.
Reclama filas de forma atómica mediante `FOR UPDATE SKIP LOCKED`, máximo tres
intentos. Cada envío usa bloqueo transaccional sobre el destinatario, compartido
con la revocación. Una revocación espera a que termine el envío que ya está en curso;
cuando responde, el consentimiento anterior ya no autoriza nuevos envíos.

Solo un rechazo HTTP 429 permite reintento automático con espera creciente. Timeout,
respuesta 5xx, resultado incierto y procesos interrumpidos requieren revisión en Meta
antes de reenviar. Una fila PROCESANDO abandonada cinco minutos se marca FALLIDA con
`RESULTADO_DESCONOCIDO`, sin reenvío automático. No se promete entrega exactamente
una vez ni se intenta reconstruir un wamid perdido después de aceptación externa.

ENVIADA significa aceptada por Meta; ENTREGADA/LEIDA se obtienen del webhook.
Los callbacks se deduplican y no degradan LEIDA/ENTREGADA con eventos anteriores.
Si el callback llega antes de guardar el wamid, se responde 503 durante dos minutos
para solicitar reentrega. Estados de mensajes ajenos/antiguos sin fila se ignoran.
El historial guarda estados, fechas y códigos; no cuerpos completos del proveedor,
tokens, textos recibidos ni datos de facturación. Las pruebas se limitan a una por
minuto y destinatario.

Los recordatorios se revisan cada minuto, paginando tomas PENDIENTE de las últimas
26 horas (ventana máxima permitida por el esquema). Se respeta configuración global,
configuración del adulto, consentimiento, medicamento activo y vigencia de la toma.
Para POSPUESTA se espera `recordar_en` (updated_at + diez minutos); los avisos
cancelados antes del aplazamiento no consumen su límite. No cambia la ventana
original para registrar la toma.
Se encola un aviso inicial y hasta `max_repeticiones`, sin acumular avisos mientras
otro espera envío. La separación se mide desde el último envío. Se usa un bloqueo
transaccional por toma para coordinar varias instancias. Registrar la toma, revocar
consentimiento o deshabilitar preferencias cancela próximos envíos al procesarlos.
Los fallos también consumen el límite de avisos para evitar generar mensajes sin fin.

## API y comprobaciones

Swagger `/api` y `openapi.json` documentan `/whatsapp/integracion`,
`/whatsapp/destinatarios`, `/:id/consentimiento`, `/:id/prueba`,
`/whatsapp/historial`, `/whatsapp/alertas/resumen` y
`/whatsapp/adultos/:adultoId/preferencias`.

Ejecutar desde backend `npm test`, `npm run lint`, `npm run openapi:export`;
desde web `npm run api:types`, `npm test`, `npm run lint`, `npm run build`.
Las pruebas usan Prisma/transporte simulados y no escriben en la base real.
No se validó entrega real ni un webhook público sin activos de Meta.

Referencias primarias consultadas:
- [Colección oficial de Meta](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api)
- [Envío de plantilla](https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text)
- [Raw body en NestJS](https://docs.nestjs.com/faq/raw-body)
- [Ejemplo de firmas de Meta](https://github.com/fbsamples/whatsapp-api-examples/tree/main/signature-validation-with-webhooks-payloads)
