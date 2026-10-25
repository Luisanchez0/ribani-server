# Seguridad de RIBANI

## Desarrollo y producción

El HTTP de `localhost` se conserva para desarrollo. En Render configurar
`NODE_ENV=production`, `TRUST_PROXY_HOPS=1` y `CORS_ORIGINS` con el origen HTTPS
exacto de la web. No usar `*`. El frontend de producción necesita `VITE_API_URL`
HTTPS. Nest rechaza HTTP de producción salvo el health check `/`; Render termina
TLS y reenvía las peticiones al proceso Node. No activar confianza indiscriminada
en cabeceras `X-Forwarded-*` ni exponer directamente el puerto del proceso en esa
configuración de producción.

La conexión del backend a Supabase es independiente del HTTP de desarrollo y usa
TLS con verificación del certificado y hostname. La CA pública incluida en
`certs/supabase-ca.crt` procede de
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt.
Puede sustituirse mediante `DATABASE_SSL_CA_PATH` por la CA del dashboard del
proyecto. Nunca solucionar errores de certificados con `rejectUnauthorized:false`.

## Sesiones

- Android conserva `/auth/login`, `/auth/2fa/login`, `/auth/refresh` y
  `/auth/logout`; los tokens siguen siendo cadenas opacas.
- La web usa `/auth/web/login`, `/auth/web/2fa/login`, `/auth/web/refresh` y
  `/auth/web/logout`. El refresh solo se entrega en una cookie HttpOnly con
  `Path=/auth/web`. Es Secure/SameSite=None en producción y SameSite=Lax en
  desarrollo. Todas estas rutas exigen un Origin de `CORS_ORIGINS`.
- El access JWT queda en memoria y viaja en `Authorization: Bearer`. Al recargar,
  la web restaura la sesión mediante la cookie antes de mostrar rutas privadas.
  Se elimina el almacenamiento persistente anterior. Una salida sin red guarda
  solo la intención pública de cerrar sesión para no restaurarla inadvertidamente.
- Los navegadores pueden bloquear cookies entre sitios distintos. Para despliegue
  se recomiendan dominios propios del mismo sitio, por ejemplo web y API en
  subdominios del mismo dominio. Probar el flujo de cookies real en Render.
- El JWT usa HS256, un secreto de al menos 32 bytes y una duración de 900 segundos
  por defecto (configurable entre 60 y 1800). El refresh dura siete días por
  defecto; su duración se limita entre 900 y 2592000 segundos.
- `sid` identifica la fila de sesiones. Cada petición consulta su vigencia y los
  roles/permisos actuales. Logout, cambio/reset de contraseña y desactivación
  revocan los accesos correspondientes. Tokens antiguos sin `sid` exigen volver
  a iniciar sesión.
- La rotación del refresh consume condicionalmente su hash vigente. Los refresh
  nuevos incluyen una prueba firmada de revocación: un token ya rotado permite
  cerrar únicamente su misma sesión, pero nunca renovarla. Esto cubre logout y
  refresh simultáneos entre pestañas sin guardar tokens anteriores en claro.
- La emisión de sesión/desafío y los cambios de contraseña comparten el bloqueo
  de la fila del usuario y verifican el hash usado como primer factor.
- SSE comprueba sesión, permiso y vínculo antes de entregar datos, revisa canales
  inactivos cada 30 segundos y los cierra al expirar el JWT. La web puede renovar
  el access token y reconectar sin poner tokens en la URL.

## Protección de autenticación

Por instancia: 30 solicitudes de autenticación por IP/minuto; cinco intentos de
login por cuenta/15 minutos; tres solicitudes de recuperación/10 minutos; cinco
intentos de restablecimiento/10 minutos; cinco verificaciones TOTP por cuenta/
cinco minutos. También se conserva el máximo de cinco intentos por desafío.
Un login correcto reinicia el contador de su primer factor. Los límites tienen
ventanas temporales y almacenamiento acotado; no confían en `X-Forwarded-For`
enviado directamente por el cliente.

Los límites están en memoria y sirven para una instancia de Node. Un reinicio
borra los contadores. Antes de escalar horizontalmente se requiere un almacén
compartido o controles equivalentes del proxy; no se presenta esta implementación
como protección distribuida.

Los códigos de recuperación están ligados a la cuenta con HMAC y expiran en diez
minutos. Su consumo y la invalidación de sesiones/desafíos son transaccionales.
Los códigos emitidos antes de esta actualización dejan de ser válidos: solicitar
otro código.

## Permisos, validación y auditoría

Se aplican los códigos existentes y confirmados en Supabase a medicamentos,
horarios, tomas, lectura de ubicaciones, alertas y administración. La baja lógica
de medicamentos utiliza `medicamentos.actualizar`; horarios pertenece al mismo
dominio. Los checks de propiedad y vínculos siguen siendo obligatorios además
del permiso; ser administrador no omite el guard de permisos.

Contactos y zonas seguras no tienen permisos por acción propios en el catálogo
actual; mantienen autorización por identidad/vínculo. Configuración, dispositivos
y reportes propios también conservan controles de identidad. No se inventaron
permisos ni se cambiaron asignaciones de roles en la BD. Completar ese catálogo
requiere una decisión de dominio y cambios explícitos de datos.

Las consultas de listados rechazan parámetros desconocidos/repetidos, UUID,
booleanos, fechas/rangos y límites inválidos. Por defecto se devuelven 100 filas,
con máximo 500; auditoría usa 50/200. Algunos listados internos mantienen límites
más pequeños. Los consumidores deben usar filtros; todavía no existe paginación
con cursor. Horarios consulta directamente sus filas, sin expansión ilimitada
de medicamentos y horarios anidados.

Accesos exitosos/fallidos y operaciones administrativas registran actor conocido,
fecha, IP y acción. No se guardan contraseñas, JWT, refresh ni cuerpos JSON en la
auditoría automática. Los errores de persistencia no se ocultan. No hay rutas
para editar/borrar auditoría. La escritura de auditoría posterior a una operación
de negocio no convierte todas las mutaciones y su registro en una sola
transacción: un fallo de BD puede devolver error tras efectuar la mutación.
La inmutabilidad frente a acceso directo a PostgreSQL depende de sus privilegios,
que no fueron modificados ni certificados por estos cambios.

## Administrador inicial

El seed solo se ejecuta manualmente con `SEED_ADMIN_EMAIL` y
`SEED_ADMIN_PASSWORD` en el entorno. Exige 12 caracteres y como máximo 72 bytes.
No restablece contraseñas, roles ni estado de usuarios existentes y ya no contiene
una contraseña predeterminada. No se ejecutó el seed en esta revisión. Si se usó
la versión anterior, cambiar la contraseña de esa cuenta desde el perfil; quitar
la credencial del código no rota una contraseña ya guardada en Supabase.

## Adaptación del caso práctico

El usuario decidió conservar ADMINISTRADOR, FAMILIAR_ENCARGADO y ADULTO_MAYOR.
No se crean Editor/Usuario Regular ni roles arbitrarios. La equivalencia no es
literal: familiar administra solo adultos vinculados y el adulto realiza acciones
propias, además de consultar información. Esta adaptación y la ausencia de alta
de roles nuevos requieren aceptación del docente.

Estos cambios se validan mediante pruebas locales, lint, TypeScript, compilación
y OpenAPI. No equivalen a una prueba de penetración ni a una certificación de las
políticas RLS o del despliegue en Render. No se alteró el esquema ni se realizaron
mutaciones de datos en Supabase.

Resultado de la revisión: 208 pruebas backend y 27 web aprobadas; compilaciones,
tipos y lint sin errores (backend conserva advertencias y Vite advierte del tamaño
del bundle). Se validó Prisma 7.10 y una conexión TLS 1.3 con certificado autorizado.
