# Historial y supervisión — endpoints

Cambios de la última revisión: la baja de tomas y alertas es lógica (no borra
filas), los listados ocultan lo dado de baja y el administrador obtiene la
última ubicación de todos los adultos en una sola petición.

Todos los endpoints requieren `Authorization: Bearer <access token>` y pasan por
`JwtAuthGuard` + `PermissionsGuard`. No hay prefijo global `/api`.

## Estados disponibles

Las columnas `estado` de `tomas_medicamento` y `alertas` tienen restricciones
`CHECK` en Supabase, así que "eliminar del historial" reutiliza un estado ya
permitido en lugar de añadir uno nuevo:

| Tabla | Estados | Valor usado al eliminar |
| --- | --- | --- |
| `tomas_medicamento` | PENDIENTE, POSPUESTA, TOMADA, OMITIDA, CANCELADA | `CANCELADA` |
| `alertas` | ABIERTA, EN_ATENCION, RESUELTA, CANCELADA | `CANCELADA` |

La fila se conserva (auditoría), deja de aparecer en los listados por defecto y
sus notificaciones WhatsApp pendientes se cancelan para no avisar de algo que el
usuario ya quitó de su historial. No se modificó el esquema ni se ejecutaron
migraciones.

## DELETE /tomas/{id}

Baja lógica de una toma, sea cual sea su estado (antes solo se permitía en
PENDIENTE y respondía 409 en el resto).

- **Permiso:** `tomas.actualizar`.
- **Acceso al objeto:** el propio adulto, un familiar con vínculo `ACTIVA` y
  `puede_gestionar_medicamentos`, o un administrador.
- **Efecto:** `estado = 'CANCELADA'`, `updated_at = ahora`. Las filas de
  `notificaciones_whatsapp` con `toma_id` en `EN_COLA`/`FALLIDA` y sin
  `proveedor_message_id` pasan a `CANCELADA` con `siguiente_intento_en = null`.
- **Respuesta:** `200` `{ "id": "<uuid>", "eliminado": true }`.
- **Idempotencia:** si ya estaba `CANCELADA` responde igual sin tocar la fila.

```bash
curl -X DELETE "http://localhost:3000/tomas/$TOMA_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## GET /tomas

Nuevo parámetro `incluirCanceladas` (`boolean`, por defecto `false`).

- Sin `estado` ni `incluirCanceladas`: se excluyen las tomas `CANCELADA`.
- `incluirCanceladas=true`: se devuelven también las dadas de baja.
- `estado=CANCELADA`: devuelve solo las dadas de baja.

Los demás filtros siguen igual: `adultoId`, `medicamentoId`, `estado` (`PENDIENTE`
incluye `POSPUESTA`), `desde`, `hasta` y `limite`.

## DELETE /alertas/{id}

Baja lógica de una alerta del historial.

- **Permiso:** `alertas.actualizar` (el mismo de atender/resolver).
- **Acceso al objeto:** administrador, el propio adulto o un familiar con vínculo
  `ACTIVA`.
- **Efecto:** `estado = 'CANCELADA'` y `cerrada_en = ahora`; si la alerta no tenía
  `atendida_por` se registra el usuario que la elimina como quien la atendió. Se
  cancelan las notificaciones WhatsApp pendientes y se añade un evento
  `CANCELADA` a `alerta_eventos` con el detalle "Alerta eliminada del historial
  por el usuario". El cambio se emite por SSE a los paneles conectados.
- **Respuesta:** `200` con el `AlertaRespuestaDto` actualizado.
- **Idempotencia:** si ya estaba `CANCELADA` devuelve la alerta sin escribir.

```bash
curl -X DELETE "http://localhost:3000/alertas/$ALERTA_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## GET /alertas

Nuevo parámetro `incluirCanceladas` (`boolean`, por defecto `false`) con el mismo
comportamiento que en tomas: sin filtro `estado`, las alertas eliminadas no se
listan; `estado=CANCELADA` las pide explícitamente.

## GET /ubicaciones/ultimas

Última ubicación conocida de **todos** los adultos activos, para el mapa del
panel administrador.

- **Permiso:** `ubicaciones.leer` **y** rol `ADMINISTRADOR`; cualquier otro rol
  recibe `403`.
- **Consulta:** `DISTINCT ON (adulto_id)` sobre `ubicaciones`, unida a `usuarios`
  y `roles`, filtrando `roles.codigo = 'ADULTO_MAYOR'` y `usuarios.activo`.
  Una fila por adulto que ya haya reportado; orden descendente por
  `registrada_en`. Sin paginación: el tamaño lo acota el número de adultos.
- **Respuesta:** `200` con `UbicacionAdultoResumenDto[]`:

```json
[
  {
    "adulto_id": "5f0f3c1e-...",
    "nombre": "Luis Manuel",
    "apellido": "Sánchez",
    "latitud": 16.768244,
    "longitud": -93.13424,
    "precision_metros": 15.46,
    "fuente": "GPS",
    "registrada_en": "2026-10-23T19:38:24.372Z"
  }
]
```

`latitud`, `longitud` y `precision_metros` se devuelven como números (la consulta
cruda los trae como `numeric`, el servicio los convierte). Los adultos sin
reportes no aparecen en la lista.

```bash
curl "http://localhost:3000/ubicaciones/ultimas" \
  -H "Authorization: Bearer $TOKEN_ADMIN"
```

El endpoint individual sigue disponible: `GET /ubicaciones/actual?adultoId=...`
y el stream `GET /ubicaciones/stream?adultoId=...` con el mismo permiso.

## Pruebas

- `src/tomas/tomas-eliminar.spec.ts`
- `src/alertas/alertas-eliminar.spec.ts`
- `src/ubicaciones/ubicaciones-ultimas.spec.ts`

Cubren la baja lógica, la cancelación de notificaciones, la idempotencia, el
control de acceso y el mapeo numérico. Las tres pruebas usan Prisma simulado: no
escriben en la base real.
