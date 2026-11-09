-- =============================================================================
-- MIGRACIÓN 014: VISIBILIDAD DE ESPACIOS EN DIRECTORIO PÚBLICO
-- =============================================================================
-- 1. Habilita 'is_directory_listed = TRUE' para todos los espacios activos actuales
--    (incluyendo LABURANTE, LAVA CERÁMICA y cualquier espacio creado por usuarios).
--
-- 2. Modifica el valor por defecto de 'is_directory_listed' a TRUE para que cualquier
--    organización nueva figure en el directorio automáticamente salvo que decida ocultarse.
--
-- 3. Actualiza la vista segura public_directory_organizations.
-- =============================================================================

-- 1. Activar visibilidad en directorio para todas las organizaciones activas
UPDATE public.organizations
SET is_directory_listed = TRUE
WHERE is_active = TRUE;

-- 2. Cambiar default de la columna para nuevos registros
ALTER TABLE public.organizations
ALTER COLUMN is_directory_listed SET DEFAULT TRUE;

-- 3. Actualizar la vista segura para incluir espacios activos
CREATE OR REPLACE VIEW public.public_directory_organizations
WITH (security_invoker = false)
AS
SELECT
    o.id,
    o.name,
    o.slug,
    o.description,
    o.activity_category,
    o.logo_url,
    o.address,
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id', a.id,
                    'name', a.name,
                    'duration_minutes', a.duration_minutes,
                    'price_cents', a.price_cents
                )
            )
            FROM public.activities a
            WHERE a.organization_id = o.id
              AND a.is_public = TRUE
              AND a.is_active = TRUE
        ),
        '[]'::json
    ) AS activities
FROM public.organizations o
WHERE o.is_active = TRUE
  AND (o.is_directory_listed IS NULL OR o.is_directory_listed = TRUE);

REVOKE ALL ON public.public_directory_organizations FROM PUBLIC;
GRANT SELECT ON public.public_directory_organizations TO anon, authenticated;
