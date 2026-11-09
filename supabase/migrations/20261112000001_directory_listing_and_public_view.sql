-- =============================================================================
-- MIGRACIÓN 011: CONTROL DE VISIBILIDAD EN DIRECTORIO Y VISTA PÚBLICA DE ESPACIOS
-- =============================================================================
-- Esta migración incorpora el campo 'is_directory_listed' a nivel de organizaciones
-- y crea la vista segura 'public_directory_organizations' para permitir que el
-- directorio público de la página de inicio funcione respetando RLS y sin exponer
-- datos privados de clientes, miembros, pagos o configuraciones internas.
-- =============================================================================

-- 1. Agregar columna is_directory_listed a la tabla organizations
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS is_directory_listed BOOLEAN NOT NULL DEFAULT FALSE;

-- Índice para optimizar las consultas públicas del directorio
CREATE INDEX IF NOT EXISTS idx_organizations_directory_listed
ON public.organizations(is_directory_listed)
WHERE is_active = TRUE AND is_directory_listed = TRUE;

-- Habilitar por defecto Lava Cerámica en el directorio público
UPDATE public.organizations
SET is_directory_listed = TRUE
WHERE slug = 'lava-ceramica';

-- -----------------------------------------------------------------------------
-- 2. VISTA SEGURA: PUBLIC_DIRECTORY_ORGANIZATIONS
-- -----------------------------------------------------------------------------
-- Expone exclusivamente los datos públicos de organizaciones activas y listadas:
-- Nombre, dirección de espacio (slug), logo, descripción, categoría, ubicación
-- y el listado de actividades públicas y activas.
-- -----------------------------------------------------------------------------
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
  AND o.is_directory_listed = TRUE;

-- -----------------------------------------------------------------------------
-- 3. PERMISOS Y PRIVILEGIOS
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.public_directory_organizations FROM PUBLIC;
GRANT SELECT ON public.public_directory_organizations TO anon, authenticated;
