# RIBANI Backend

API REST para el cuidado y seguimiento de adultos mayores que viven solos.
La consumen la aplicación Android y `ribani-web`.

NestJS 12, TypeScript, Prisma 7.10, PostgreSQL en Supabase, JWT, TOTP 2FA y npm.
La autorización y la lógica de negocio pertenecen al backend.

## Preparación

Usar Node 24 LTS y npm. Desde `ribani-server`:

```powershell
npm ci
Copy-Item .env.example .env
```

Copiar `.env.example` solo si aún no existe `.env`. Configurar las credenciales
reales en `.env`, que está excluido de Git. No imprimir ni compartir sus valores.

- `DATABASE_URL`: PostgreSQL/Supabase usado por `PrismaService` mediante el adaptador pg.
- `DIRECT_URL`: conexión directa usada por `prisma7.config.ts`.
- `JWT_ACCESS_SECRET`: secreto aleatorio para firmar y validar access tokens.
- `JWT_ACCESS_EXPIRES_IN_SECONDS`: duración del access token, por defecto 900.
- `JWT_REFRESH_EXPIRES_IN_SECONDS`: duración del refresh token, por defecto 604800.
- `TWO_FACTOR_ENCRYPTION_KEY`: clave privada para cifrar secretos TOTP.
- `RESEND_API_KEY`: clave de correo, requerida por `MailService` al iniciar.
- `RESEND_TEMPLATE_INVITACION_ID` / `RESEND_TEMPLATE_BIENVENIDA_ID`: plantillas opcionales.
- `PORT`: por defecto 3000.
- `CORS_ORIGINS`: orígenes web permitidos, separados por coma.

Los valores del archivo de ejemplo son marcadores y deben reemplazarse.
La base real permanece en Supabase; estos pasos no requieren reset ni migraciones.

## Comandos

```powershell
npm run start:dev
npm test
npm run lint
npm run build
npm run start:prod
```

Los scripts previos de build y desarrollo generan el cliente con
`prisma generate --config prisma7.config.ts`. El esquema sigue siendo
`prisma/schema.prisma` y se conserva el generador existente.

`npm run test:e2e` importa la aplicación completa y puede inicializar Prisma y
el cron de tomas contra la base configurada. No ejecutarlo indiscriminadamente
contra la base real. Su prueba heredada de `GET /` tampoco refleja las rutas
actualmente registradas; requiere preparar un entorno de pruebas antes de usarla.

## Arquitectura y seguridad

Módulos existentes: autenticación, autorización, usuarios, roles/permisos,
familiares/invitaciones, contactos, medicamentos, horarios, tomas, alertas,
ubicaciones, zonas seguras, dispositivos, auditoría y correo.

`PrismaModule` es global y exporta una única instancia de `PrismaService`.
La API aplica `ValidationPipe` global con whitelist, rechazo de campos extra y
transformación. JWT valida usuario y rol activos y carga permisos desde la base.
Las respuestas de usuarios excluyen contraseñas, hashes y secretos TOTP.

Los cambios de estabilización exigen vínculos `ACTIVA` para acceso familiar a
contactos y zonas seguras, y además `puede_gestionar_medicamentos` para
medicamentos, horarios y tomas. Se mantiene el acceso propio del adulto y la
supervisión general administrativa que ya existía. Revisar el código de cada
servicio antes de ampliar permisos administrativos a operaciones concretas.

Las alertas críticas se encolan en `notificaciones_whatsapp`. El módulo WhatsApp
incluye destinatarios/consentimiento, prueba, procesador Meta Cloud API,
webhook firmado, historial, preferencias y recordatorios. Está deshabilitado
por defecto; no se realizaron envíos reales. Ver [configuración y operación](docs/whatsapp.md).
Ubicaciones y alertas exponen SSE con Bearer token.

## Contrato OpenAPI

Con la API iniciada:

- Swagger: `http://localhost:3000/api`
- JSON OpenAPI: `http://localhost:3000/api-json`
- Los endpoints REST no tienen prefijo global `/api`.

También se puede exportar desde el código compilado:

```powershell
npm run openapi:export
```

Produce `openapi.json` sin llamar a `app.init()` ni `listen()`. No ejecuta hooks
de conexión de Prisma ni el cron; sí requiere las variables necesarias para
construir los módulos. Comparte la configuración Swagger usada por `main.ts`.

Todos los dominios exponen DTOs explícitos de respuesta en el OpenAPI:
autenticación, usuarios/perfil, contactos, medicamentos, horarios, tomas,
familiares/invitaciones, zonas seguras, ubicaciones (incluido el lote),
alertas (e intervalo de ubicación), dispositivos, roles/permisos,
auditoría, configuración y WhatsApp; los streams SSE se documentan como
eventos dinámicos desde los servicios.
Después de exportar, ejecutar `npm run api:types` en `ribani-web`, sustituir los
tipos HTTP manuales de los dominios documentados y comprobar TypeScript.
Nunca editar manualmente `src/types/api.d.ts`.

## Estado de verificación

Verificado con Node 22.23.2 y npm 12.1.0:

- `npm test`: 101 pruebas aprobadas (30 del flujo WhatsApp).
- `npm run lint`: código de salida 0, con 11 advertencias previas no bloqueantes.
- `npm run openapi:export`: build, generación Prisma y exportación aprobados.
- `npm run start:dev`: compilación sin errores y aplicación iniciada.
- `GET /api-json`: HTTP 200.

No se ejecutaron las pruebas e2e heredadas contra la base real. Los flujos con
cuentas reales siguen requiriendo comprobación en navegador antes de desplegar.

## Soporte para Android

`POST /tomas/:id/posponer` aplaza una sola vez diez minutos dentro de la ventana
original, sin mover `programada_para`. Las respuestas incluyen `recordar_en`;
`GET /tomas?estado=PENDIENTE` incluye POSPUESTA. El registro TOMADA/OMITIDA
usa una escritura condicional para evitar confirmaciones concurrentes.

`GET/PATCH /configuracion` gestiona los ajustes del adulto autenticado con JWT.
Usa `configuracion_adulto` y los vínculos existentes; no permite indicar otro
`adulto_id`. No se modificaron tablas ni políticas de Supabase.

Ver [alcance implementado](docs/plans/2026-10-18-mobile.md) y
[revisión de la app](../ribani-app/docs/revision-ui-ux.md).
