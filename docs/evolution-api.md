# Evolution API en RIBANI

Guía para configurar **Evolution API** como proveedor de WhatsApp del backend de
RIBANI y poder enviar mensajes de prueba sin depender de la API de Meta.

> [!IMPORTANT]
> Evolution API sobre Baileys usa WhatsApp Web, no la API oficial. Incumple los
> Términos de WhatsApp y el número puede ser suspendido. Úsala solo en desarrollo
> y con un número desechable. **RIBANI usa Meta Cloud API** (`docs/whatsapp.md`);
> este proveedor fue solo un respaldo y no forma parte del despliegue. Para
> levantarlo en el VPS está `deploy/vps/compose.evolution.yaml`.

## Cómo encaja en el proyecto

- `WHATSAPP_DRIVER=evolution` hace que el módulo WhatsApp inyecte
  `EvolutionWhatsappService` en lugar de `MetaWhatsappService`
  (`src/whatsapp/whatsapp.module.ts`).
- La cola, el worker, los consentimientos y el historial son los mismos. Cambian
  dos cosas: no hay plantillas aprobadas (el mensaje se compone como texto libre)
  y la autenticación del webhook es un `apikey`, no un HMAC de Meta.
- Cada fila de `notificaciones_whatsapp` se marca con `proveedor = 'EVOLUTION_API'`,
  y el worker y el webhook solo procesan las filas de su propio canal.

## Requisitos

- Docker con Compose (el `compose.yaml` de abajo se validó con Docker 29 / Compose v5).
- Un número de WhatsApp disponible para escanear un QR, distinto del personal.
- Backend de RIBANI con su `.env` y acceso a Supabase.

## Paso 1 — Levantar Evolution API

Esta máquina ya tiene la carpeta lista en **`C:\PROYECTOS\evolution`** (hermana de
`ribani-server`, fuera de todos los repos): `compose.yaml` y un `.env` con
`AUTHENTICATION_API_KEY` y `POSTGRES_PASSWORD` generados al azar. En otra máquina,
crea esa misma carpeta fuera del repositorio y replica ambos archivos.

Usa su **propio** PostgreSQL: nunca el de RIBANI ni el de Supabase.

```yaml
services:
  evolution-postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: evolution
    volumes:
      - evolution_pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U evolution"]
      interval: 5s
      timeout: 5s
      retries: 12

  evolution-api:
    image: evoapicloud/evolution-api:latest
    depends_on:
      evolution-postgres:
        condition: service_healthy
    ports:
      - "127.0.0.1:8080:8080"
    environment:
      SERVER_URL: http://localhost:8080
      AUTHENTICATION_API_KEY: ${AUTHENTICATION_API_KEY}
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://evolution:${POSTGRES_PASSWORD}@evolution-postgres:5432/evolution?schema=evolution_api
      CACHE_REDIS_ENABLED: "false"
      TELEMETRY_ENABLED: "false"
    volumes:
      - evolution_instances:/evolution/instances

volumes:
  evolution_pg:
  evolution_instances:
```

Docker Compose lee el `.env` de la misma carpeta para sustituir `${...}`. Genera las
claves con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
y guárdalas así (el archivo nunca se versiona):

```env
AUTHENTICATION_API_KEY=<64 caracteres hex>
POSTGRES_PASSWORD=<32 caracteres hex>
```

```bash
docker compose up -d
docker compose logs -f evolution-api     # espera a que terminen las migraciones y arranque
curl http://localhost:8080/              # devuelve la versión instalada
```

Notas:

- `AUTHENTICATION_API_KEY` es la clave global del header `apikey`. Debe ser larga
  y aleatoria; es la misma que irá en el `.env` del backend. Se lee con
  `grep AUTHENTICATION_API_KEY .env`.
- Sin Redis (`CACHE_REDIS_ENABLED=false`) es suficiente para pruebas.
- El volumen `evolution_instances` conserva la sesión de WhatsApp entre reinicios.
- Existe un panel opcional (`evoapicloud/evolution-manager`) si prefieres interfaz
  gráfica; no es necesario, todos los pasos se pueden hacer por API.

## Paso 2 — Crear la instancia y conectar el número

```bash
API=http://localhost:8080
KEY=$(grep -o 'AUTHENTICATION_API_KEY=.*' .env | cut -d= -f2)

curl -s -X POST "$API/instance/create" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{
    "instanceName": "RibaniNotifications",
    "integration": "WHATSAPP-BAILEYS",
    "qrcode": true,
    "webhook": {
      "enabled": false,
      "url": "",
      "events": ["MESSAGES_UPDATE", "SEND_MESSAGE"]
    }
  }'
```

> Si `/instance/fetchInstances` ya lista la instancia, **no repitas el `POST`**: responde
error por nombre duplicado. Salta directo al QR.

El campo `webhook` es opcional y se puede configurar después (paso 6). Para
escanear el QR:

```bash
curl -s "$API/instance/connect/RibaniNotifications" -H "apikey: $KEY"
```

La respuesta incluye el QR en base64 (`base64` / `qrcode.base64`). Abre esa imagen,
o revisa `docker compose logs -f evolution-api` si prefieres el QR en consola, y
escanea desde WhatsApp → Dispositivos vinculados. Comprueba el estado con:

Consúltalo con:

```bash
curl -s "$API/instance/connectionState/RibaniNotifications" -H "apikey: $KEY"
# state debe ser "open"
```

El nombre de instancia debe coincidir exactamente con el de `/instance/fetchInstances`.
En esta máquina la instancia ya existe como **`RibaniNotifications`** con la sesión
`open`, así que usa ese nombre. Si eliges otro, cámbialo también en el `.env` del
backend.

## Paso 3 — Configurar el backend

En `ribani-server/.env` (nunca en Git):

```env
WHATSAPP_DRIVER="evolution"
WHATSAPP_ENABLED=true
WHATSAPP_WORKER_ENABLED=true
# Actívalo solo después de validar la prueba y las preferencias del adulto.
WHATSAPP_REMINDERS_ENABLED=false

WHATSAPP_EVOLUTION_URL="http://localhost:8080"
WHATSAPP_EVOLUTION_APIKEY="<AUTHENTICATION_API_KEY de C:/PROYECTOS/evolution/.env>"
WHATSAPP_EVOLUTION_INSTANCE="RibaniNotifications"

# Evolution no usa plantillas: estos valores son etiquetas internas de la cola.
WHATSAPP_TEST_TEMPLATE="ribani_prueba"
WHATSAPP_ALERT_TEMPLATE="ribani_alerta"
WHATSAPP_REMINDER_TEMPLATE="ribani_recordatorio"
```

| Variable | Para qué sirve |
| --- | --- |
| `WHATSAPP_DRIVER` | `evolution` selecciona el transporte nuevo; cualquier otro valor usa Meta. |
| `WHATSAPP_ENABLED` | Interruptor global; sin `true`, `disponible()` es falso y no se envía nada. |
| `WHATSAPP_WORKER_ENABLED` | Habilita el cron de envío (cada 15 s). |
| `WHATSAPP_EVOLUTION_URL` | Base de la instancia, sin `/` final. |
| `WHATSAPP_EVOLUTION_APIKEY` | Clave del header `apikey`, también valida el webhook. |
| `WHATSAPP_EVOLUTION_INSTANCE` | Nombre exacto de la instancia creada. |
| `WHATSAPP_*_TEMPLATE` | Nombres ficticios obligatorios: sin ellos no se encola nada. |
| `WHATSAPP_TEMPLATE_LANGUAGE` | No se usa con Evolution (solo Meta). |
| `WHATSAPP_EVOLUTION_TEST_TEXTO` | Opcional: reemplaza el texto de la prueba. |
| `WHATSAPP_EVOLUTION_REMINDER_TEXTO` | Opcional: reemplaza el recordatorio de toma. |

Reinicia el backend (`npm run start:dev`) para que el módulo tome el driver.

## Paso 4 — Permitir el proveedor en Supabase

`EVOLUTION_API` cabe en `varchar(20)`, pero la columna `proveedor` tiene un `CHECK`
que solo admite `META_CLOUD_API`. Con el driver nuevo cada INSERT falla con:

```
ERROR: 23514: new row for relation "notificaciones_whatsapp"
violates check constraint "wa_notificacion_proveedor_chk"
```

La restricción se llama **`wa_notificacion_proveedor_chk`**. Confirma su definición
en el editor SQL de Supabase antes de tocarla:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'notificaciones_whatsapp'::regclass AND contype = 'c';
```

En la base actual la restricción admite `META_CLOUD_API`, `TWILIO` y `OTRO`. Hay que
conservarlos y añadir `EVOLUTION_API` (operación aditiva: no borra filas y las
existentes siguen válidas):

```sql
ALTER TABLE notificaciones_whatsapp
  DROP CONSTRAINT wa_notificacion_proveedor_chk,
  ADD CONSTRAINT wa_notificacion_proveedor_chk
  CHECK (proveedor IN ('META_CLOUD_API', 'TWILIO', 'OTRO', 'EVOLUTION_API'));
```

Si en otro entorno la definición tuviera valores distintos, consérvalos: reemplazar
el `CHECK` por una lista más corta hace fallar el `ADD` si quedan filas antiguas con
los valores eliminados.

El `DROP` y el `ADD` van en la misma sentencia, así que la tabla nunca queda sin
restricción. Verifica el resultado (debe listar ambos valores):

```sql
SELECT pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conname = 'wa_notificacion_proveedor_chk';
```

No hace falta reiniciar el backend ni tocar `schema.prisma`: el cambio es solo de
base de datos y el tipo Prisma ya es `String`. Las peticiones que fallaron con 500
por este motivo deben repetirse (la fila nunca llegó a insertarse).

## Paso 5 — Probar el envío

`$TOKEN` es el access token JWT del usuario y `$ID` el `id` del destinatario que
devuelve el alta.

1. Registra el teléfono del titular en su perfil en formato E.164 (`+52...`) y crea
   el destinatario:

   ```bash
   curl -s -X POST http://localhost:3000/whatsapp/destinatarios \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"telefono_e164":"+525512345678"}'
   ```

2. Acepta el consentimiento (lo declara el propio titular):

   ```bash
   curl -s -X PATCH http://localhost:3000/whatsapp/destinatarios/$ID/consentimiento \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"aceptado":true}'
   ```

3. Encola una prueba y espera hasta 15 s (el worker corre cada 15 s):

   ```bash
   curl -s -X POST http://localhost:3000/whatsapp/destinatarios/$ID/prueba \
     -H "Authorization: Bearer $TOKEN"
   ```

4. Revisa el resultado en `GET /whatsapp/integracion` (con JWT: debe devolver
   `"proveedor": "EVOLUTION_API"` y `"habilitada": true`) y en
   `GET /whatsapp/historial` (la notificación pasa de EN_COLA a ENVIADA y, si hay
   webhook, acumula eventos ENTREGADA/LEIDA).

Cada prueba se limita a una por minuto y destinatario. Lo que queda encolado con el
proveedor anterior no se envía al cambiar de driver: vuelve a generar las pruebas o
recordatorios después de cambiar.

## Paso 6 — Webhook de estados (opcional)

Sin webhook las filas se quedan en ENVIADA. Con él pasan a ENTREGADA/LEIDA y los
fallos se registran en `whatsapp_estados_proveedor`.

La URL debe ser alcanzable desde el contenedor. Para desarrollo local publica el
backend con un túnel (por ejemplo `ngrok http 3000`) y usa esa URL.

```bash
curl -s -X POST "$API/webhook/set/RibaniNotifications" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "https://TU-TUNEL.ngrok-free.app/webhooks/whatsapp/evolution",
      "byEvents": false,
      "base64": false,
      "events": ["MESSAGES_UPDATE", "SEND_MESSAGE"]
    }
  }'

curl -s "$API/webhook/find/RibaniNotifications" -H "apikey: $KEY"
```

- En algunas versiones la ruta de actualización y el cuerpo cambian
  (`/webhook/instance` con `{url, enabled, events}`). Verifica la ruta exacta en el
  Swagger de tu versión: `/docs` (la raíz `/` devuelve la versión instalada).
- Alternativa sin llamadas: declarar el `webhook` directamente en `/instance/create`.
- El backend valida el header `apikey` contra `WHATSAPP_EVOLUTION_APIKEY` e ignora
  callbacks de otras instancias. No usa el `META_APP_SECRET`.
- Evolution no envía ese header por sí sola: añade
  `"headers": {"apikey": "<AUTHENTICATION_API_KEY>"}` dentro de `webhook` o el backend
  responderá 403. No se ha probado contra una instancia real.

Mapeo aplicado por el backend:

| Evento Evolution | Estado en RIBANI |
| --- | --- |
| `send.message` / `SERVER_ACK` | ENVIADA |
| `DELIVERY_ACK` | ENTREGADA |
| `READ` / `PLAYED` | LEIDA |
| `ERROR` | FALLIDA |

## Qué texto se envía

| `tipo` de la notificación | Contenido |
| --- | --- |
| `PRUEBA` / `OTRA` | Texto fijo de prueba (`WHATSAPP_EVOLUTION_TEST_TEXTO`). |
| `ALERTA` / `SOS` | Nombre del adulto, tipo de alerta, título y fecha UTC (mismos parámetros que la plantilla de Meta). |
| `MEDICAMENTO` | Texto fijo de recordatorio (`WHATSAPP_EVOLUTION_REMINDER_TEXTO`). |
| Otro | Se unen los parámetros; si no hay, `RIBANI: <plantilla>`. |

El recordatorio sigue exigiendo `WHATSAPP_REMINDERS_ENABLED=true`, una toma
PENDIENTE/POSPUESTA, medicamento activo y preferencias del adulto habilitadas.

## Problemas frecuentes

| Síntoma | Causa probable |
| --- | --- |
| `prueba` responde 503 «Configura el proveedor…» | `WHATSAPP_DRIVER`, `WHATSAPP_ENABLED`, URL, apikey o instancia mal definidos, o falta `WHATSAPP_TEST_TEMPLATE`. |
| Fila FALLIDA con `HTTP_401` | `WHATSAPP_EVOLUTION_APIKEY` distinta de `AUTHENTICATION_API_KEY`. |
| Fila FALLIDA con `HTTP_404` | Nombre de instancia incorrecto o instancia eliminada. |
| Fila FALLIDA con `HTTP_400` | Número sin código de país o sesión de WhatsApp caída. |
| `RESULTADO_DESCONOCIDO` | La respuesta no traía `key.id` (timeout o mensaje rechazado). Revisa Meta/Evolution antes de reintentar. |
| Error 500 al pedir la prueba, o el INSERT falla con `violates check constraint "wa_notificacion_proveedor_chk"` | Falta el `ALTER` del `CHECK` de `proveedor` (paso 4). |
| No llega nada y la instancia no está `open` | Sesión cerrada: vuelve a escanear el QR de la instancia. |
| Webhook responde 403 | Header `apikey` ausente o distinto, o el evento es de otra instancia. |
| Webhook responde 503 «Identificador aún no persistido» | El callback llegó antes del `UPDATE`: Evolution reintenta; es normal. |
| `docker compose logs` muestra migraciones fallidas | El PostgreSQL del compose no arrancó a tiempo; usa el `healthcheck` del ejemplo. |

## Volver a Meta

```env
WHATSAPP_DRIVER="meta"
WHATSAPP_ENABLED=false
```

Restaura las plantillas aprobadas y credenciales descritas en `docs/whatsapp.md`.
No se borra nada: las filas con `proveedor = 'EVOLUTION_API'` quedan como historial.

## Referencias

- [Repositorio Evolution API](https://github.com/EvolutionAPI/evolution-api)
- [Documentación de webhooks](https://docs.evolutionfoundation.com.br/en/evolution-api/configuration/webhooks)
- [Imagen en Docker Hub](https://hub.docker.com/r/evoapicloud/evolution-api)
