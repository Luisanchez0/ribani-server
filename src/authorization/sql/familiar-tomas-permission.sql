-- Reparacion puntual: reutiliza el rol y permiso existentes, sin crear catalogos.
-- Los guards siguen exigiendo el permiso y el servicio valida el vinculo ACTIVA
-- con puede_gestionar_medicamentos para cada adulto mayor.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.roles
    WHERE codigo = 'FAMILIAR_ENCARGADO' AND activo = true
  ) OR NOT EXISTS (
    SELECT 1 FROM public.permisos
    WHERE codigo = 'tomas.actualizar' AND recurso = 'tomas' AND accion = 'ACTUALIZAR'
  ) THEN
    RAISE EXCEPTION 'No existe el rol activo o el permiso esperado; no se modificaron permisos.';
  END IF;
END $$;

INSERT INTO public.rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permisos p
WHERE r.codigo = 'FAMILIAR_ENCARGADO' AND r.activo = true
  AND p.codigo = 'tomas.actualizar' AND p.recurso = 'tomas' AND p.accion = 'ACTUALIZAR'
ON CONFLICT (rol_id, permiso_id) DO NOTHING
RETURNING rol_id, permiso_id;

SELECT r.codigo AS rol, p.codigo AS permiso
FROM public.rol_permisos rp
JOIN public.roles r ON r.id = rp.rol_id
JOIN public.permisos p ON p.id = rp.permiso_id
WHERE r.codigo = 'FAMILIAR_ENCARGADO' AND p.codigo = 'tomas.actualizar';

COMMIT;
