# Correcciones de seguridad de RIBANI

Autorizadas por el usuario tras la revisión de Caso_practico.pdf. Se conserva
HTTP en desarrollo local y los roles propios de RIBANI. No se ejecutan seeds,
migraciones ni cambios de datos en Supabase.

## Diseño

- Mantener NestJS, Prisma 7.10, PostgreSQL/Supabase y contratos móviles existentes.
- Asociar cada JWT a una sesión mediante `sid`; validar vigencia y revocación en
  cada solicitud. Rotar refresh de forma condicional para evitar doble uso.
- Revocar sesiones al cambiar/restablecer contraseñas. Tokens previos sin `sid`
  requieren iniciar sesión nuevamente.
- Web: access token en memoria y refresh en cookie HttpOnly; rutas web separadas
  de las rutas móviles, cookies Secure en producción y control de Origin contra
  CORS para prevenir CSRF. Mantener Authorization Bearer en recursos protegidos.
- Limitar autenticación por IP y cuenta, incluyendo recuperación y TOTP. Los
  límites locales en memoria son para una instancia; documentar almacenamiento
  compartido antes de escalar a varias instancias.
- Registrar accesos exitosos/fallidos sin credenciales y conservar permisos por
  acción además de las comprobaciones de propiedad/vínculo existentes.
- Validar consultas, quitar credenciales fijas del seed y verificar configuración
  segura de producción sin impedir HTTP localhost.

Alternativas: persistir tokens en sessionStorage deja exposición a JavaScript;
guardar todo en cookies contradice el Bearer exigido por el caso. Se utiliza
access en memoria y refresh HttpOnly, conservando el contrato móvil.

## Ejecución y verificaciones

- [x] Autenticación: pruebas RED/GREEN para límites, sid, revocación, rotación,
  recuperación y auditoría de accesos.
- [x] Sesión web: pruebas RED/GREEN de cookies/Origin, memoria, restauración,
  logout y respuestas tardías; conservar tests de sesión existentes.
- [x] Permisos y validación: pruebas RED/GREEN de permisos revocados, usuarios
  sin vínculo y consultas malformadas; no inventar códigos de permisos.
- [x] Configuración y seed: credenciales mediante entorno, desarrollo HTTP,
  producción HTTPS y conexión PostgreSQL TLS con verificación de certificado.
- [x] Pruebas completas backend/web, lint, compilación y contrato OpenAPI.
- [x] Revisión final de cambios y documentación de límites y despliegue.

## Riesgos que deben probarse

Refresh concurrente; JWT revocado aún no expirado; cookies con origen no
autorizado; 401/respuestas de una sesión anterior; permisos retirados sin cerrar
sesión; códigos de recuperación reutilizados y parámetros NaN/decimales.

## Adaptación académica

Por decisión del usuario se conservan ADMINISTRADOR, FAMILIAR_ENCARGADO y
ADULTO_MAYOR, sin añadir Editor/Usuario Regular ni creación arbitraria de roles.
No son equivalencias exactas: el adulto puede realizar acciones propias y el
familiar solo sobre adultos vinculados. Esta desviación del enunciado requiere
aceptación académica y no se presenta como cumplimiento literal.

## Estado inicial

Backend: 105 pruebas satisfactorias. Web: 14 pruebas satisfactorias.
Backend sin cambios previos; web conserva un cambio ajeno en graphify-out/cache;
Android conserva cambios ajenos en navegación, ubicación y detector de caídas.

## Resultado verificado

208 pruebas backend y 27 web aprobadas; TypeScript, lint, build y OpenAPI
verificados. Prisma 7.10 valida y genera el cliente sin cambios de esquema.
TLS 1.3 con certificado autorizado comprobado usando el helper compilado.
Se resolvieron los hallazgos de concurrencia de la revision independiente.
Sin cambios de datos, migraciones ni ejecucion del seed.
