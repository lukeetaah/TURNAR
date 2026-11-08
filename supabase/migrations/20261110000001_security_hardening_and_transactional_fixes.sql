-- =============================================================================
-- TURNAR - MIGRACIÓN 009: BLINDAJE DE SEGURIDAD, CONCURRENCIA REAL Y MULTI-TENANCY (REVISADA)
-- Creado por LUKSONARTS
-- =============================================================================

-- Extensiones criptográficas requeridas para hashing seguro de tokens
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- SECCIÓN 1: CANCELACIÓN SEGURA DE RESERVAS (TOKEN HASHEADO, INVALIDACIÓN Y AUTORIZACIÓN PREVIA)
-- =============================================================================

-- 1.1 Agregar columna para almacenar el hash del token de cancelación (SHA-256)
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS cancellation_token_hash TEXT;

-- Índice para búsqueda eficiente por hash de token solo para reservas activas
DROP INDEX IF EXISTS public.idx_bookings_cancel_token_hash;
CREATE INDEX idx_bookings_cancel_token_hash
ON public.bookings(cancellation_token_hash)
WHERE cancellation_token_hash IS NOT NULL AND status NOT IN ('cancelled');

-- 1.2 Procedimiento create_booking_atomic: genera token de 32 bytes y persiste SOLO su hash SHA-256
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
    p_organization_id UUID,
    p_session_id UUID,
    p_contact_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
    booking_id UUID,
    cancellation_token TEXT
)
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
    v_raw_token TEXT;
    v_token_hash TEXT;
BEGIN
    -- 1. Validar que el contacto pertenezca estrictamente a la organización
    SELECT user_id INTO v_contact_user_id
    FROM public.contacts
    WHERE id = p_contact_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El contacto no existe o no pertenece a esta organización.';
    END IF;

    -- 2. Validar autorización del emisor: staff o el propio usuario autenticado
    v_is_staff := public.has_org_role(p_organization_id, ARRAY['owner', 'admin', 'instructor']::public.organization_role[]);
    
    IF auth.uid() IS NOT NULL AND NOT v_is_staff THEN
        IF v_contact_user_id IS NOT NULL AND v_contact_user_id <> auth.uid() THEN
            RAISE EXCEPTION 'No tenés autorización para realizar reservas a nombre de otra persona.';
        END IF;
    END IF;

    -- 3. Bloquear la sesión con SELECT FOR UPDATE (anti sobreventa concurrente)
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

    -- 4. Validar cuota mensual con bloqueo pesimista en la fila de contadores
    v_period_id := public.get_or_create_current_usage_period(p_organization_id);

    SELECT uc.bookings_count, COALESCE((os.custom_limits_override->>'max_monthly_bookings')::INTEGER, p.max_monthly_bookings)
    INTO v_current_bookings_count, v_max_monthly_bookings
    FROM public.usage_counters uc
    JOIN public.organization_subscriptions os ON os.organization_id = p_organization_id
    JOIN public.plans p ON p.id = os.plan_id
    WHERE uc.organization_id = p_organization_id AND uc.period_id = v_period_id
    FOR UPDATE OF uc;

    IF v_current_bookings_count >= v_max_monthly_bookings THEN
        RAISE EXCEPTION 'Alcanzaste el límite mensual de reservas de tu plan (% de %). Consultá las opciones para ampliar tu capacidad.',
            v_current_bookings_count, v_max_monthly_bookings;
    END IF;

    -- 5. Generar token criptográfico (32 bytes = 256 bits de entropía) y calcular hash SHA-256
    v_raw_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

    -- 6. Insertar reserva activa (el token crudo jamás se almacena en la tabla)
    INSERT INTO public.bookings (
        organization_id,
        session_id,
        contact_id,
        status,
        notes,
        cancellation_token_hash,
        created_at,
        updated_at
    )
    VALUES (
        p_organization_id,
        p_session_id,
        p_contact_id,
        'confirmed',
        p_notes,
        v_token_hash,
        pg_catalog.now(),
        pg_catalog.now()
    )
    RETURNING id INTO v_booking_id;

    -- 7. Incrementar cupo en la sesión
    UPDATE public.activity_sessions
    SET booked_count = booked_count + 1,
        updated_at = pg_catalog.now()
    WHERE id = p_session_id;

    -- 8. Incrementar contador de uso mensual
    UPDATE public.usage_counters
    SET bookings_count = bookings_count + 1,
        updated_at = pg_catalog.now()
    WHERE organization_id = p_organization_id AND period_id = v_period_id;

    -- Retornar el booking_id y el token en texto plano UNA ÚNICA VEZ al llamador
    RETURN QUERY SELECT v_booking_id, v_raw_token;
END;
$$;

-- 1.3 Procedimiento cancel_booking_atomic: AUTORIZACIÓN PREVIA, INVALIDACIÓN DE TOKEN Y BLINDAJE
CREATE OR REPLACE FUNCTION public.cancel_booking_atomic(
    p_organization_id UUID,
    p_booking_id UUID,
    p_cancellation_token TEXT DEFAULT NULL,
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
    v_contact_user_id UUID;
    v_stored_token_hash TEXT;
    v_is_staff BOOLEAN;
    v_is_authorized BOOLEAN := FALSE;
    v_session_start TIMESTAMPTZ;
    v_notice_hours INTEGER;
BEGIN
    -- 1. Bloquear la reserva para evitar concurrencia en cancelaciones
    SELECT b.session_id, b.status, b.cancellation_token_hash, c.user_id, s.start_time
    INTO v_session_id, v_status, v_stored_token_hash, v_contact_user_id, v_session_start
    FROM public.bookings b
    JOIN public.contacts c ON c.id = b.contact_id
    JOIN public.activity_sessions s ON s.id = b.session_id
    WHERE b.id = p_booking_id AND b.organization_id = p_organization_id
    FOR UPDATE OF b;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La reserva no existe en esta organización.';
    END IF;

    -- 2. EVALUAR AUTORIZACIÓN ANTES DE CUALQUIER RETORNO O VERIFICACIÓN DE ESTADO
    -- Esto impide que un atacante anónimo adivine UUIDs o infiera si una reserva está cancelada.
    v_is_staff := public.has_org_role(p_organization_id, ARRAY['owner', 'admin', 'instructor']::public.organization_role[]);

    IF v_is_staff THEN
        v_is_authorized := TRUE;
    ELSIF auth.uid() IS NOT NULL AND v_contact_user_id = auth.uid() THEN
        v_is_authorized := TRUE;
    ELSIF p_cancellation_token IS NOT NULL AND v_stored_token_hash IS NOT NULL THEN
        -- Validar hash SHA-256 en tiempo constante
        IF encode(digest(p_cancellation_token, 'sha256'), 'hex') = v_stored_token_hash THEN
            v_is_authorized := TRUE;
        ELSE
            RAISE EXCEPTION 'El token de cancelación provisto no es válido.';
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'No tenés permisos para cancelar esta reserva. Se requiere sesión de usuario o un token de cancelación válido.';
    END IF;

    -- 3. Idempotencia: una vez validada la autorización, si ya estaba cancelada retornar TRUE sin decrementar de más
    IF v_status = 'cancelled' THEN
        RETURN TRUE;
    END IF;

    -- 4. Verificar plazo de anticipación de la organización (salvo excepciones para staff)
    IF NOT v_is_staff THEN
        SELECT cancellation_notice_hours INTO v_notice_hours
        FROM public.organization_settings
        WHERE organization_id = p_organization_id;

        IF v_notice_hours IS NOT NULL AND v_session_start < (pg_catalog.now() + (v_notice_hours || ' hours')::INTERVAL) THEN
            RAISE EXCEPTION 'No es posible cancelar la reserva: el plazo límite de anticipación (% horas) ha vencido.', v_notice_hours;
        END IF;
    END IF;

    -- 5. Cancelar la reserva e INVALIDAR el token hasheado (destrucción de token de un solo uso)
    UPDATE public.bookings
    SET status = 'cancelled',
        cancellation_reason = p_reason,
        cancellation_token_hash = NULL, -- Invalidación inmediata: no puede reutilizarse
        cancelled_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_booking_id;

    -- 6. Liberar cupo en la sesión exactamente una vez
    UPDATE public.activity_sessions
    SET booked_count = GREATEST(0, booked_count - 1),
        updated_at = pg_catalog.now()
    WHERE id = v_session_id;

    -- 7. Registrar auditoría inmutable
    INSERT INTO public.audit_logs (organization_id, performed_by, action, entity_name, entity_id, metadata)
    VALUES (
        p_organization_id,
        auth.uid(),
        'cancel_booking',
        'bookings',
        p_booking_id,
        jsonb_build_object(
            'reason', p_reason,
            'session_id', v_session_id,
            'cancelled_via_token', (NOT v_is_staff AND auth.uid() IS NULL)
        )
    );

    RETURN TRUE;
END;
$$;

-- =============================================================================
-- SECCIÓN 2: CONTROL DE CONCURRENCIA REAL EN LÍMITES DE PLANES (INSERT Y UPDATE)
-- =============================================================================

-- 2.1 Bloqueo pesimista en creación de organizaciones gratuitas por propietario
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
    v_valid_timezone TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debés iniciar sesión para crear una organización.';
    END IF;

    -- 1. Bloqueo transaccional por fila a nivel del perfil del usuario (anti creación paralela)
    PERFORM 1 FROM public.profiles WHERE id = v_user_id FOR UPDATE;

    -- 2. Validar que la zona horaria exista en el catálogo de PostgreSQL
    IF EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
        v_valid_timezone := p_timezone;
    ELSE
        v_valid_timezone := 'America/Argentina/Buenos_Aires';
    END IF;

    -- 3. Obtener plan gratuito base
    SELECT id, max_organizations INTO v_free_plan_id, v_max_orgs
    FROM public.plans
    WHERE code = 'free';

    IF v_free_plan_id IS NULL THEN
        RAISE EXCEPTION 'El plan base no se encuentra configurado en el sistema.';
    END IF;

    -- 4. Contar organizaciones gratuitas activas del usuario
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

    -- 5. Crear la organización
    INSERT INTO public.organizations (name, slug, description, activity_category, is_active, is_custom_setup)
    VALUES (p_name, p_slug, p_description, p_activity_category, TRUE, FALSE)
    RETURNING id INTO v_org_id;

    -- 6. Crear settings con la zona horaria validada
    INSERT INTO public.organization_settings (organization_id, timezone, cancellation_notice_hours, allow_waitlist, auto_confirm_bookings)
    VALUES (v_org_id, v_valid_timezone, 24, TRUE, TRUE);

    -- 7. Habilitar módulos del núcleo
    INSERT INTO public.organization_modules (organization_id, module_key, is_enabled)
    VALUES
        (v_org_id, 'activities', TRUE),
        (v_org_id, 'instructors', TRUE),
        (v_org_id, 'agenda', TRUE),
        (v_org_id, 'bookings', TRUE),
        (v_org_id, 'clients', TRUE);

    -- 8. Asignar suscripción al plan gratuito
    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status)
    VALUES (v_org_id, v_free_plan_id, 'active');

    -- 9. Vincular al usuario como 'owner'
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (v_org_id, v_user_id, 'owner', TRUE);

    -- 10. Inicializar período de consumo inicial
    PERFORM public.get_or_create_current_usage_period(v_org_id);

    RETURN v_org_id;
END;
$$;

-- 2.2 Triggers de límites con bloqueo por fila en la organización y soporte completo para INSERT y UPDATE

-- A) Control de límite de Staff (contempla reactivaciones y cambios de rol)
CREATE OR REPLACE FUNCTION public.check_staff_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_staff INTEGER;
    v_max_staff INTEGER;
    v_target_org_id UUID;
BEGIN
    v_target_org_id := NEW.organization_id;

    -- Verificar si se convierte en staff activo o si cambia a una nueva organización
    IF (NEW.role IN ('owner', 'admin', 'instructor') AND NEW.is_active = TRUE) THEN
        -- Si es un UPDATE y no cambió su rol ni su estado activo ni su organización, no hay incremento de cupo
        IF TG_OP = 'UPDATE' THEN
            IF OLD.role IN ('owner', 'admin', 'instructor') AND OLD.is_active = TRUE AND OLD.organization_id = NEW.organization_id THEN
                RETURN NEW;
            END IF;
        END IF;

        -- Bloquear fila de la organización para serializar transacciones concurrentes
        PERFORM 1 FROM public.organizations WHERE id = v_target_org_id FOR UPDATE;

        SELECT COUNT(*), COALESCE((os.custom_limits_override->>'max_staff')::INTEGER, p.max_staff)
        INTO v_current_staff, v_max_staff
        FROM public.organization_members om
        JOIN public.organization_subscriptions os ON os.organization_id = v_target_org_id
        JOIN public.plans p ON p.id = os.plan_id
        WHERE om.organization_id = v_target_org_id
          AND om.role IN ('owner', 'admin', 'instructor')
          AND om.is_active = TRUE
          AND (TG_OP = 'INSERT' OR om.id <> NEW.id)
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

-- B) Control de límite de Contactos (contempla reactivaciones y cambios de organización)
CREATE OR REPLACE FUNCTION public.check_contacts_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_contacts INTEGER;
    v_max_contacts INTEGER;
    v_target_org_id UUID;
BEGIN
    v_target_org_id := NEW.organization_id;

    IF TG_OP = 'UPDATE' THEN
        -- Si no cambió de organización, no afecta el conteo
        IF OLD.organization_id = NEW.organization_id THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Bloquear fila de la organización para serializar transacciones concurrentes
    PERFORM 1 FROM public.organizations WHERE id = v_target_org_id FOR UPDATE;

    SELECT COUNT(*), COALESCE((os.custom_limits_override->>'max_active_contacts')::INTEGER, p.max_active_contacts)
    INTO v_current_contacts, v_max_contacts
    FROM public.contacts c
    JOIN public.organization_subscriptions os ON os.organization_id = v_target_org_id
    JOIN public.plans p ON p.id = os.plan_id
    WHERE c.organization_id = v_target_org_id
      AND (TG_OP = 'INSERT' OR c.id <> NEW.id)
    GROUP BY os.custom_limits_override, p.max_active_contacts;

    IF v_current_contacts >= v_max_contacts THEN
        RAISE EXCEPTION 'Alcanzaste el límite de alumnos y clientes activos de tu plan (máximo % contactos).', v_max_contacts;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_contacts_limit ON public.contacts;
CREATE TRIGGER trg_check_contacts_limit
    BEFORE INSERT OR UPDATE ON public.contacts
    FOR EACH ROW EXECUTE FUNCTION public.check_contacts_limit();

-- C) Control de límite de Actividades Activas (contempla reactivaciones de actividades pausadas)
CREATE OR REPLACE FUNCTION public.check_activities_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_activities INTEGER;
    v_max_activities INTEGER;
    v_target_org_id UUID;
BEGIN
    v_target_org_id := NEW.organization_id;

    IF NEW.is_active = TRUE THEN
        IF TG_OP = 'UPDATE' THEN
            IF OLD.is_active = TRUE AND OLD.organization_id = NEW.organization_id THEN
                RETURN NEW;
            END IF;
        END IF;

        -- Bloquear fila de la organización para serializar transacciones concurrentes
        PERFORM 1 FROM public.organizations WHERE id = v_target_org_id FOR UPDATE;

        SELECT COUNT(*), COALESCE((os.custom_limits_override->>'max_active_activities')::INTEGER, p.max_active_activities)
        INTO v_current_activities, v_max_activities
        FROM public.activities a
        JOIN public.organization_subscriptions os ON os.organization_id = v_target_org_id
        JOIN public.plans p ON p.id = os.plan_id
        WHERE a.organization_id = v_target_org_id
          AND a.is_active = TRUE
          AND (TG_OP = 'INSERT' OR a.id <> NEW.id)
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
-- SECCIÓN 3: NOTIFICACIONES, ENCOLADO SEGURO Y CÓMPUTO REAL DE ENVÍOS
-- =============================================================================

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
    v_is_staff BOOLEAN;
BEGIN
    -- 1. Autorización: solo personal administrativo autenticado de esa organización o admin de plataforma
    v_is_staff := public.has_org_role(p_organization_id, ARRAY['owner', 'admin']::public.organization_role[]);

    IF NOT v_is_staff AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'No tenés permisos para encolar notificaciones en esta organización.';
    END IF;

    -- 2. Validar cuota mensual del período
    v_period_id := public.get_or_create_current_usage_period(p_organization_id);

    SELECT uc.emails_sent_count, COALESCE((os.custom_limits_override->>'max_monthly_emails')::INTEGER, p.max_monthly_emails)
    INTO v_current_emails, v_max_monthly_emails
    FROM public.usage_counters uc
    JOIN public.organization_subscriptions os ON os.organization_id = p_organization_id
    JOIN public.plans p ON p.id = os.plan_id
    WHERE uc.organization_id = p_organization_id AND uc.period_id = v_period_id
    FOR UPDATE OF uc;

    IF v_current_emails >= v_max_monthly_emails THEN
        RAISE EXCEPTION 'Alcanzaste el límite mensual de correos transaccionales de tu plan (% de %).',
            v_current_emails, v_max_monthly_emails;
    END IF;

    -- 3. Encolar notificación con estado 'pending' (idempotencia por organización)
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

    -- El contador emails_sent_count NO se incrementa aquí.
    -- Se incrementará estrictamente en record_notification_sent tras la confirmación del proveedor.
    RETURN v_outbox_id;
END;
$$;

-- Procedimiento para registrar envío confirmado (invocado exclusivamente por Edge Function con service_role)
CREATE OR REPLACE FUNCTION public.record_notification_sent(
    p_organization_id UUID,
    p_outbox_id UUID,
    p_recipient_email TEXT,
    p_event_type public.notification_event_type,
    p_provider TEXT,
    p_provider_message_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_log_id UUID;
    v_period_id UUID;
    v_outbox_status public.notification_status;
    v_outbox_org_id UUID;
BEGIN
    -- 1. Bloquear y validar la fila de outbox
    SELECT status, organization_id
    INTO v_outbox_status, v_outbox_org_id
    FROM public.notification_outbox
    WHERE id = p_outbox_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La notificación con ID % no existe en la cola de salida.', p_outbox_id;
    END IF;

    -- Validar que la organización coincida estrictamente
    IF v_outbox_org_id <> p_organization_id THEN
        RAISE EXCEPTION 'Discrepancia de organización: la notificación pertenece a otra entidad.';
    END IF;

    -- IDEMPOTENCIA: Si ya fue procesada como 'sent', retornar el log existente sin volver a incrementar cuotas
    IF v_outbox_status = 'sent' THEN
        SELECT id INTO v_log_id
        FROM public.notification_logs
        WHERE outbox_id = p_outbox_id
        LIMIT 1;
        
        RETURN v_log_id;
    END IF;

    -- 2. Insertar registro inmutable de envío
    INSERT INTO public.notification_logs (
        organization_id,
        outbox_id,
        recipient_email,
        event_type,
        provider,
        provider_message_id,
        status,
        sent_at
    ) VALUES (
        p_organization_id,
        p_outbox_id,
        p_recipient_email,
        p_event_type,
        p_provider,
        p_provider_message_id,
        'sent',
        pg_catalog.now()
    ) RETURNING id INTO v_log_id;

    -- 3. Marcar outbox como enviado
    UPDATE public.notification_outbox
    SET status = 'sent',
        processed_at = pg_catalog.now()
    WHERE id = p_outbox_id;

    -- 4. Incrementar contador de emails efectivamente enviados
    v_period_id := public.get_or_create_current_usage_period(p_organization_id);

    UPDATE public.usage_counters
    SET emails_sent_count = emails_sent_count + 1,
        updated_at = pg_catalog.now()
    WHERE organization_id = p_organization_id AND period_id = v_period_id;

    RETURN v_log_id;
END;
$$;

-- =============================================================================
-- SECCIÓN 4: INTEGRIDAD MULTI-TENANT COMPUESTA Y PREVENCIÓN DE CONFLICTOS ON DELETE
-- =============================================================================

-- 4.1 instructor_availability: organización y FK compuesta
ALTER TABLE public.instructor_availability
ADD COLUMN IF NOT EXISTS organization_id UUID;

UPDATE public.instructor_availability a
SET organization_id = i.organization_id
FROM public.instructors i
WHERE a.instructor_id = i.id AND a.organization_id IS NULL;

ALTER TABLE public.instructor_availability
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.instructor_availability
DROP CONSTRAINT IF EXISTS fk_inst_avail_instructor_org;

ALTER TABLE public.instructor_availability
ADD CONSTRAINT fk_inst_avail_instructor_org
FOREIGN KEY (organization_id, instructor_id)
REFERENCES public.instructors(organization_id, id) ON DELETE CASCADE;

-- 4.2 availability_exceptions: organización y FK compuesta
ALTER TABLE public.availability_exceptions
ADD COLUMN IF NOT EXISTS organization_id UUID;

UPDATE public.availability_exceptions e
SET organization_id = i.organization_id
FROM public.instructors i
WHERE e.instructor_id = i.id AND e.organization_id IS NULL;

ALTER TABLE public.availability_exceptions
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.availability_exceptions
DROP CONSTRAINT IF EXISTS fk_avail_exceptions_instructor_org;

ALTER TABLE public.availability_exceptions
ADD CONSTRAINT fk_avail_exceptions_instructor_org
FOREIGN KEY (organization_id, instructor_id)
REFERENCES public.instructors(organization_id, id) ON DELETE CASCADE;

-- 4.3 activity_sessions: SOLUCIÓN CANÓNICA PARA INSTRUCTOR NULLABLE
-- En Postgres, una FK compuesta (organization_id, instructor_id) con ON DELETE SET NULL
-- intenta poner a NULL el organization_id (que es NOT NULL).
-- La solución correcta es ON DELETE RESTRICT o trigger de desasignación limpia antes del borrado.
CREATE OR REPLACE FUNCTION public.handle_instructor_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.activity_sessions
    SET instructor_id = NULL
    WHERE organization_id = OLD.organization_id AND instructor_id = OLD.id;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_instructor_deletion ON public.instructors;
CREATE TRIGGER trg_instructor_deletion
    BEFORE DELETE ON public.instructors
    FOR EACH ROW EXECUTE FUNCTION public.handle_instructor_deletion();

ALTER TABLE public.activity_sessions
DROP CONSTRAINT IF EXISTS fk_sessions_instructor_org;

ALTER TABLE public.activity_sessions
ADD CONSTRAINT fk_sessions_instructor_org
FOREIGN KEY (organization_id, instructor_id)
REFERENCES public.instructors(organization_id, id) ON DELETE NO ACTION;

-- 4.4 waitlists: forzar que session y contact pertenezcan a la misma organización
ALTER TABLE public.waitlists
ADD COLUMN IF NOT EXISTS organization_id UUID;

UPDATE public.waitlists w
SET organization_id = s.organization_id
FROM public.activity_sessions s
WHERE w.session_id = s.id AND w.organization_id IS NULL;

ALTER TABLE public.waitlists
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.waitlists
DROP CONSTRAINT IF EXISTS fk_waitlists_contact_org;

ALTER TABLE public.waitlists
ADD CONSTRAINT fk_waitlists_contact_org
FOREIGN KEY (organization_id, contact_id)
REFERENCES public.contacts(organization_id, id) ON DELETE CASCADE;

-- 4.5 attendance: forzar coherencia multi-tenant
ALTER TABLE public.attendance
ADD COLUMN IF NOT EXISTS organization_id UUID;

UPDATE public.attendance a
SET organization_id = b.organization_id
FROM public.bookings b
WHERE a.booking_id = b.id AND a.organization_id IS NULL;

ALTER TABLE public.attendance
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.attendance
DROP CONSTRAINT IF EXISTS fk_attendance_contact_org;

ALTER TABLE public.attendance
ADD CONSTRAINT fk_attendance_contact_org
FOREIGN KEY (organization_id, contact_id)
REFERENCES public.contacts(organization_id, id) ON DELETE RESTRICT;

-- 4.6 guardians: vincular a organización
ALTER TABLE public.guardians
ADD COLUMN IF NOT EXISTS organization_id UUID;

UPDATE public.guardians g
SET organization_id = c.organization_id
FROM public.contacts c
WHERE g.contact_id = c.id AND g.organization_id IS NULL;

ALTER TABLE public.guardians
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.guardians
DROP CONSTRAINT IF EXISTS fk_guardians_contact_org;

ALTER TABLE public.guardians
ADD CONSTRAINT fk_guardians_contact_org
FOREIGN KEY (organization_id, contact_id)
REFERENCES public.contacts(organization_id, id) ON DELETE CASCADE;

-- =============================================================================
-- SECCIÓN 5: VERIFICACIÓN Y AUDITORÍA DE PAGOS MANUALES
-- =============================================================================

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
DECLARE
    v_old_status public.payment_status;
    v_amount_cents BIGINT;
    v_contact_id UUID;
BEGIN
    -- 1. Validar autorización estricta: solo owner o admin de esa organización
    IF NOT public.has_org_role(p_organization_id, ARRAY['owner', 'admin']::public.organization_role[])
       AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Solo administradores pueden verificar pagos de esta organización.';
    END IF;

    -- 2. Bloquear y validar pago
    SELECT status, amount_cents, contact_id
    INTO v_old_status, v_amount_cents, v_contact_id
    FROM public.payments
    WHERE id = p_payment_id AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pago no existe en esta organización.';
    END IF;

    -- 3. Máquina de estados: controlar transiciones válidas
    IF v_old_status = p_new_status THEN
        RETURN TRUE; -- Idempotente
    END IF;

    IF v_old_status = 'verified' AND p_new_status = 'rejected' THEN
        IF p_verification_notes IS NULL OR TRIM(p_verification_notes) = '' THEN
            RAISE EXCEPTION 'Para rechazar un pago previamente verificado se debe indicar un motivo de anulación.';
        END IF;
    END IF;

    -- 4. Actualizar estado y auditoría
    UPDATE public.payments
    SET status = p_new_status,
        verified_at = pg_catalog.now(),
        verified_by = auth.uid(),
        notes = CASE
            WHEN p_verification_notes IS NOT NULL THEN COALESCE(notes || E'\n', '') || 'Estado: ' || p_new_status || ' | Motivo: ' || p_verification_notes
            ELSE notes
        END,
        updated_at = pg_catalog.now()
    WHERE id = p_payment_id;

    -- 5. Registro inmutable en audit_logs
    INSERT INTO public.audit_logs (
        organization_id,
        performed_by,
        action,
        entity_name,
        entity_id,
        metadata
    ) VALUES (
        p_organization_id,
        auth.uid(),
        'verify_payment',
        'payments',
        p_payment_id,
        jsonb_build_object(
            'old_status', v_old_status,
            'new_status', p_new_status,
            'amount_cents', v_amount_cents,
            'contact_id', v_contact_id,
            'notes', p_verification_notes
        )
    );

    RETURN TRUE;
END;
$$;

-- =============================================================================
-- SECCIÓN 6: PROTECCIÓN DE DATOS PÚBLICOS MEDIANTE VISTAS SEGURAS (SECURITY INVOKER)
-- =============================================================================

-- Vistas públicas que exponen únicamente las columnas públicas requeridas
CREATE OR REPLACE VIEW public.public_instructors
WITH (security_invoker = true)
AS
SELECT id, organization_id, full_name, bio, color_code, is_active
FROM public.instructors
WHERE is_active = TRUE;

CREATE OR REPLACE VIEW public.public_activities
WITH (security_invoker = true)
AS
SELECT id, organization_id, name, description, category, duration_minutes, default_capacity, price_cents, min_age, max_age, modality, is_active, is_public
FROM public.activities
WHERE is_active = TRUE AND is_public = TRUE;

CREATE OR REPLACE VIEW public.public_activity_sessions
WITH (security_invoker = true)
AS
SELECT id, organization_id, activity_id, instructor_id, start_time, end_time, capacity, booked_count, status
FROM public.activity_sessions
WHERE status = 'scheduled';

CREATE OR REPLACE VIEW public.public_announcements
WITH (security_invoker = true)
AS
SELECT id, organization_id, title, content, published_at
FROM public.announcements
WHERE is_published = TRUE;

CREATE OR REPLACE VIEW public.public_events
WITH (security_invoker = true)
AS
SELECT id, organization_id, title, description, location, start_time, end_time, capacity, price_cents
FROM public.events
WHERE is_public = TRUE;

-- Revocar SELECT sobre tablas privadas a anon
REVOKE SELECT ON public.instructors FROM anon;
REVOKE SELECT ON public.contacts FROM anon;
REVOKE SELECT ON public.guardians FROM anon;
REVOKE SELECT ON public.bookings FROM anon;
REVOKE SELECT ON public.payments FROM anon;
REVOKE SELECT ON public.usage_counters FROM anon;
REVOKE SELECT ON public.usage_periods FROM anon;
REVOKE SELECT ON public.organization_invitations FROM anon;
REVOKE SELECT ON public.audit_logs FROM anon;
REVOKE SELECT ON public.notification_outbox FROM anon;
REVOKE SELECT ON public.notification_logs FROM anon;

-- Conceder SELECT a las vistas públicas para anon y authenticated
GRANT SELECT ON public.public_instructors TO anon, authenticated;
GRANT SELECT ON public.public_activities TO anon, authenticated;
GRANT SELECT ON public.public_activity_sessions TO anon, authenticated;
GRANT SELECT ON public.public_announcements TO anon, authenticated;
GRANT SELECT ON public.public_events TO anon, authenticated;

-- =============================================================================
-- SECCIÓN 7: CORRECCIÓN DE RECLAMO DE INVITACIONES
-- =============================================================================

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
    v_existing_role public.organization_role;
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

    -- Validación estricta: si la invitación está dirigida a un correo, debe coincidir exactamente
    IF v_invitation.invited_email IS NOT NULL THEN
        IF v_user_email IS NULL OR LOWER(v_invitation.invited_email) <> LOWER(v_user_email) THEN
            RAISE EXCEPTION 'Esta invitación está dirigida exclusivamente a %.', v_invitation.invited_email;
        END IF;
    END IF;

    -- Verificar rol existente: no permitir que un owner sea degradado por una invitación ni auto-elevarse
    SELECT role INTO v_existing_role
    FROM public.organization_members
    WHERE organization_id = v_invitation.organization_id AND user_id = v_user_id;

    IF v_existing_role = 'owner' AND v_invitation.role <> 'owner' THEN
        RAISE EXCEPTION 'Ya sos el propietario de esta organización.';
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

-- =============================================================================
-- SECCIÓN 8: MATRIZ DE REVOCACIÓN Y CONCESIÓN EXPLÍCITA DE PERMISOS (GRANTs FUNCIÓN POR FUNCIÓN)
-- =============================================================================

-- Revocar explícitamente permisos previos función por función con su firma de tipos completa
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.has_org_role(UUID, public.organization_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_org_role(UUID, public.organization_role[]) TO authenticated;

REVOKE ALL ON FUNCTION public.is_org_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.create_organization_with_owner(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.claim_organization_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_organization_invitation(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.verify_payment_manual(UUID, UUID, public.payment_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_payment_manual(UUID, UUID, public.payment_status, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.create_booking_atomic(UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking_atomic(UUID, UUID, UUID, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.cancel_booking_atomic(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_booking_atomic(UUID, UUID, TEXT, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_or_create_current_usage_period(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_notification(UUID, public.notification_event_type, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_notification(UUID, public.notification_event_type, TEXT, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.record_notification_sent(UUID, UUID, TEXT, public.notification_event_type, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
