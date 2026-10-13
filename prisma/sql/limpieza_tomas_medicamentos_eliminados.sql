-- =====================================================================
-- Limpieza one-off: tomas PENDIENTE futuras de medicamentos eliminados
-- =====================================================================
-- Contexto: antes del fix en MedicamentosService.remove(), eliminar un
-- medicamento (soft-delete, activo = false) dejaba vivas sus tomas
-- PENDIENTE futuras generadas por el cron. La app móvil las seguía
-- mostrando y alarmando. El fix ya cancela las tomas en el mismo
-- momento de la eliminación; este script repone los datos históricos
-- afectados por el bug.
--
-- Espeja exactamente lo que hace el fix (ribani-server):
--   estado PENDIENTE + programada_para > now() + medicamento inactivo
--   → estado OMITIDA (sin borrar: notificaciones_whatsapp.toma_id
--     referencia a tomas con onDelete: NoAction).
--
-- Cómo ejecutarlo (elegir UNA):
--
--   1) Supabase → SQL Editor → pegar el contenido completo.
--   2) psql (desde ribani-server/, con DATABASE_URL del .env):
--        psql "$DATABASE_URL" -f prisma/sql/limpieza_tomas_medicamentos_eliminados.sql
--
-- Es idempotente: una vez corregidas, las filas ya no cumplen el WHERE
-- y una segunda corrida no cambia nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) PREVISUALIZACIÓN (no modifica nada): qué se va a corregir.
--    Revisa esta lista antes de continuar.
-- ---------------------------------------------------------------------
SELECT
  t.id,
  t.medicamento_id,
  m.nombre            AS medicamento,
  t.adulto_id,
  t.programada_para,
  t.estado
FROM tomas_medicamento t
JOIN medicamentos m ON m.id = t.medicamento_id
WHERE t.estado = 'PENDIENTE'
  AND t.programada_para > now()
  AND m.activo = false
ORDER BY t.programada_para;

-- ---------------------------------------------------------------------
-- 1) CORRECCIÓN (transacción): PENDIENTE futuras de inactivos → OMITIDA.
--    La nota documenta el motivo en la propia fila (auditable).
-- ---------------------------------------------------------------------
BEGIN;

UPDATE tomas_medicamento t
SET estado      = 'OMITIDA',
    nota        = CASE
                    WHEN t.nota IS NULL OR t.nota = ''
                      THEN 'Cancelada: medicamento retirado del plan (limpieza)'
                    ELSE t.nota || ' · Cancelada: medicamento retirado del plan (limpieza)'
                  END,
    updated_at  = now()
FROM medicamentos m
WHERE m.id = t.medicamento_id
  AND t.estado = 'PENDIENTE'
  AND t.programada_para > now()
  AND m.activo = false;

-- ---------------------------------------------------------------------
-- 2) VERIFICACIÓN posterior: debe devolver 0 filas.
-- ---------------------------------------------------------------------
SELECT count(*) AS pendientes_de_inactivos
FROM tomas_medicamento t
JOIN medicamentos m ON m.id = t.medicamento_id
WHERE t.estado = 'PENDIENTE'
  AND t.programada_para > now()
  AND m.activo = false;

COMMIT;

-- ---------------------------------------------------------------------
-- Notas:
-- - Las tomas de hoy ya vencidas (programada_para <= now()) NO se
--   tocan: son historial y romper el pasado generaría métricas falsas.
-- - Historial TOMADA/OMITIDA queda intacto.
-- - La app deja de mostrarlas en el siguiente refresco
--   (MedicationRepository.refrescar / GET /tomas), y las alarmas ya
--   programadas en Android se descartan solas: el
--   MedicationAlarmReceiver valida que la toma siga PENDIENTE.
-- =====================================================================
