-- =============================================================================
-- TURNAR - MIGRACIÓN 006: ROW LEVEL SECURITY (RLS) Y POLÍTICAS DE AISLAMIENTO
-- Creado por LUKSONARTS
-- =============================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 1. POLÍTICAS: PROFILES
-- -----------------------------------------------------------------------------
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR public.is_platform_admin());

CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid() AND is_platform_admin = (SELECT is_platform_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "profiles_admin_all" ON public.profiles
    FOR ALL TO authenticated
    USING (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 2. POLÍTICAS: ORGANIZATIONS
-- -----------------------------------------------------------------------------
-- Lectura pública para páginas públicas (ej. turnar.app/lava-ceramica)
CREATE POLICY "organizations_public_read" ON public.organizations
    FOR SELECT TO anon, authenticated
    USING (is_active = TRUE);

-- Edición solo para owner y administradores de la organización
CREATE POLICY "organizations_update_staff" ON public.organizations
    FOR UPDATE TO authenticated
    USING (public.has_org_role(id, ARRAY['owner', 'admin']::public.organization_role[]));

-- Control total para administrador de la plataforma
CREATE POLICY "organizations_admin_all" ON public.organizations
    FOR ALL TO authenticated
    USING (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 3. POLÍTICAS: ORGANIZATION_MEMBERS
-- -----------------------------------------------------------------------------
CREATE POLICY "org_members_read" ON public.organization_members
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR public.is_platform_admin());

CREATE POLICY "org_members_write_admins" ON public.organization_members
    FOR ALL TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 4. POLÍTICAS: PLANS Y SUBSCRIPTIONS
-- -----------------------------------------------------------------------------
CREATE POLICY "plans_read_all" ON public.plans
    FOR SELECT TO authenticated
    USING (TRUE);

CREATE POLICY "plans_admin_manage" ON public.plans
    FOR ALL TO authenticated
    USING (public.is_platform_admin());

CREATE POLICY "subs_read_members" ON public.organization_subscriptions
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR public.is_platform_admin());

CREATE POLICY "subs_admin_manage" ON public.organization_subscriptions
    FOR ALL TO authenticated
    USING (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 5. POLÍTICAS: USAGE COUNTERS (Solo lectura para staff, nunca modificable desde cliente)
-- -----------------------------------------------------------------------------
CREATE POLICY "usage_counters_read" ON public.usage_counters
    FOR SELECT TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 6. POLÍTICAS: ACTIVITIES Y SESSIONS
-- -----------------------------------------------------------------------------
CREATE POLICY "activities_public_read" ON public.activities
    FOR SELECT TO anon, authenticated
    USING (is_active = TRUE AND is_public = TRUE);

CREATE POLICY "activities_staff_manage" ON public.activities
    FOR ALL TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

CREATE POLICY "sessions_public_read" ON public.activity_sessions
    FOR SELECT TO anon, authenticated
    USING (status = 'scheduled');

CREATE POLICY "sessions_staff_manage" ON public.activity_sessions
    FOR ALL TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'instructor']::public.organization_role[]) OR public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 7. POLÍTICAS: CONTACTS Y GUARDIANS (Privacidad estricta)
-- -----------------------------------------------------------------------------
CREATE POLICY "contacts_staff_all" ON public.contacts
    FOR ALL TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'instructor']::public.organization_role[]) OR public.is_platform_admin());

CREATE POLICY "contacts_client_own" ON public.contacts
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "guardians_staff_all" ON public.guardians
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.contacts c
        WHERE c.id = guardians.contact_id
          AND public.has_org_role(c.organization_id, ARRAY['owner', 'admin', 'instructor']::public.organization_role[])
    ) OR public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 8. POLÍTICAS: BOOKINGS
-- -----------------------------------------------------------------------------
CREATE POLICY "bookings_staff_all" ON public.bookings
    FOR ALL TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'instructor']::public.organization_role[]) OR public.is_platform_admin());

CREATE POLICY "bookings_client_read_own" ON public.bookings
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.contacts c
        WHERE c.id = bookings.contact_id AND c.user_id = auth.uid()
    ));

-- -----------------------------------------------------------------------------
-- 9. POLÍTICAS: PAYMENTS (Solo Owner y Administradores de la Organización)
-- -----------------------------------------------------------------------------
CREATE POLICY "payments_staff_manage" ON public.payments
    FOR ALL TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 10. POLÍTICAS: AUDIT Y NOTIFICACIONES
-- -----------------------------------------------------------------------------
CREATE POLICY "audit_staff_read" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

CREATE POLICY "notification_outbox_staff_read" ON public.notification_outbox
    FOR SELECT TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());
