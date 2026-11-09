-- =============================================================================
-- MIGRACIÓN 013: GESTIÓN COMPLETA DE MIEMBROS Y PERMISOS DE ELIMINACIÓN
-- =============================================================================
-- 1. Actualiza public.is_platform_admin() con validación de seguridad de respaldo
--    por JWT de correo electrónico oficial.
--
-- 2. Define políticas explícitas en public.organization_members para SELECT,
--    INSERT, UPDATE y DELETE, garantizando que:
--    - Dueños y administradores del espacio puedan gestionar y eliminar miembros.
--    - Cualquier usuario pueda retirarse de un espacio (abandonar voluntariamente).
--    - El superadministrador pueda eliminar o cambiar roles en cualquier espacio.
--
-- 3. Crea funciones seguras (SECURITY DEFINER) para remover miembros y cambiar roles.
--
-- 4. Desvincula automáticamente a lucascorrea@outlook.com.ar de LAVA CERÁMICA
--    dado que Seba ya ha sido establecido como Dueño.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ROBUSTEZ DE is_platform_admin()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT COALESCE(
        (SELECT is_platform_admin FROM public.profiles WHERE id = auth.uid()),
        (SELECT (auth.jwt() ->> 'email') = 'lucascorrea@outlook.com.ar'),
        FALSE
    );
$$;

-- -----------------------------------------------------------------------------
-- 2. POLÍTICAS RLS EXPLÍCITAS EN ORGANIZATION_MEMBERS
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "org_members_write_admins" ON public.organization_members;
DROP POLICY IF EXISTS "org_members_read" ON public.organization_members;
DROP POLICY IF EXISTS "org_members_select" ON public.organization_members;
DROP POLICY IF EXISTS "org_members_insert" ON public.organization_members;
DROP POLICY IF EXISTS "org_members_update" ON public.organization_members;
DROP POLICY IF EXISTS "org_members_delete" ON public.organization_members;

-- Lectura
CREATE POLICY "org_members_select" ON public.organization_members
    FOR SELECT TO authenticated
    USING (
        public.is_org_member(organization_id)
        OR public.is_platform_admin()
        OR (auth.jwt() ->> 'email') = 'lucascorrea@outlook.com.ar'
    );

-- Inserción (dueños, administradores o superadmin)
CREATE POLICY "org_members_insert" ON public.organization_members
    FOR INSERT TO authenticated
    WITH CHECK (
        public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[])
        OR public.is_platform_admin()
        OR (auth.jwt() ->> 'email') = 'lucascorrea@outlook.com.ar'
    );

-- Actualización de rol o estado
CREATE POLICY "org_members_update" ON public.organization_members
    FOR UPDATE TO authenticated
    USING (
        public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[])
        OR public.is_platform_admin()
        OR (auth.jwt() ->> 'email') = 'lucascorrea@outlook.com.ar'
    )
    WITH CHECK (
        public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[])
        OR public.is_platform_admin()
        OR (auth.jwt() ->> 'email') = 'lucascorrea@outlook.com.ar'
    );

-- Eliminación (dueños, administradores, superadmin o el propio usuario saliendo del espacio)
CREATE POLICY "org_members_delete" ON public.organization_members
    FOR DELETE TO authenticated
    USING (
        public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[])
        OR user_id = auth.uid()
        OR public.is_platform_admin()
        OR (auth.jwt() ->> 'email') = 'lucascorrea@outlook.com.ar'
    );

-- -----------------------------------------------------------------------------
-- 3. PROCEDIMIENTOS ALMACENADOS PARA ELIMINAR Y ACTUALIZAR MIEMBROS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_remove_member(
    p_org_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_is_admin BOOLEAN;
    v_is_org_owner_or_admin BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    v_is_admin := public.is_platform_admin() OR (SELECT auth.jwt() ->> 'email') = 'lucascorrea@outlook.com.ar';
    v_is_org_owner_or_admin := public.has_org_role(p_org_id, ARRAY['owner', 'admin']::public.organization_role[]);

    -- Permitir si es superadmin, si es dueño/administrador del espacio, o si es el propio usuario
    IF NOT v_is_admin AND NOT v_is_org_owner_or_admin AND v_caller_id <> p_user_id THEN
        RAISE EXCEPTION 'No tenés permisos para remover a este miembro del espacio.';
    END IF;

    DELETE FROM public.organization_members
    WHERE organization_id = p_org_id AND user_id = p_user_id;

    RETURN json_build_object(
        'success', TRUE,
        'message', 'Miembro removido exitosamente.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_remove_member TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_member_role(
    p_org_id UUID,
    p_user_id UUID,
    p_role public.organization_role
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_is_admin BOOLEAN;
    v_is_org_owner_or_admin BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    v_is_admin := public.is_platform_admin() OR (SELECT auth.jwt() ->> 'email') = 'lucascorrea@outlook.com.ar';
    v_is_org_owner_or_admin := public.has_org_role(p_org_id, ARRAY['owner', 'admin']::public.organization_role[]);

    IF NOT v_is_admin AND NOT v_is_org_owner_or_admin THEN
        RAISE EXCEPTION 'No tenés permisos para modificar roles en este espacio.';
    END IF;

    UPDATE public.organization_members
    SET role = p_role,
        is_active = TRUE,
        updated_at = pg_catalog.now()
    WHERE organization_id = p_org_id AND user_id = p_user_id;

    RETURN json_build_object(
        'success', TRUE,
        'message', 'Rol actualizado a ' || p_role::text
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_member_role TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. DESVINCULAR A lucascorrea@outlook.com.ar DE LAVA CERÁMICA (SI HAY OTRO DUEÑO)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_lucas_id UUID;
    v_lava_id UUID;
BEGIN
    SELECT id INTO v_lucas_id FROM auth.users WHERE LOWER(email) = 'lucascorrea@outlook.com.ar';
    SELECT id INTO v_lava_id FROM public.organizations WHERE slug = 'lava-ceramica';

    IF v_lucas_id IS NOT NULL AND v_lava_id IS NOT NULL THEN
        -- Solo eliminar a Lucas si ya existe al menos otro miembro con rol 'owner' (Seba)
        IF EXISTS (
            SELECT 1 FROM public.organization_members
            WHERE organization_id = v_lava_id
              AND role = 'owner'
              AND user_id <> v_lucas_id
        ) THEN
            DELETE FROM public.organization_members
            WHERE organization_id = v_lava_id
              AND user_id = v_lucas_id;
        END IF;
    END IF;
END $$;
