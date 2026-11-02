# Despliegue en VPS

Guía para correr **RIBANI** en un servidor propio con Docker Compose y TLS
automático. Es la alternativa a `render.yaml` cuando se quiere el cron, los workers
y SSE siempre encendidos. WhatsApp usa **Meta Cloud API** (`docs/whatsapp.md`).

## Arquitectura

```
internet
   │ 443/80
   ▼
 caddy ──┬── api.dominio ──►  api (ribani-server:3000) ──► Supabase (externo)
         │                          └────────────────────► Meta Cloud API
         └── app.dominio ──►  web (nginx:80)
```

- **caddy** es el único servicio con puertos públicos: enruta dos dominios.
- **api** no publica puertos: solo Caddy lo alcanza (`expose`) y atiende también
  el webhook de Meta.
- **web** sirve el panel estático con nginx, solo visible desde la red interna.

Archivos: `Dockerfile` y `.dockerignore` en cada repo (`ribani-server` y
`ribani-web`, este último con `docker/nginx.conf`), y en `deploy/vps/` el
`compose.yaml`, el `Caddyfile` y `.env.example`. `compose.evolution.yaml` es un
añadido opcional solo para desarrollo (`docs/evolution-api.md`).

## Requisitos

- VPS con **2 GB de RAM mínimo** (4 GB cómodo) y 20 GB de disco. Ubuntu 24.04 o
  Debian 12.
- Docker Engine con el plugin `docker compose` (v2.20+).
- Un dominio con **dos registros A** que apunten al VPS: `api.tudominio.com`
  (backend) y `app.tudominio.com` (panel web). Ambos los sirve el mismo Caddy.
- Puertos **22, 80 y 443** abiertos. El 80 es necesario para el desafío de Let's
  Encrypt.

## Paso 1 — Preparar el servidor

```bash
# Docker oficial
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # vuelve a entrar por SSH después

# Firewall
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Comprueba el DNS antes de levantar Caddy: `dig +short api.tudominio.com` debe
devolver la IP del VPS.

## Paso 2 — Traer el repositorio

Los dos repos deben quedar como hermanos, porque el compose construye la imagen
del panel web desde `../../../ribani-web`:

```bash
mkdir -p /srv/ribani && cd /srv/ribani
git clone <repo-ribani-server> ribani-server
git clone <repo-ribani-web> ribani-web
cd ribani-server/deploy/vps
cp .env.example .env
chmod 600 .env
```

Rellena `.env` (nunca se versiona). Genera los secretos en el propio servidor:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # JWT_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # TWO_FACTOR_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"        # WHATSAPP_WEBHOOK_VERIFY_TOKEN
```

Claves que suelen confundirse:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | Pooler de Supabase, puerto **6543** |
| `DIRECT_URL` | Conexión directa de Supabase, puerto **5432** |
| `CORS_ORIGINS` | Origen exacto del panel web, con HTTPS y sin `/` final |
| `WEB_DOMAIN` | Dominio del panel, solo host (`app.tudominio.com`) |
| `PUBLIC_API_URL` | URL HTTPS de la API que se **incrusta en el bundle** del panel |
| `API_DOMAIN` | Solo el host, sin `https://` (`api.tudominio.com`) |
| `META_APP_SECRET` | Secreto de la app de Meta; firma los webhooks |

`NODE_ENV`, `PORT` y `TRUST_PROXY_HOPS` los fija el compose; `WHATSAPP_DRIVER`
usa `meta` por defecto. No hace falta declararlos.

## Paso 3 — Levantar

```bash
docker compose up -d --build
docker compose ps                   # api y web deben llegar a "healthy"
docker compose logs -f api          # espera "Nest application successfully started"
curl -i https://api.tudominio.com/  # 200 "Hello World!"
curl -sI https://app.tudominio.com/ # 200 text/html del panel
```

La primera construcción instala dependencias dentro de la imagen (`npm ci` +
`npm run build` con `prisma generate`), así que tarda varios minutos. Los
certificados aparecen en los logs de `caddy` en cuanto el DNS resuelve.

`GET /` responde `Hello World!` con 200: es el health check del contenedor y el
único camino exento del requisito de HTTPS. El `docker compose ps` debe mostrar
`api` como `healthy` en menos de un minuto.

Si el health check de `api` falla en bucle, revisa `DATABASE_URL`, la CA de
Supabase y `CORS_ORIGINS`: la app valida los tres al arrancar y aborta si están
mal.

## Paso 4 — Conectar el webhook de Meta

Con la API publicada, en la app de Meta ve a WhatsApp → Configuración → Webhook:

- **URL de devolución de llamada**: `https://api.tudominio.com/webhooks/whatsapp`
- **Token de verificación**: el valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- **Campo suscrito**: `messages`

El backend responde el GET de verificación con ese token y valida cada POST con la
firma HMAC de `META_APP_SECRET`. Si cambias alguna variable, recrea la API:

```bash
docker compose up -d api
```

## Paso 5 — Verificar el canal

Con `WHATSAPP_ENABLED=true` y `WHATSAPP_WORKER_ENABLED=true` en el `.env`, y las
plantillas aprobadas en Meta:

```bash
# 1) El backend usa Meta (requiere JWT de un usuario con permisos)
curl -s https://api.tudominio.com/whatsapp/integracion -H "Authorization: Bearer $TOKEN"
#    -> "proveedor":"META_CLOUD_API", "habilitada":true

# 2) Envío real: destinatario + consentimiento + prueba
curl -s -X POST https://api.tudominio.com/whatsapp/destinatarios   -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json"   -d '{"telefono_e164":"+525512345678"}'

curl -s -X PATCH https://api.tudominio.com/whatsapp/destinatarios/$ID/consentimiento   -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json"   -d '{"aceptado":true}'

curl -s -X POST https://api.tudominio.com/whatsapp/destinatarios/$ID/prueba   -H "Authorization: Bearer $TOKEN"
```

El worker corre cada 15 s. El historial pasa de EN_COLA a ENVIADA y, con webhook
sano, a ENTREGADA/LEIDA.

### Panel web

```bash
curl -sI https://app.tudominio.com/       # 200 text/html
curl -sI https://app.tudominio.com/login  # 200: el SPA devuelve index.html
```

En el navegador, abre `https://app.tudominio.com/login` y comprueba en
DevTools → Network que las llamadas van a `https://api.tudominio.com` y no a
`localhost:3000`. Si el panel carga pero todo da error de CORS, `CORS_ORIGINS`
del backend no incluye `https://app.tudominio.com`.

`VITE_API_URL` se incrusta al construir la imagen (`PUBLIC_API_URL`), así que
cambiar la URL de la API requiere `docker compose build web && docker compose up -d web`.

## Operación

```bash
docker compose ps                     # estado y salud
docker compose logs -f api caddy      # logs (rotados a 10 MB × 3 archivos)
docker compose exec api sh            # shell en el contenedor

# Actualizar tras un push (en ribani-server y, si cambió, en ribani-web)
git pull
docker compose up -d --build          # recrea solo lo que cambió
docker image prune -f

# Reconstruir solo el panel (por ejemplo tras cambiar PUBLIC_API_URL)
docker compose build web && docker compose up -d web

```

- **Supabase** sigue siendo la base de RIBANI: sus respaldos se gestionan en
  Supabase, no aquí.
- **Cron y SSE** requieren el servidor encendido 24/7; es la razón de usar VPS en
  lugar del plan gratuito de un PaaS.

## Problemas frecuentes

| Síntoma | Causa probable |
| --- | --- |
| `400 HTTPS es obligatorio en producción` en peticiones que sí vienen por HTTPS | `TRUST_PROXY_HOPS` en 0 o Caddy no es el único proxy delante de Nest. |
| `502 Bad Gateway` en Caddy | El contenedor `api` no pasa el health check: mira `docker compose logs api`. |
| Caddy no obtiene certificado | DNS sin propagar, puerto 80 cerrado o el dominio ya usado por otro servidor. |
| Error de certificado contra Supabase | Falta `certs/supabase-ca.crt` en la imagen o usas la conexión directa en `DATABASE_URL`. |
| La app arranca pero todas las peticiones fallan por CORS | `CORS_ORIGINS` no es el origen exacto (protocolo, host y puerto, sin `/`). |
| Meta no verifica el webhook | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` distinto del configurado en Meta, o el dominio aún no tiene HTTPS. |
| Webhook responde 403 | `META_APP_SECRET` incorrecto: la firma HMAC no coincide. |
| Webhook responde 503 «Identificador aún no persistido» | Llegó antes del `UPDATE`; Meta reintenta, es normal. |
| `Killed` / contenedor reiniciándose | RAM insuficiente: 4 GB o añade swap de 2 GB. |
| `ERR_INVALID_URL` al arrancar con `"postgresql://…"` | Se añadió `env_file` al servicio: Docker no quita las comillas y el compose ya mapea cada variable con `${…}`. Deja el `.env` citado, pero no uses `env_file`. |
| El build falla con `ECONNRESET` en `npm ci` | Red inestable: la imagen reintenta 5 veces y cachea `~/.npm`; vuelve a lanzar `docker compose build api`. |
| El panel queda en blanco y la consola dice «`VITE_API_URL` debe ser una URL HTTPS» | Se construyó con un valor inválido: corrige `PUBLIC_API_URL` y reconstruye `web`. |
| `502` en el dominio del panel | El contenedor `web` no está saludable: `docker compose logs web`. |
| Al refrescar `/panel/...` sale 404 | Falta el `try_files … /index.html` en `docker/nginx.conf` o se sirvió otro nginx. |
| El bundle apunta a `localhost:3000` en producción | `PUBLIC_API_URL` no estaba definida al construir la imagen; reconstruye con `--build`. |

## Límites

- Swagger (`/api` y `/api-json`) está oculto en producción. Para una demo, define
  `SWAGGER_ENABLED=true` en el `.env` y recrea `api`; vuelve a quitarlo al terminar.
- Esta configuración no incluye observabilidad (métricas, alertas) ni alta
  disponibilidad: es un único servidor.
