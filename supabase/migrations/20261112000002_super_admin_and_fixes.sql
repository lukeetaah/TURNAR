-- =============================================================================
-- MIGRACIÓN 012: RESOLUCIÓN DE RELACIONES AMBIGUAS, SUPERADMIN Y LAVA CERÁMICA
-- =============================================================================
-- 1. Elimina la restricción foránea redundante de una sola columna en activity_sessions
--    y activity_schedules para resolver el error de PostgREST:
--    "Could not embed because more than one relationship was found for 'activity_sessions' and 'activities'".
--    La integridad referencial compuesta (organization_id, activity_id) fk_sessions_activity_org
--    permanece activa y garantiza el aislamiento multi-tenant estricto.
--
-- 2. Habilita permisos de Superadministrador (is_platform_admin = true) para
--    la cuenta oficial de lucascorrea@outlook.com.ar.
--
-- 3. Vincula formalmente a lucascorrea@outlook.com.ar como Dueño ('owner') de
--    la organización LAVA CERÁMICA ('lava-ceramica') si el usuario ya existe.
--
-- 4. Expone funciones auxiliares de administración global con control de seguridad.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ELIMINACIÓN DE CLAVES FORÁNEAS REDUNDANTES EN SESIONES Y HORARIOS
-- -----------------------------------------------------------------------------
-- PostgREST detectaba dos claves foráneas entre activity_sessions y activities:
-- a) activity_sessions_activity_id_fkey: (activity_id -> activities.id)
-- b) fk_sessions_activity_org: (organization_id, activity_id -> activities.organization_id, id)
-- Al eliminar la clave simple redundante, PostgREST resuelve la relación sin ambigüedad.

ALTER TABLE public.activity_sessions
DROP CONSTRAINT IF EXISTS activity_sessions_activity_id_fkey;

ALTER TABLE public.activity_schedules
DROP CONSTRAINT IF EXISTS activity_schedules_activity_id_fkey;

-- -----------------------------------------------------------------------------
-- 2. ASIGNAR PRIVILEGIOS DE SUPERADMIN A lucascorrea@outlook.com.ar
-- -----------------------------------------------------------------------------
UPDATE public.profiles
SET is_platform_admin = TRUE,
    updated_at = pg_catalog.now()
WHERE LOWER(email) = 'lucascorrea@outlook.com.ar';

-- Asegurar que el trigger de nuevos usuarios siempre asigne superadmin a lucascorrea@outlook.com.ar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_is_admin BOOLEAN := FALSE;
BEGIN
    IF LOWER(NEW.email) = 'lucascorrea@outlook.com.ar' THEN
        v_is_admin := TRUE;
    END IF;

    INSERT INTO public.profiles (
        id,
        email,
        first_name,
        last_name,
        is_platform_admin
    ) VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        v_is_admin
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        is_platform_admin = CASE WHEN LOWER(EXCLUDED.email) = 'lucascorrea@outlook.com.ar' THEN TRUE ELSE public.profiles.is_platform_admin END,
        updated_at = pg_catalog.now();

    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. VINCULAR A lucascorrea@outlook.com.ar COMO DUEÑO DE LAVA CERÁMICA
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_lucas_id UUID;
    v_lava_id UUID;
BEGIN
    SELECT id INTO v_lucas_id FROM auth.users WHERE LOWER(email) = 'lucascorrea@outlook.com.ar';
    SELECT id INTO v_lava_id FROM public.organizations WHERE slug = 'lava-ceramica';

    IF v_lucas_id IS NOT NULL AND v_lava_id IS NOT NULL THEN
        INSERT INTO public.organization_members (
            organization_id,
            user_id,
            role,
            is_active
        ) VALUES (
            v_lava_id,
            v_lucas_id,
            'owner',
            TRUE
        )
        ON CONFLICT (organization_id, user_id)
        DO UPDATE SET role = 'owner', is_active = TRUE;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. PROCEDIMIENTO: ASIGNAR CUALQUIER MIEMBRO O DUEÑO DESDE EL SUPERADMIN
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_assign_member(
    p_org_id UUID,
    p_email TEXT,
    p_role public.organization_role
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_invitation_token TEXT;
    v_clean_email TEXT;
BEGIN
    -- Validar que quien invoca tenga privilegios de superadmin
    IF NOT public.is_platform_admin() AND (SELECT auth.jwt() ->> 'email') <> 'lucascorrea@outlook.com.ar' THEN
        RAISE EXCEPTION 'Solo los administradores globales de la plataforma pueden ejecutar esta acción.';
    END IF;

    v_clean_email := LOWER(TRIM(p_email));

    -- Verificar si el usuario ya existe en perfiles
    SELECT id INTO v_user_id FROM public.profiles WHERE LOWER(email) = v_clean_email;

    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
        VALUES (p_org_id, v_user_id, p_role, TRUE)
        ON CONFLICT (organization_id, user_id)
        DO UPDATE SET role = p_role, is_active = TRUE;

        RETURN json_build_object(
            'success', TRUE,
            'assigned_direct', TRUE,
            'message', 'Usuario vinculado inmediatamente como ' || p_role::text
        );
    ELSE
        -- Si no está registrado todavía, generar una invitación oficial
        v_invitation_token := encode(gen_random_bytes(24), 'hex');

        INSERT INTO public.organization_invitations (
            organization_id,
            role,
            invited_email,
            invitation_token,
            expires_at
        ) VALUES (
            p_org_id,
            p_role,
            v_clean_email,
            v_invitation_token,
            NOW() + INTERVAL '90 days'
        );

        RETURN json_build_object(
            'success', TRUE,
            'assigned_direct', FALSE,
            'invitation_token', v_invitation_token,
            'message', 'Invitación generada exitosamente para ' || v_clean_email
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_member TO authenticated;
