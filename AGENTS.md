# AGENTS.md — RIBANI Backend

## 1. Contexto del proyecto

RIBANI es una aplicación orientada a adultos mayores que viven solos.

El sistema contempla:

- Aplicación móvil Android para el adulto mayor.
- Aplicación web para familiares responsables.
- Backend REST desarrollado con NestJS.
- Autenticación y autorización mediante JWT.
- Base de datos PostgreSQL alojada en Supabase.
- ORM Prisma.
- Control de acceso basado en roles y permisos.

El backend es parte de un proyecto académico relacionado con:

- Aplicaciones Web y Móviles.
- Seguridad en Cómputo.

El objetivo es implementar una API segura, modular y mantenible.

---

## 2. Stack tecnológico

El backend utiliza:

- Node.js
- TypeScript
- NestJS
- Prisma ORM
- PostgreSQL
- Supabase
- JWT
- REST API
- npm

### Base de datos

La base de datos está alojada en:

**Supabase PostgreSQL**

NO utilizar MySQL.

NO migrar la base de datos a SQLite.

NO crear una nueva base de datos local.

La conexión debe utilizar la variable:

```env
DATABASE_URL="..."
```

---

## 3. Estado actual del proyecto

El proyecto NestJS ya fue creado.

La estructura de Prisma ya existe y debe respetarse.

Actualmente existe un esquema Prisma:

```text
prisma/
└── schema.prisma
```

También existe configuración relacionada con Prisma dentro de:

```text
src/prisma/
```

El proyecto puede contener archivos generados por Prisma y configuraciones específicas de la versión instalada.

### IMPORTANTE

Antes de modificar Prisma:

1. Revisar la versión instalada.
2. Revisar `package.json`.
3. Revisar `prisma/schema.prisma`.
4. Revisar `prisma.config.ts` si existe.
5. Revisar `src/prisma/`.
6. No reemplazar configuraciones existentes sin comprobar su propósito.

---

# 4. Regla principal: preservar lo existente

El agente NO debe reconstruir el proyecto desde cero.

Antes de crear o modificar archivos:

1. Inspeccionar la estructura existente.
2. Identificar qué configuración ya está funcionando.
3. Reutilizar módulos y servicios existentes.
4. Evitar duplicar configuraciones.
5. Evitar generar archivos innecesarios.

No eliminar archivos existentes salvo que exista una razón técnica clara y sea necesario para corregir una configuración incorrecta.

---

# 5. Prisma

Prisma se utiliza como ORM para PostgreSQL.

El esquema principal es:

```text
prisma/schema.prisma
```

El agente debe trabajar con el esquema existente.

No crear:

```text
contract.prisma
```

si el proyecto actualmente utiliza:

```text
schema.prisma
```

No cambiar el nombre del esquema únicamente para seguir ejemplos de otra versión de Prisma.

---

## 6. PrismaService

El proyecto debe contar con un servicio de Prisma integrado con NestJS.

La implementación actual puede utilizar:

```text
src/prisma/prisma.module.ts
src/prisma/prisma.service.ts
```

El módulo de Prisma debe ser global si la arquitectura actual lo requiere:

```ts
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

No crear múltiples instancias de PrismaClient.

Los módulos de negocio deben consumir el `PrismaService` mediante inyección de dependencias.

---

# 7. Arquitectura NestJS

Utilizar una arquitectura modular.

Estructura esperada:

```text
src/
├── app.module.ts
├── main.ts
│
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
│
├── auth/
├── users/
├── roles/
├── permissions/
├── adults/
├── family/
├── alerts/
├── medications/
└── ...
```

Los nombres definitivos de los módulos deben basarse en las tablas y funcionalidades reales del proyecto.

No crear todos los módulos automáticamente si todavía no son necesarios.

---

# 8. Estado de las APIs

IMPORTANTE:

Si se solicita únicamente configurar o revisar la infraestructura del backend, NO crear todavía las APIs de negocio.

Primero debe estar correctamente configurado:

- NestJS.
- Prisma.
- PostgreSQL/Supabase.
- Variables de entorno.
- PrismaService.
- PrismaModule.
- Configuración básica.
- Estructura modular.

Las APIs se implementarán posteriormente por módulos.

---

# 9. Base de datos RIBANI

Entre las entidades existentes se encuentran conceptos como:

### Roles

Tabla:

```text
roles
```

Campos principales relacionados con:

- id
- codigo
- nombre
- descripcion
- activo

### Permisos

Tabla:

```text
permisos
```

Relacionada con:

- id
- codigo
- recurso
- accion
- descripcion

### Relación roles-permisos

Tabla:

```text
rol_permisos
```

Utiliza una relación entre:

```text
rol_id
permiso_id
```

### Usuarios

Tabla:

```text
usuarios
```

Los usuarios se relacionan con información del sistema como:

- adulto mayor
- familiar responsable
- alertas/eventos
- roles

El esquema real de `schema.prisma` es la fuente de verdad.

NO asumir campos que no estén definidos en el esquema.

---

# 10. Roles del sistema

El sistema contempla como mínimo los siguientes roles conceptuales:

```text
ADULTO_MAYOR
FAMILIAR_ENCARGADO_DEL_ADULTO
ADMINISTRADOR
```

Los nombres exactos utilizados por la base de datos deben obtenerse del esquema y/o registros existentes.

### ADULTO_MAYOR

Usuario que utiliza principalmente la aplicación móvil.

Puede tener funcionalidades como:

- visualización de información personal;
- medicamentos;
- alertas;
- detección de caídas;
- información relacionada con su familiar responsable.

### FAMILIAR_ENCARGADO_DEL_ADULTO

Usuario que utiliza la aplicación web.

Puede administrar información relacionada con el adulto mayor asignado.

### ADMINISTRADOR

Usuario encargado de la administración general del sistema.

Puede administrar:

- usuarios;
- roles;
- permisos;
- configuración administrativa.

Los permisos concretos deberán definirse posteriormente.

---

# 11. Seguridad

La seguridad es un requisito fundamental del proyecto.

La API deberá contemplar posteriormente:

```text
JWT
```

para autenticación.

También deberá implementar autorización basada en:

```text
Roles
Permisos
```

La autenticación y autorización deben mantenerse separadas conceptualmente:

### Autenticación

Determina:

> ¿Quién es el usuario?

### Autorización

Determina:

> ¿Qué puede hacer ese usuario?

---

# 12. JWT

Cuando se implemente autenticación:

- Utilizar JWT.
- No almacenar contraseñas en texto plano.
- Utilizar hashing seguro para contraseñas.
- Validar correctamente los tokens.
- Proteger endpoints mediante guards.
- Evitar aceptar información sensible directamente desde el cliente sin validación.

No inventar claims JWT sin definir previamente su propósito.

---

# 13. Validación

Los endpoints deberán utilizar DTOs.

Cuando corresponda utilizar:

```text
class-validator
class-transformer
```

Las entradas provenientes del cliente deben validarse.

No confiar en datos enviados desde:

- Android.
- Web.
- Postman.
- otros clientes.

---

# 14. Manejo de errores

Utilizar las excepciones estándar de NestJS cuando correspondan:

```ts
BadRequestException
UnauthorizedException
ForbiddenException
NotFoundException
ConflictException
```

No devolver errores internos de Prisma directamente al cliente.

No exponer:

- contraseñas;
- hashes;
- tokens;
- credenciales;
- `DATABASE_URL`;
- información interna de la base de datos;
- stack traces en producción.

---

# 15. Variables de entorno

Las credenciales y secretos deben permanecer fuera del código.

Utilizar:

```env
DATABASE_URL=
JWT_SECRET=
```

u otras variables necesarias.

No escribir secretos directamente en:

```text
.ts
.js
.json
```

No subir:

```text
.env
```

al repositorio.

Debe existir un:

```text
.env.example
```

sin secretos reales.

---

# 16. Control de cambios

Antes de modificar código:

1. Revisar el archivo.
2. Entender su función.
3. Hacer el cambio mínimo necesario.
4. Mantener compatibilidad con el resto del proyecto.

No realizar refactorizaciones grandes si no fueron solicitadas.

No cambiar de ORM.

No cambiar de framework.

No cambiar PostgreSQL por MySQL.

No reemplazar Supabase.

---

# 17. Dependencias

Antes de instalar una dependencia:

1. Comprobar si ya existe.
2. Determinar si realmente es necesaria.
3. Utilizar una versión estable compatible con el proyecto.

Evitar instalar paquetes innecesarios.

No instalar versiones `alpha`, `beta`, `rc` o experimentales cuando exista una versión estable adecuada.

---

# 18. Comandos

Los comandos deben ejecutarse desde:

```text
ribani-server/
```

Comandos comunes:

```bash
npm install
```

```bash
npm run start:dev
```

```bash
npm run build
```

Para Prisma, utilizar los comandos compatibles con la versión instalada.

Antes de ejecutar comandos destructivos, revisar su impacto.

No ejecutar automáticamente:

```bash
prisma migrate reset
```

ni comandos equivalentes destructivos.

---

# 19. Migraciones y base de datos

La base de datos existente en Supabase debe tratarse como fuente de datos real.

No eliminar ni reinicializar las tablas existentes.

No ejecutar migraciones destructivas sin autorización explícita.

Antes de modificar el esquema:

1. Revisar `schema.prisma`.
2. Determinar si la modificación es necesaria.
3. Verificar relaciones.
4. Considerar los datos existentes en Supabase.

---

# 20. Convenciones de código

Utilizar TypeScript.

Preferir:

```ts
async/await
```

sobre cadenas innecesarias de `.then()`.

Utilizar nombres descriptivos.

Mantener los servicios enfocados en una responsabilidad.

Ejemplo:

```text
UsersController
UsersService
AuthController
AuthService
```

No colocar toda la lógica del sistema dentro de:

```text
app.controller.ts
app.service.ts
```

---

# 21. Controladores

Los controladores deben encargarse principalmente de:

- recibir solicitudes;
- validar DTOs;
- utilizar guards/decoradores;
- llamar a servicios;
- devolver respuestas.

La lógica de negocio debe permanecer en los servicios.

Evitar consultas Prisma complejas directamente dentro de los controladores.

---

# 22. Servicios

Los servicios contienen la lógica de negocio.

Ejemplo:

```text
UsersService
AuthService
RolesService
PermissionsService
AlertsService
MedicationsService
```

Los servicios pueden utilizar:

```ts
PrismaService
```

mediante inyección de dependencias.

---

# 23. DTOs

Los DTOs deben utilizarse para entrada y actualización de información.

Ejemplo:

```text
create-user.dto.ts
update-user.dto.ts
login.dto.ts
```

No reutilizar automáticamente el modelo Prisma como DTO.

Los modelos de base de datos y contratos HTTP son conceptos diferentes.

---

# 24. Respuestas de API

Las respuestas deben ser consistentes.

No devolver directamente objetos que puedan contener información sensible.

Por ejemplo, una respuesta de usuario no debería incluir:

```text
password
passwordHash
```

aunque existan en la entidad.

---

# 25. Documentación

Cuando se implementen APIs, documentarlas adecuadamente.

Se podrá utilizar posteriormente:

```text
Swagger / OpenAPI
```

para documentar:

- endpoints;
- parámetros;
- DTOs;
- respuestas;
- autenticación JWT;
- códigos HTTP.

---

# 26. Testing

Siempre que sea posible, mantener pruebas para la lógica importante.

Prioridad:

1. Autenticación.
2. Autorización.
3. Usuarios.
4. Roles.
5. Permisos.
6. Alertas.
7. Medicamentos.

No eliminar pruebas existentes para hacer que el proyecto compile.

---

# 27. Regla para agentes de IA

Antes de realizar cambios importantes:

```text
INSPECCIONAR → ENTENDER → PLANEAR → MODIFICAR → VERIFICAR
```

El agente debe:

1. Inspeccionar archivos relevantes.
2. Identificar dependencias.
3. Revisar configuraciones existentes.
4. Realizar cambios mínimos.
5. Ejecutar validaciones.
6. Informar qué modificó.

No asumir que una configuración encontrada en documentación externa corresponde exactamente a este proyecto.

---

# 28. Si existe un conflicto

En caso de conflicto entre:

- documentación genérica;
- tutoriales;
- ejemplos de Internet;
- configuración existente;

se debe priorizar:

1. Código actual funcional.
2. `schema.prisma`.
3. `package.json`.
4. Configuración actual de Prisma.
5. Requisitos específicos de RIBANI.
6. Documentación oficial de las versiones instaladas.

---

# 29. Objetivo actual

El objetivo inmediato del backend es establecer una base sólida para posteriormente implementar:

```text
Autenticación
        ↓
JWT
        ↓
Roles
        ↓
Permisos
        ↓
Usuarios
        ↓
Adultos mayores
        ↓
Familiares
        ↓
Alertas
        ↓
Medicamentos
        ↓
Otras funcionalidades RIBANI
```

No implementar toda esta funcionalidad de una sola vez.

Cada módulo deberá desarrollarse, probarse y validarse progresivamente.

---

# 30. Regla final

El agente debe tratar este proyecto como un backend académico real que posteriormente será consumido por una aplicación Android y una aplicación web.

La prioridad es:

```text
Correctitud
Seguridad
Compatibilidad con Supabase
Mantenibilidad
Simplicidad
```

Evitar soluciones improvisadas o configuraciones innecesariamente complejas.