Claro. Para RIBANI conviene que el agente se encargue **únicamente de dejar listo el backend base en NestJS**, incluyendo Prisma/Supabase y la estructura inicial, pero **sin desarrollar todavía ningún endpoint ni lógica de las APIs**.

```md
# INSTRUCTIONS.md — Configuración base del backend RIBANI

## Objetivo

Configurar y dejar funcional el proyecto backend de **RIBANI** utilizando:

- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- Supabase como proveedor de base de datos

El objetivo de esta tarea es **preparar únicamente la infraestructura básica del backend**.

### IMPORTANTE

NO desarrollar todavía las APIs de RIBANI.

NO crear controladores de funcionalidades.

NO crear servicios de funcionalidades.

NO implementar autenticación.

NO implementar registro/login.

NO implementar usuarios.

NO implementar contactos.

NO implementar alertas.

NO implementar detección de caídas.

NO implementar notificaciones.

NO implementar endpoints REST relacionados con el sistema.

La tarea termina cuando el proyecto base esté correctamente configurado y pueda ejecutarse.

---

# 1. Estructura tecnológica

El proyecto debe utilizar:

```text
NestJS
TypeScript
Prisma ORM
PostgreSQL
Supabase
```

La base de datos PostgreSQL estará alojada en Supabase.

No utilizar MySQL.

---

# 2. Objetivo de la configuración

El agente debe dejar preparado un proyecto con una estructura similar a:

```text
ribani-server/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   │
│   └── prisma/
│       ├── prisma.module.ts
│       └── prisma.service.ts
│
├── prisma/
│   └── schema.prisma
│
├── .env
├── .env.example
├── package.json
├── tsconfig.json
├── nest-cli.json
└── README.md
```

La estructura puede adaptarse a la versión de NestJS y Prisma utilizada, pero debe mantenerse simple.

---

# 3. Crear/configurar NestJS

Si el proyecto todavía no existe, crear un proyecto NestJS llamado:

```text
ribani-server
```

Utilizar TypeScript.

Verificar que el proyecto pueda iniciar correctamente con:

```bash
npm run start:dev
```

No agregar librerías innecesarias.

---

# 4. Configuración de Prisma

Configurar Prisma ORM para trabajar con PostgreSQL.

La conexión debe utilizar una variable de entorno:

```env
DATABASE_URL="..."
```

No escribir credenciales directamente en el código fuente.

Crear o mantener la configuración de Prisma de acuerdo con la versión instalada.

### Importante sobre Prisma

El proyecto puede utilizar una versión reciente y estable de Prisma, pero el agente debe respetar la configuración que ya exista en el proyecto.

Antes de modificar archivos relacionados con Prisma:

1. Revisar `package.json`.
2. Revisar la versión instalada de Prisma.
3. Revisar `prisma.config.ts`, si existe.
4. Revisar `schema.prisma`.
5. Revisar cualquier cliente Prisma generado existente.

No reemplazar configuraciones existentes sin comprobar primero cómo está configurado el proyecto.

---

# 5. Supabase

La base de datos del proyecto está alojada en:

```text
Supabase PostgreSQL
```

La conexión debe realizarse mediante:

```env
DATABASE_URL
```

El agente NO debe crear un proyecto nuevo de Supabase.

El agente NO debe modificar configuraciones externas de Supabase.

El agente NO debe crear tablas nuevas.

El agente NO debe ejecutar migraciones que modifiquen la estructura de la base de datos, salvo que sea estrictamente necesario para validar la configuración y no implique cambios destructivos.

---

# 6. PrismaService

Crear únicamente el servicio base necesario para que NestJS pueda utilizar Prisma.

Por ejemplo:

```text
src/prisma/prisma.service.ts
```

El servicio debe encargarse únicamente de inicializar Prisma y permitir su utilización mediante inyección de dependencias.

No agregar métodos relacionados con:

- Usuarios
- Contactos
- Alertas
- Sensores
- Caídas
- Notificaciones
- Autenticación
- Cualquier otra funcionalidad de RIBANI

---

# 7. PrismaModule

Crear un módulo global para Prisma si resulta apropiado para la arquitectura:

```text
src/prisma/prisma.module.ts
```

Debe permitir que `PrismaService` pueda ser utilizado posteriormente por los módulos de la aplicación.

La configuración debe mantenerse mínima.

---

# 8. AppModule

Mantener `AppModule` limpio.

Únicamente registrar los módulos necesarios para que el backend base funcione.

Por ahora NO crear:

```text
UsersModule
AuthModule
ContactsModule
AlertsModule
FallsModule
NotificationsModule
SensorsModule
EmergencyModule
```

Esos módulos se desarrollarán posteriormente.

---

# 9. main.ts

Configurar únicamente lo necesario para iniciar NestJS.

Debe existir un punto de entrada funcional:

```text
src/main.ts
```

El servidor debe poder iniciar correctamente.

Si resulta conveniente, configurar:

- puerto mediante `process.env.PORT`
- prefijo global únicamente si ya está definido por el proyecto

No implementar endpoints de negocio.

---

# 10. Variables de entorno

Crear:

```text
.env
```

y:

```text
.env.example
```

`.env.example` debe contener únicamente ejemplos de las variables necesarias.

Ejemplo:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
PORT=3000
```

NO colocar credenciales reales dentro de `.env.example`.

Verificar que `.env` esté incluido en `.gitignore`.

---

# 11. Configuración de TypeScript

Mantener la configuración estándar generada por NestJS siempre que sea posible.

No cambiar innecesariamente:

```text
tsconfig.json
tsconfig.build.json
nest-cli.json
```

Si existen configuraciones especiales para Prisma o ESM, conservarlas y verificar que sean compatibles con la versión actual del proyecto.

---

# 12. Dependencias

No instalar dependencias innecesarias.

Las dependencias principales deben limitarse a las necesarias para:

```text
NestJS
TypeScript
Prisma
PostgreSQL
```

No instalar todavía:

```text
JWT
Passport
bcrypt
class-validator
Swagger
WebSockets
Socket.IO
Firebase
Resend
Cloudinary
Redis
Bull
```

a menos que exista una necesidad técnica explícita en la configuración base.

Estas tecnologías podrán agregarse cuando se desarrollen las funcionalidades correspondientes.

---

# 13. APIs

## NO desarrollar APIs todavía.

Esto significa que el agente NO debe crear:

```text
GET /users
POST /users
POST /auth/login
POST /auth/register
GET /contacts
POST /alerts
POST /falls
...
```

No crear controladores de negocio.

No crear DTOs de negocio.

No crear servicios de negocio.

No crear lógica de negocio.

---

# 14. Base de datos

No diseñar todavía el modelo completo de RIBANI si ya existe un esquema o contrato proporcionado por el proyecto.

Si existe:

```text
contract.json
contract.prisma
schema.prisma
```

primero inspeccionarlos.

No modificar modelos existentes sin una razón técnica clara.

Si el esquema de Prisma ya existe, utilizarlo como fuente de verdad para la configuración del cliente Prisma.

---

# 15. Prisma Client

Verificar que Prisma Client pueda generarse correctamente.

Dependiendo de la versión de Prisma utilizada, ejecutar el comando correspondiente, por ejemplo:

```bash
npx prisma generate
```

Si la configuración actual del proyecto utiliza otro mecanismo de generación, respetarlo.

El objetivo es comprobar que el cliente Prisma se genere sin errores.

---

# 16. Validaciones

Antes de finalizar, comprobar:

### NestJS

```bash
npm run build
```

Debe finalizar correctamente.

### Desarrollo

```bash
npm run start:dev
```

Debe iniciar el servidor sin errores.

### Prisma

Verificar que el cliente Prisma pueda generarse correctamente.

### TypeScript

No deben existir errores de compilación.

---

# 17. No modificar funcionalidades existentes

Si el proyecto ya contiene archivos relacionados con Prisma, contratos o generación de cliente, el agente debe:

1. Inspeccionarlos.
2. Comprender su propósito.
3. Evitar duplicarlos.
4. Evitar crear dos `PrismaClient`.
5. Evitar crear dos `PrismaService`.
6. Evitar crear dos configuraciones de Prisma.
7. Mantener una única fuente de configuración.

Si existe un archivo con un nombre similar, no crear otro automáticamente.

---

# 18. Principio de cambios mínimos

El agente debe seguir el principio:

> "Modificar únicamente lo necesario para dejar funcionando la infraestructura base."

No realizar refactors innecesarios.

No cambiar nombres de archivos existentes sin necesidad.

No actualizar dependencias que no sean necesarias.

No crear arquitectura excesivamente compleja.

No implementar patrones avanzados todavía.

---

# 19. Resultado esperado

Al finalizar, el proyecto debe permitir:

```text
NestJS
   │
   ├── AppModule
   │
   └── PrismaModule
          │
          └── PrismaService
                    │
                    ▼
              PostgreSQL
                 │
                 ▼
              Supabase
```

El backend debe poder:

1. Iniciar.
2. Compilar.
3. Generar Prisma Client.
4. Tener acceso configurado a PostgreSQL mediante `DATABASE_URL`.
5. Estar preparado para agregar posteriormente los módulos y APIs de RIBANI.

---

# 20. Entregables

Al finalizar la tarea, informar:

### Archivos creados

Mostrar los archivos nuevos.

### Archivos modificados

Mostrar los archivos modificados.

### Dependencias instaladas

Mostrar únicamente las dependencias agregadas.

### Comandos ejecutados

Mostrar los comandos relevantes.

### Validaciones

Indicar el resultado de:

```bash
npm run build
npx prisma generate
npm run start:dev
```

### Problemas encontrados

Si existe algún problema, describirlo claramente.

NO ocultar errores.

NO asumir que una configuración funciona si no fue comprobada.

---

# 21. Criterio de finalización

La tarea se considera terminada cuando:

- [ ] NestJS está correctamente configurado.
- [ ] TypeScript funciona.
- [ ] Prisma está correctamente configurado.
- [ ] PostgreSQL/Supabase está configurado mediante `DATABASE_URL`.
- [ ] `PrismaService` funciona.
- [ ] `PrismaModule` funciona.
- [ ] Prisma Client puede generarse.
- [ ] El proyecto compila.
- [ ] El servidor puede iniciar.
- [ ] No existen APIs de negocio.
- [ ] No existe lógica de RIBANI implementada todavía.
- [ ] No se agregaron dependencias innecesarias.

---

# REGLA PRINCIPAL

**NO DESARROLLAR LAS APIs TODAVÍA.**

Esta fase únicamente prepara la infraestructura base del backend.

Una vez terminada esta configuración, se detiene el trabajo y se espera la siguiente instrucción para comenzar con el desarrollo de las APIs de RIBANI.
```

Este `INSTRUCTIONS.md` está pensado específicamente para que el agente **no se adelante a construir toda la arquitectura de RIBANI**. Primero deja NestJS + Prisma + Supabase funcionando y después se puede hacer una segunda instrucción exclusivamente para comenzar con las APIs.


LAS VARIABLES DE ENTORNO DE LA BASE DE DATOS SON LAS SIGUIENTES:
# Connect to Postgres via the shared transaction-mode pooler (IPv4-only)
DATABASE_URL="postgresql://postgres.iqkkmwmtluillsebvpal:ribaniapp08@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Connect to Postgres via the shared session-mode pooler (used for migrations)
DIRECT_URL="postgresql://postgres.iqkkmwmtluillsebvpal:ribaniapp08@aws-0-us-east-1.pooler.supabase.com:5432/postgres"