-- =============================================================================
-- TURNAR - MIGRACIÓN 008: CORRECCIONES DE SEGURIDAD, INTEGRIDAD Y MULTI-TENANCY
-- Creado por LUKSONARTS
-- =============================================================================

-- =============================================================================
-- PARTE 1: PERFILES Y PROTECCIÓN DE ADMINISTRACIÓN GLOBAL
-- =============================================================================

-- 1.1 Trigger de inserción automática de perfil al registrarse en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        first_name,
        last_name,
        email,
        phone,
        avatar_url,
        is_platform_admin,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        NEW.email,
        NEW.raw_user_meta_data->>'phone',
        NEW.raw_user_meta_data->>'avatar_url',
        FALSE, -- Nunca permitir que un usuario se auto-asigne como admin de plataforma
        pg_catalog.now(),
        pg_catalog.now()
    ) ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 1.2 Protección estricta del flag is_platform_admin contra escalamiento de privilegios
CREATE OR REPLACE FUNCTION public.protect_profile_admin_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Si se intenta cambiar is_platform_admin y quien ejecuta no es superadmin de plataforma, revertir o rechazar
    IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_platform_admin = TRUE
        ) THEN
            RAISE EXCEPTION 'No tenés permisos para modificar los privilegios de administración global de TURNAR.';
        END IF;
    END IF;

    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_admin_flag ON public.profiles;
CREATE TRIGGER trg_protect_profile_admin_flag
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_admin_flag();

-- =============================================================================
-- PARTE 2: FUNCIONES AUXILIARES CON search_path = '' Y REFERENCIAS CALIFICADAS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_platform_admin = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(
    target_org_id UUID,
    required_roles public.organization_role[]
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = target_org_id
          AND user_id = auth.uid()
          AND is_active = TRUE
          AND role = ANY(required_roles)
    );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT public.has_org_role(target_org_id, ARRAY['owner', 'admin', 'instructor', 'client']::public.organization_role[]);
$$;

-- =============================================================================
-- PARTE 3: ZONA HORARIA Y CONDICIÓN DE CARRERA EN PERÍODOS DE CONSUMO
-- =============================================================================

-- 3.1 Agregar columna timezone a organization_settings
ALTER TABLE public.organization_settings
ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires';

-- 3.2 Corrección robusta contra condiciones de carrera y husos horarios
CREATE OR REPLACE FUNCTION public.get_or_create_current_usage_period(target_org_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_timezone TEXT;
    v_local_today DATE;
    v_start_date DATE;
    v_end_date DATE;
    v_period_id UUID;
BEGIN
    -- Obtener la zona horaria configurada de la organización (default Buenos Aires)
    SELECT COALESCE(timezone, 'America/Argentina/Buenos_Aires')
    INTO v_timezone
    FROM public.organization_settings
    WHERE organization_id = target_org_id;

    IF v_timezone IS NULL THEN
        v_timezone := 'America/Argentina/Buenos_Aires';
    END IF;

    -- Calcular fechas según el huso horario local de la organización
    v_local_today := (pg_catalog.now() AT TIME ZONE v_timezone)::DATE;
    v_start_date := date_trunc('month', v_local_today)::DATE;
    v_end_date := (date_trunc('month', v_local_today) + INTERVAL '1 month - 1 day')::DATE;

    -- Intentar insertar o recuperar el período atómicamente
    INSERT INTO public.usage_periods (organization_id, period_start, period_end, is_current)
    VALUES (target_org_id, v_start_date, v_end_date, TRUE)
    ON CONFLICT (organization_id, period_start, period_end)
    DO UPDATE SET is_current = TRUE
    RETURNING id INTO v_period_id;

    -- Asegurar que los períodos anteriores queden desmarcados como 'current'
    UPDATE public.usage_periods
    SET is_current = FALSE
    WHERE organization_id = target_org_id
      AND id <> v_period_id
      AND is_current = TRUE;

    -- Inicializar contadores si no existen
    INSERT INTO public.usage_counters (organization_id, period_id, bookings_count, emails_sent_count, storage_used_bytes)
    VALUES (target_org_id, v_period_id, 0, 0, 0)
    ON CONFLICT (organization_id, period_id) DO NOTHING;

    RETURN v_period_id;
END;
$$;

-- =============================================================================
-- PARTE 4: BLINDAJE MULTI-TENANT E INTEGRIDAD REFERENCIAL COMPUESTA
-- =============================================================================

-- 4.1 Claves compuestas únicas para integridad entre organizaciones
ALTER TABLE public.activities
ADD CONSTRAINT uq_activities_org_id UNIQUE (organization_id, id);

ALTER TABLE public.instructors
ADD CONSTRAINT uq_instructors_org_id UNIQUE (organization_id, id);

ALTER TABLE public.contacts
ADD CONSTRAINT uq_contacts_org_id UNIQUE (organization_id, id);

ALTER TABLE public.price_versions
ADD CONSTRAINT uq_price_versions_org_id UNIQUE (organization_id, id);

-- 4.2 Agregar organization_id a activity_schedules para forzar coherencia
ALTER TABLE public.activity_schedules
ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Poblar organization_id en schedules desde activities
UPDATE public.activity_schedules s
SET organization_id = a.organization_id
FROM public.activities a
WHERE s.activity_id = a.id AND s.organization_id IS NULL;

ALTER TABLE public.activity_schedules
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.activity_schedules
ADD CONSTRAINT fk_act_schedules_activity_org
FOREIGN KEY (organization_id, activity_id)
REFERENCES public.activities(organization_id, id) ON DELETE CASCADE;

-- 4.3 Forzar que las sesiones no puedan cruzar organizaciones
ALTER TABLE public.activity_sessions
DROP CONSTRAINT IF EXISTS fk_sessions_activity_org;

ALTER TABLE public.activity_sessions
ADD CONSTRAINT fk_sessions_activity_org
FOREIGN KEY (organization_id, activity_id)
REFERENCES public.activities(organization_id, id) ON DELETE CASCADE;

-- 4.4 Forzar que las reservas no puedan cruzar contactos de otra organización
ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS fk_bookings_contact_org;

ALTER TABLE public.bookings
ADD CONSTRAINT fk_bookings_contact_org
FOREIGN KEY (organization_id, contact_id)
REFERENCES public.contacts(organization_id, id) ON DELETE RESTRICT;

-- 4.5 Forzar que los pagos vinculen contactos y versiones de precio de la misma organización
ALTER TABLE public.payments
DROP CONSTRAINT IF EXISTS fk_payments_contact_org;

ALTER TABLE public.payments
ADD CONSTRAINT fk_payments_contact_org
FOREIGN KEY (organization_id, contact_id)
REFERENCES public.contacts(organization_id, id) ON DELETE RESTRICT;

-- =============================================================================
-- PARTE 5: RESERVAS, RE-RESERVAS Y CANCELACIONES
-- =============================================================================

-- 5.1 Reemplazar constraint único por índice único parcial (permite volver a reservar tras cancelación)
ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_session_id_contact_id_key;

DROP INDEX IF EXISTS public.idx_bookings_unique_active_contact;
CREATE UNIQUE INDEX idx_bookings_unique_active_contact
ON public.bookings (session_id, contact_id)
WHERE status NOT IN ('cancelled');

-- 5.2 Procedimiento atómico create_booking_atomic completamente validado
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
    p_organization_id UUID,
    p_session_id UUID,
    p_contact_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session_capacity INTEGER;
    v_session_booked INTEGER;
    v_session_status public.session_status;
    v_activity_active BOOLEAN;
    v_contact_user_id UUID;
    v_booking_id UUID;
    v_period_id UUID;
    v_current_bookings_count INTEGER;
    v_max_monthly_bookings INTEGER;
    v_is_staff BOOLEAN;
BEGIN
    -- 1. Validar que el contacto pertenezca estrictamente a la organización solicitante
    SELECT user_id INTO v_contact_user_id
    FROM public.contacts
    WHERE id = p_contact_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El contacto no existe o no pertenece a esta organización.';
    END IF;

    -- 2. Validar autorización del emisor (o es staff de la org, o es el usuario dueño del contacto, o es reserva pública permitida)
    v_is_staff := public.has_org_role(p_organization_id, ARRAY['owner', 'admin', 'instructor']::public.organization_role[]);
    
    IF auth.uid() IS NOT NULL AND NOT v_is_staff THEN
        IF v_contact_user_id IS NOT NULL AND v_contact_user_id <> auth.uid() THEN
            RAISE EXCEPTION 'No tenés autorización para realizar reservas a nombre de otra persona.';
        END IF;
    END IF;

    -- 3. Bloquear y validar la sesión y su actividad padre mediante SELECT FOR UPDATE
    SELECT s.capacity, s.booked_count, s.status, a.is_active
    INTO v_session_capacity, v_session_booked, v_session_status, v_activity_active
    FROM public.activity_sessions s
    JOIN public.activities a ON a.id = s.activity_id AND a.organization_id = p_organization_id
    WHERE s.id = p_session_id AND s.organization_id = p_organization_id
    FOR UPDATE OF s;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La sesión seleccionada no existe o no pertenece a esta organización.';
    END IF;

    IF NOT v_activity_active THEN
        RAISE EXCEPTION 'La actividad correspondiente a esta clase se encuentra suspendida o inactiva.';
    END IF;

    IF v_session_status <> 'scheduled' THEN
        RAISE EXCEPTION 'La sesión no se encuentra disponible para reservas.';
    END IF;

    IF v_session_booked >= v_session_capacity THEN
        RAISE EXCEPTION 'No hay cupos disponibles en esta sesión.';
    END IF;

    -- 4. Validar cuota mensual del plan en backend
    v_period_id := public.get_or_create_current_usage_period(p_organization_id);

    SELECT uc.bookings_count, COALESCE((os.custom_limits_override->>'max_monthly_bookings')::INTEGER, p.max_monthly_bookings)
    INTO v_current_bookings_count, v_max_monthly_bookings
    FROM public.usage_counters uc
    JOIN public.organization_subscriptions os ON os.organization_id = p_organization_id
    JOIN public.plans p ON p.id = os.plan_id
    WHERE uc.organization_id = p_organization_id AND uc.period_id = v_period_id;

    IF v_current_bookings_count >= v_max_monthly_bookings THEN
        RAISE EXCEPTION 'Alcanzaste el límite mensual de reservas de tu plan (% de %). Consultá las opciones para ampliar tu capacidad.',
            v_current_bookings_count, v_max_monthly_bookings;
    END IF;

    -- 5. Crear la reserva
    INSERT INTO public.bookings (organization_id, session_id, contact_id, status, notes, created_at, updated_at)
    VALUES (p_organization_id, p_session_id, p_contact_id, 'confirmed', p_notes, pg_catalog.now(), pg_catalog.now())
    RETURNING id INTO v_booking_id;

    -- 6. Incrementar cupo en la sesión
    UPDATE public.activity_sessions
    SET booked_count = booked_count + 1,
        updated_at = pg_catalog.now()
    WHERE id = p_session_id;

    -- 7. Incrementar contador de uso mensual
    UPDATE public.usage_counters
    SET bookings_count = bookings_count + 1,
        updated_at = pg_catalog.now()
    WHERE organization_id = p_organization_id AND period_id = v_period_id;

    RETURN v_booking_id;
END;
$$;

-- 5.3 Procedimiento atómico para cancelar reserva y liberar cupo
CREATE OR REPLACE FUNCTION public.cancel_booking_atomic(
    p_organization_id UUID,
    p_booking_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session_id UUID;
    v_status public.booking_status;
    v_contact_id UUID;
    v_contact_user_id UUID;
    v_is_staff BOOLEAN;
BEGIN
    -- 1. Validar reserva y autorización
    SELECT b.session_id, b.status, b.contact_id, c.user_id
    INTO v_session_id, v_status, v_contact_id, v_contact_user_id
    FROM public.bookings b
    JOIN public.contacts c ON c.id = b.contact_id
    WHERE b.id = p_booking_id AND b.organization_id = p_organization_id
    FOR UPDATE OF b;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La reserva no existe en esta organización.';
    END IF;

    IF v_status = 'cancelled' THEN
        RETURN TRUE; -- Ya estaba cancelada, operación idempotente
    END IF;

    v_is_staff := public.has_org_role(p_organization_id, ARRAY['owner', 'admin', 'instructor']::public.organization_role[]);

    IF auth.uid() IS NOT NULL AND NOT v_is_staff THEN
        IF v_contact_user_id IS NOT NULL AND v_contact_user_id <> auth.uid() THEN
            RAISE EXCEPTION 'No tenés permisos para cancelar la reserva de otra persona.';
        END IF;
    END IF;

    -- 2. Marcar como cancelada con motivo y timestamp
    UPDATE public.bookings
    SET status = 'cancelled',
        cancellation_reason = p_reason,
        cancelled_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_booking_id;

    -- 3. Liberar cupo en la sesión
    UPDATE public.activity_sessions
    SET booked_count = GREATEST(0, booked_count - 1),
        updated_at = pg_catalog.now()
    WHERE id = v_session_id;

    -- Nota de cuotas: No se descuenta del contador mensual consumido
    -- para impedir que cancelar y recrear eluda la cuota mensual.

    RETURN TRUE;
END;
$$;

-- =============================================================================
-- PARTE 6: CONTROL REAL DE PLANES Y LÍMITES EN BACKEND
-- =============================================================================

-- 6.1 Procedimiento seguro para crear organización respetando el límite de 1 organización gratuita por usuario
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
    p_name TEXT,
    p_slug TEXT,
    p_description TEXT DEFAULT NULL,
    p_activity_category TEXT DEFAULT NULL,
    p_timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_free_plan_id UUID;
    v_existing_free_orgs INTEGER;
    v_max_orgs INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debés iniciar sesión para crear una organización.';
    END IF;

    -- Obtener ID del Plan Gratuito oficial
    SELECT id, max_organizations INTO v_free_plan_id, v_max_orgs
    FROM public.plans
    WHERE code = 'free';

    IF v_free_plan_id IS NULL THEN
        RAISE EXCEPTION 'El plan base no se encuentra configurado en el sistema.';
    END IF;

    -- Validar cuántas organizaciones activas posee el usuario con plan gratuito
    SELECT COUNT(DISTINCT om.organization_id)
    INTO v_existing_free_orgs
    FROM public.organization_members om
    JOIN public.organization_subscriptions os ON os.organization_id = om.organization_id
    WHERE om.user_id = v_user_id
      AND om.role = 'owner'
      AND om.is_active = TRUE
      AND os.plan_id = v_free_plan_id
      AND os.status = 'active';

    IF v_existing_free_orgs >= v_max_orgs AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Alcanzaste el límite de organizaciones de tu plan (% de %). Podés administrar tu espacio existente o consultar opciones de ampliación.',
            v_existing_free_orgs, v_max_orgs;
    END IF;

    -- Insertar organización
    INSERT INTO public.organizations (name, slug, description, activity_category, is_active, is_custom_setup)
    VALUES (p_name, p_slug, p_description, p_activity_category, TRUE, FALSE)
    RETURNING id INTO v_org_id;

    -- Crear settings
    INSERT INTO public.organization_settings (organization_id, timezone, cancellation_notice_hours, allow_waitlist, auto_confirm_bookings)
    VALUES (v_org_id, p_timezone, 24, TRUE, TRUE);

    -- Habilitar módulos esenciales del núcleo
    INSERT INTO public.organization_modules (organization_id, module_key, is_enabled)
    VALUES
        (v_org_id, 'activities', TRUE),
        (v_org_id, 'instructors', TRUE),
        (v_org_id, 'agenda', TRUE),
        (v_org_id, 'bookings', TRUE),
        (v_org_id, 'clients', TRUE);

    -- Asignar suscripción al Plan Gratuito
    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status)
    VALUES (v_org_id, v_free_plan_id, 'active');

    -- Vincular al usuario como 'owner'
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (v_org_id, v_user_id, 'owner', TRUE);

    -- Inicializar período de consumo inicial
    PERFORM public.get_or_create_current_usage_period(v_org_id);

    RETURN v_org_id;
END;
$$;

-- 6.2 Trigger para validar límite de Administradores y Profesionales (max_staff)
CREATE OR REPLACE FUNCTION public.check_staff_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_staff INTEGER;
    v_max_staff INTEGER;
BEGIN
    IF NEW.role IN ('owner', 'admin', 'instructor') AND NEW.is_active = TRUE THEN
        SELECT COUNT(*), COALESCE((os.custom_limits_override->>'max_staff')::INTEGER, p.max_staff)
        INTO v_current_staff, v_max_staff
        FROM public.organization_members om
        JOIN public.organization_subscriptions os ON os.organization_id = NEW.organization_id
        JOIN public.plans p ON p.id = os.plan_id
        WHERE om.organization_id = NEW.organization_id
          AND om.role IN ('owner', 'admin', 'instructor')
          AND om.is_active = TRUE
          AND om.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
        GROUP BY os.custom_limits_override, p.max_staff;

        IF v_current_staff >= v_max_staff THEN
            RAISE EXCEPTION 'Alcanzaste el límite de administradores y profesionales de tu plan (máximo % personas).', v_max_staff;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_staff_limit ON public.organization_members;
CREATE TRIGGER trg_check_staff_limit
    BEFORE INSERT OR UPDATE ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.check_staff_limit();

-- 6.3 Trigger para validar límite de Clientes y Alumnos Activos (max_active_contacts)
CREATE OR REPLACE FUNCTION public.check_contacts_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_contacts INTEGER;
    v_max_contacts INTEGER;
BEGIN
    SELECT COUNT(*), COALESCE((os.custom_limits_override->>'max_active_contacts')::INTEGER, p.max_active_contacts)
    INTO v_current_contacts, v_max_contacts
    FROM public.contacts c
    JOIN public.organization_subscriptions os ON os.organization_id = NEW.organization_id
    JOIN public.plans p ON p.id = os.plan_id
    WHERE c.organization_id = NEW.organization_id
    GROUP BY os.custom_limits_override, p.max_active_contacts;

    IF v_current_contacts >= v_max_contacts THEN
        RAISE EXCEPTION 'Alcanzaste el límite de alumnos y clientes activos de tu plan (máximo % contactos).', v_max_contacts;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_contacts_limit ON public.contacts;
CREATE TRIGGER trg_check_contacts_limit
    BEFORE INSERT ON public.contacts
    FOR EACH ROW EXECUTE FUNCTION public.check_contacts_limit();

-- 6.4 Trigger para validar límite de Actividades Activas (max_active_activities)
CREATE OR REPLACE FUNCTION public.check_activities_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_activities INTEGER;
    v_max_activities INTEGER;
BEGIN
    IF NEW.is_active = TRUE THEN
        SELECT COUNT(*), COALESCE((os.custom_limits_override->>'max_active_activities')::INTEGER, p.max_active_activities)
        INTO v_current_activities, v_max_activities
        FROM public.activities a
        JOIN public.organization_subscriptions os ON os.organization_id = NEW.organization_id
        JOIN public.plans p ON p.id = os.plan_id
        WHERE a.organization_id = NEW.organization_id
          AND a.is_active = TRUE
          AND a.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
        GROUP BY os.custom_limits_override, p.max_active_activities;

        IF v_current_activities >= v_max_activities THEN
            RAISE EXCEPTION 'Alcanzaste el límite de actividades activas de tu plan (máximo % actividades).', v_max_activities;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_activities_limit ON public.activities;
CREATE TRIGGER trg_check_activities_limit
    BEFORE INSERT OR UPDATE ON public.activities
    FOR EACH ROW EXECUTE FUNCTION public.check_activities_limit();

-- =============================================================================
-- PARTE 7: PAGOS MANUALES VERIFICADOS Y COMUNICACIONES TRANSACCIONALES
-- =============================================================================

-- 7.1 Estados de verificación de pagos y auditoría
CREATE TYPE public.payment_status AS ENUM ('pending', 'verified', 'rejected');

ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS status public.payment_status NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Procedimiento para verificar pago manual
CREATE OR REPLACE FUNCTION public.verify_payment_manual(
    p_organization_id UUID,
    p_payment_id UUID,
    p_new_status public.payment_status,
    p_verification_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_org_role(p_organization_id, ARRAY['owner', 'admin']::public.organization_role[])
       AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Solo administradores pueden verificar pagos.';
    END IF;

    UPDATE public.payments
    SET status = p_new_status,
        verified_at = pg_catalog.now(),
        verified_by = auth.uid(),
        notes = CASE
            WHEN p_verification_notes IS NOT NULL THEN COALESCE(notes || E'\n', '') || 'Verificación: ' || p_verification_notes
            ELSE notes
        END,
        updated_at = pg_catalog.now()
    WHERE id = p_payment_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pago no existe en esta organización.';
    END IF;

    RETURN TRUE;
END;
$$;

-- 7.2 Corrección de unicidad en notification_outbox: por organización, no global
ALTER TABLE public.notification_outbox
DROP CONSTRAINT IF EXISTS notification_outbox_idempotency_key_key;

DROP INDEX IF EXISTS public.idx_notification_outbox_org_idempotency;
CREATE UNIQUE INDEX idx_notification_outbox_org_idempotency
ON public.notification_outbox (organization_id, idempotency_key);

-- 7.3 Procedimiento para encolar notificaciones con control de cuota mensual de correos
CREATE OR REPLACE FUNCTION public.enqueue_notification(
    p_organization_id UUID,
    p_event_type public.notification_event_type,
    p_recipient_email TEXT,
    p_recipient_name TEXT,
    p_idempotency_key TEXT,
    p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_outbox_id UUID;
    v_period_id UUID;
    v_current_emails INTEGER;
    v_max_monthly_emails INTEGER;
BEGIN
    -- Validar cuota mensual de correos
    v_period_id := public.get_or_create_current_usage_period(p_organization_id);

    SELECT uc.emails_sent_count, COALESCE((os.custom_limits_override->>'max_monthly_emails')::INTEGER, p.max_monthly_emails)
    INTO v_current_emails, v_max_monthly_emails
    FROM public.usage_counters uc
    JOIN public.organization_subscriptions os ON os.organization_id = p_organization_id
    JOIN public.plans p ON p.id = os.plan_id
    WHERE uc.organization_id = p_organization_id AND uc.period_id = v_period_id;

    IF v_current_emails >= v_max_monthly_emails THEN
        RAISE EXCEPTION 'Alcanzaste el límite mensual de correos transaccionales de tu plan (% de %).',
            v_current_emails, v_max_monthly_emails;
    END IF;

    -- Encolar notificación de forma idempotente
    INSERT INTO public.notification_outbox (
        organization_id,
        event_type,
        recipient_email,
        recipient_name,
        idempotency_key,
        payload,
        status,
        attempts,
        created_at
    ) VALUES (
        p_organization_id,
        p_event_type,
        p_recipient_email,
        p_recipient_name,
        p_idempotency_key,
        p_payload,
        'pending',
        0,
        pg_catalog.now()
    ) ON CONFLICT (organization_id, idempotency_key)
    DO UPDATE SET status = public.notification_outbox.status
    RETURNING id INTO v_outbox_id;

    -- Incrementar contador de emails
    UPDATE public.usage_counters
    SET emails_sent_count = emails_sent_count + 1,
        updated_at = pg_catalog.now()
    WHERE organization_id = p_organization_id AND period_id = v_period_id;

    RETURN v_outbox_id;
END;
$$;

-- =============================================================================
-- PARTE 8: POLÍTICAS RLS EXHAUSTIVAS PARA LAS 13 TABLAS RESTANTES
-- =============================================================================

-- 8.1 organization_settings
CREATE POLICY "org_settings_select_members" ON public.organization_settings
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR public.is_platform_admin());

CREATE POLICY "org_settings_update_admins" ON public.organization_settings
    FOR UPDATE TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

-- 8.2 organization_modules
CREATE POLICY "org_modules_select_all" ON public.organization_modules
    FOR SELECT TO anon, authenticated
    USING (TRUE);

CREATE POLICY "org_modules_update_admins" ON public.organization_modules
    FOR ALL TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

-- 8.3 usage_periods
CREATE POLICY "usage_periods_select_staff" ON public.usage_periods
    FOR SELECT TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

-- 8.4 instructors
CREATE POLICY "instructors_select_public" ON public.instructors
    FOR SELECT TO anon, authenticated
    USING (is_active = TRUE);

CREATE POLICY "instructors_manage_staff" ON public.instructors
    FOR ALL TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

CREATE POLICY "instructors_update_self" ON public.instructors
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

-- 8.5 instructor_availability
CREATE POLICY "inst_avail_select" ON public.instructor_availability
    FOR SELECT TO anon, authenticated
    USING (TRUE);

CREATE POLICY "inst_avail_manage" ON public.instructor_availability
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.instructors i
        WHERE i.id = instructor_availability.instructor_id
          AND (public.has_org_role(i.organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR i.user_id = auth.uid() OR public.is_platform_admin())
    ));

-- 8.6 availability_exceptions
CREATE POLICY "avail_exceptions_select_staff" ON public.availability_exceptions
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.instructors i
        WHERE i.id = availability_exceptions.instructor_id
          AND (public.is_org_member(i.organization_id) OR public.is_platform_admin())
    ));

CREATE POLICY "avail_exceptions_manage" ON public.availability_exceptions
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.instructors i
        WHERE i.id = availability_exceptions.instructor_id
          AND (public.has_org_role(i.organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR i.user_id = auth.uid() OR public.is_platform_admin())
    ));

-- 8.7 activity_schedules
CREATE POLICY "act_schedules_select_public" ON public.activity_schedules
    FOR SELECT TO anon, authenticated
    USING (is_active = TRUE);

CREATE POLICY "act_schedules_manage_admins" ON public.activity_schedules
    FOR ALL TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

-- 8.8 waitlists
CREATE POLICY "waitlists_select_staff" ON public.waitlists
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.activity_sessions s
        WHERE s.id = waitlists.session_id
          AND (public.has_org_role(s.organization_id, ARRAY['owner', 'admin', 'instructor']::public.organization_role[]) OR public.is_platform_admin())
    ));

CREATE POLICY "waitlists_select_client_own" ON public.waitlists
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.contacts c
        WHERE c.id = waitlists.contact_id AND c.user_id = auth.uid()
    ));

CREATE POLICY "waitlists_manage_staff" ON public.waitlists
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.activity_sessions s
        WHERE s.id = waitlists.session_id
          AND (public.has_org_role(s.organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin())
    ));

-- 8.9 attendance
CREATE POLICY "attendance_select_staff" ON public.attendance
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.activity_sessions s
        WHERE s.id = attendance.session_id
          AND (public.has_org_role(s.organization_id, ARRAY['owner', 'admin', 'instructor']::public.organization_role[]) OR public.is_platform_admin())
    ));

CREATE POLICY "attendance_select_client_own" ON public.attendance
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.contacts c
        WHERE c.id = attendance.contact_id AND c.user_id = auth.uid()
    ));

CREATE POLICY "attendance_manage_staff" ON public.attendance
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.activity_sessions s
        WHERE s.id = attendance.session_id
          AND (public.has_org_role(s.organization_id, ARRAY['owner', 'admin', 'instructor']::public.organization_role[]) OR public.is_platform_admin())
    ));

-- 8.10 price_versions
CREATE POLICY "price_versions_select_staff" ON public.price_versions
    FOR SELECT TO authenticated
    USING (public.is_org_member(organization_id) OR public.is_platform_admin());

CREATE POLICY "price_versions_manage_admins" ON public.price_versions
    FOR ALL TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

-- 8.11 announcements
CREATE POLICY "announcements_select_public" ON public.announcements
    FOR SELECT TO anon, authenticated
    USING (is_published = TRUE);

CREATE POLICY "announcements_manage_admins" ON public.announcements
    FOR ALL TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

-- 8.12 events
CREATE POLICY "events_select_public" ON public.events
    FOR SELECT TO anon, authenticated
    USING (is_public = TRUE);

CREATE POLICY "events_manage_admins" ON public.events
    FOR ALL TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

-- 8.13 notification_logs
CREATE POLICY "notification_logs_select_admins" ON public.notification_logs
    FOR SELECT TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

-- =============================================================================
-- PARTE 9: SEGURIDAD EN INVITACIONES Y AJUSTE DE LAVA CERÁMICA
-- =============================================================================

-- 9.1 Habilitar RLS en organization_invitations
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_staff_select" ON public.organization_invitations
    FOR SELECT TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

CREATE POLICY "invitations_staff_manage" ON public.organization_invitations
    FOR ALL TO authenticated
    USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[]) OR public.is_platform_admin());

-- 9.2 Procedimiento de reclamo con search_path = '', verificación de expiración y correo
CREATE OR REPLACE FUNCTION public.claim_organization_invitation(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_invitation RECORD;
    v_user_id UUID;
    v_user_email TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debés iniciar sesión para reclamar esta invitación.';
    END IF;

    -- Obtener correo del usuario autenticado
    SELECT email INTO v_user_email FROM public.profiles WHERE id = v_user_id;

    SELECT id, organization_id, role, invited_email, is_claimed, expires_at
    INTO v_invitation
    FROM public.organization_invitations
    WHERE invitation_token = p_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La invitación no es válida o no existe.';
    END IF;

    IF v_invitation.is_claimed THEN
        RAISE EXCEPTION 'Esta invitación ya fue utilizada previamente.';
    END IF;

    IF v_invitation.expires_at < pg_catalog.now() THEN
        RAISE EXCEPTION 'La invitación ha expirado.';
    END IF;

    -- Si la invitación especificaba un email de destino, validar que coincida
    IF v_invitation.invited_email IS NOT NULL AND v_user_email IS NOT NULL THEN
        IF LOWER(v_invitation.invited_email) <> LOWER(v_user_email) THEN
            RAISE EXCEPTION 'Esta invitación está dirigida a otro correo electrónico (%s).', v_invitation.invited_email;
        END IF;
    END IF;

    -- Vincular al usuario en organization_members
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active, created_at, updated_at)
    VALUES (v_invitation.organization_id, v_user_id, v_invitation.role, TRUE, pg_catalog.now(), pg_catalog.now())
    ON CONFLICT (organization_id, user_id)
    DO UPDATE SET role = EXCLUDED.role, is_active = TRUE, updated_at = pg_catalog.now();

    -- Marcar invitación como reclamada
    UPDATE public.organization_invitations
    SET is_claimed = TRUE,
        claimed_by = v_user_id,
        claimed_at = pg_catalog.now()
    WHERE id = v_invitation.id;

    RETURN v_invitation.organization_id;
END;
$$;

-- 9.3 Limpiar tokens de invitación huérfanos generados automáticamente en LAVA CERÁMICA
-- (Asegura que LAVA no contenga tokens sin destinatario hasta que el dueño emita las invitaciones reales)
DELETE FROM public.organization_invitations
WHERE organization_id IN (SELECT id FROM public.organizations WHERE slug = 'lava-ceramica')
  AND invited_email IS NULL
  AND is_claimed = FALSE;
