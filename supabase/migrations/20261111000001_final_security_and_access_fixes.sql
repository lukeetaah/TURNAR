-- =============================================================================
-- TURNAR - MIGRACIÓN 010: BLINDAJE FINAL DE ACCESO, PERMISOS, LÍMITES Y VISTAS PÚBLICAS
-- Creado por LUKSONARTS
-- =============================================================================

-- =============================================================================
-- SECCIÓN 1: VISTAS PÚBLICAS SEGURAS (SECURITY DEFINER / SECURITY_INVOKER = FALSE)
-- =============================================================================
-- ANÁLISIS TÉCNICO DE SEGURIDAD:
-- En PostgreSQL 15+, las vistas con 'security_invoker = true' evalúan permisos sobre
-- las tablas subyacentes con la identidad del llamador ('anon'). Dado que por principio
-- de mínima exposición se revoca SELECT sobre tablas privadas (instructors, activities, etc.),
-- una vista invoker falla con 'permission denied'.
-- La solución canónica y segura es definir vistas con 'security_invoker = false' (comportamiento
-- estándar de vistas en Postgres, equivalente a security definer).
-- Requisitos estrictos de seguridad garantizados:
-- 1. El propietario de las vistas es 'postgres' (rol de migración del sistema).
-- 2. Solo se proyectan columnas públicas esenciales (whitelist explícita). Jamás se exponen
--    user_id, correos privados, teléfonos, identificadores internos de menores ni metadatos de administración.
-- 3. Los filtros de publicación activa están incorporados directamente en la consulta de la vista
--    (is_active = true, is_public = true, status = 'scheduled', organizaciones activas).
-- 4. El aislamiento multi-tenant se preserva: la columna organization_id se expone para
--    filtrar portales públicos por organización, pero no se expone ninguna entidad privada.
-- 5. Las tablas subyacentes privadas continúan con SELECT estrictamente REVOCADO para 'anon'.

CREATE OR REPLACE VIEW public.public_instructors
WITH (security_invoker = false)
AS
SELECT
    i.id,
    i.organization_id,
    i.full_name,
    i.bio,
    i.color_code,
    i.is_active
FROM public.instructors i
JOIN public.organizations o ON o.id = i.organization_id
WHERE i.is_active = TRUE
  AND o.is_active = TRUE;

CREATE OR REPLACE VIEW public.public_activities
WITH (security_invoker = false)
AS
SELECT
    a.id,
    a.organization_id,
    a.name,
    a.description,
    a.category,
    a.duration_minutes,
    a.default_capacity,
    a.price_cents,
    a.min_age,
    a.max_age,
    a.modality,
    a.is_active,
    a.is_public
FROM public.activities a
JOIN public.organizations o ON o.id = a.organization_id
WHERE a.is_active = TRUE
  AND a.is_public = TRUE
  AND o.is_active = TRUE;

CREATE OR REPLACE VIEW public.public_activity_sessions
WITH (security_invoker = false)
AS
SELECT
    s.id,
    s.organization_id,
    s.activity_id,
    s.instructor_id,
    s.start_time,
    s.end_time,
    s.capacity,
    s.booked_count,
    s.status
FROM public.activity_sessions s
JOIN public.activities a ON a.id = s.activity_id
JOIN public.organizations o ON o.id = s.organization_id
WHERE s.status = 'scheduled'
  AND a.is_active = TRUE
  AND a.is_public = TRUE
  AND o.is_active = TRUE;

CREATE OR REPLACE VIEW public.public_announcements
WITH (security_invoker = false)
AS
SELECT
    ann.id,
    ann.organization_id,
    ann.title,
    ann.content,
    ann.published_at
FROM public.announcements ann
JOIN public.organizations o ON o.id = ann.organization_id
WHERE ann.is_published = TRUE
  AND o.is_active = TRUE;

CREATE OR REPLACE VIEW public.public_events
WITH (security_invoker = false)
AS
SELECT
    e.id,
    e.organization_id,
    e.title,
    e.description,
    e.location,
    e.start_time,
    e.end_time,
    e.capacity,
    e.price_cents
FROM public.events e
JOIN public.organizations o ON o.id = e.organization_id
WHERE e.is_public = TRUE
  AND o.is_active = TRUE;

-- Revocación de tablas privadas sobre rol anon
REVOKE ALL ON public.instructors FROM anon;
REVOKE ALL ON public.contacts FROM anon;
REVOKE ALL ON public.guardians FROM anon;
REVOKE ALL ON public.bookings FROM anon;
REVOKE ALL ON public.payments FROM anon;
REVOKE ALL ON public.usage_counters FROM anon;
REVOKE ALL ON public.usage_periods FROM anon;
REVOKE ALL ON public.organization_invitations FROM anon;
REVOKE ALL ON public.audit_logs FROM anon;
REVOKE ALL ON public.notification_outbox FROM anon;
REVOKE ALL ON public.notification_logs FROM anon;

-- Concesión de lectura sobre vistas públicas
GRANT SELECT ON public.public_instructors TO anon, authenticated;
GRANT SELECT ON public.public_activities TO anon, authenticated;
GRANT SELECT ON public.public_activity_sessions TO anon, authenticated;
GRANT SELECT ON public.public_announcements TO anon, authenticated;
GRANT SELECT ON public.public_events TO anon, authenticated;

-- =============================================================================
-- SECCIÓN 2: LÍMITES DE CONTACTOS Y RECURSOS (SOPORTE PARA ACTIVOS Y REACTIVACIONES)
-- =============================================================================

-- 2.1 Agregar columna is_active a contacts para distinguir activos de históricos/archivados
ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_contacts_org_active
ON public.contacts(organization_id)
WHERE is_active = TRUE;

-- 2.2 Trigger resiliente para contactos: cubre INSERT, reactivación (UPDATE is_active) y cambio de organización
CREATE OR REPLACE FUNCTION public.check_contacts_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_contacts INTEGER := 0;
    v_max_contacts INTEGER;
    v_target_org_id UUID;
    v_needs_check BOOLEAN := FALSE;
BEGIN
    v_target_org_id := NEW.organization_id;

    IF TG_OP = 'INSERT' THEN
        IF NEW.is_active = TRUE THEN
            v_needs_check := TRUE;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Verificar si se activa o si cambia a una nueva organización estando activo
        IF NEW.is_active = TRUE AND (OLD.is_active = FALSE OR OLD.organization_id <> NEW.organization_id) THEN
            v_needs_check := TRUE;
        END IF;
    END IF;

    IF v_needs_check THEN
        -- Bloqueo pesimista para evitar condiciones de carrera entre transacciones paralelas
        PERFORM 1 FROM public.organizations WHERE id = v_target_org_id FOR UPDATE;

        -- Obtener límite configurado (sin GROUP BY para evitar retorno nulo si la tabla está vacía)
        SELECT COALESCE((os.custom_limits_override->>'max_active_contacts')::INTEGER, p.max_active_contacts)
        INTO v_max_contacts
        FROM public.organization_subscriptions os
        JOIN public.plans p ON p.id = os.plan_id
        WHERE os.organization_id = v_target_org_id AND os.status = 'active';

        IF v_max_contacts IS NULL THEN
            SELECT max_active_contacts INTO v_max_contacts FROM public.plans WHERE code = 'free';
        END IF;

        -- Conteo estricto de contactos activos
        SELECT COUNT(*)
        INTO v_current_contacts
        FROM public.contacts
        WHERE organization_id = v_target_org_id
          AND is_active = TRUE
          AND (TG_OP = 'INSERT' OR id <> NEW.id);

        IF v_current_contacts >= v_max_contacts THEN
            RAISE EXCEPTION 'Alcanzaste el límite de alumnos y clientes activos de tu plan (máximo % contactos).', v_max_contacts;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_contacts_limit ON public.contacts;
CREATE TRIGGER trg_check_contacts_limit
    BEFORE INSERT OR UPDATE ON public.contacts
    FOR EACH ROW EXECUTE FUNCTION public.check_contacts_limit();

-- 2.3 Trigger resiliente para Staff: cubre INSERT, cambios de rol de client a staff, reactivaciones y cambios de organización
CREATE OR REPLACE FUNCTION public.check_staff_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_staff INTEGER := 0;
    v_max_staff INTEGER;
    v_target_org_id UUID;
    v_needs_check BOOLEAN := FALSE;
BEGIN
    v_target_org_id := NEW.organization_id;

    IF NEW.role IN ('owner', 'admin', 'instructor') AND NEW.is_active = TRUE THEN
        IF TG_OP = 'INSERT' THEN
            v_needs_check := TRUE;
        ELSIF TG_OP = 'UPDATE' THEN
            IF OLD.role NOT IN ('owner', 'admin', 'instructor')
               OR OLD.is_active = FALSE
               OR OLD.organization_id <> NEW.organization_id THEN
                v_needs_check := TRUE;
            END IF;
        END IF;
    END IF;

    IF v_needs_check THEN
        PERFORM 1 FROM public.organizations WHERE id = v_target_org_id FOR UPDATE;

        SELECT COALESCE((os.custom_limits_override->>'max_staff')::INTEGER, p.max_staff)
        INTO v_max_staff
        FROM public.organization_subscriptions os
        JOIN public.plans p ON p.id = os.plan_id
        WHERE os.organization_id = v_target_org_id AND os.status = 'active';

        IF v_max_staff IS NULL THEN
            SELECT max_staff INTO v_max_staff FROM public.plans WHERE code = 'free';
        END IF;

        SELECT COUNT(*)
        INTO v_current_staff
        FROM public.organization_members
        WHERE organization_id = v_target_org_id
          AND role IN ('owner', 'admin', 'instructor')
          AND is_active = TRUE
          AND (TG_OP = 'INSERT' OR id <> NEW.id);

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

-- 2.4 Trigger resiliente para Actividades: cubre INSERT, reactivaciones y cambio de organización
CREATE OR REPLACE FUNCTION public.check_activities_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_activities INTEGER := 0;
    v_max_activities INTEGER;
    v_target_org_id UUID;
    v_needs_check BOOLEAN := FALSE;
BEGIN
    v_target_org_id := NEW.organization_id;

    IF NEW.is_active = TRUE THEN
        IF TG_OP = 'INSERT' THEN
            v_needs_check := TRUE;
        ELSIF TG_OP = 'UPDATE' THEN
            IF OLD.is_active = FALSE OR OLD.organization_id <> NEW.organization_id THEN
                v_needs_check := TRUE;
            END IF;
        END IF;
    END IF;

    IF v_needs_check THEN
        PERFORM 1 FROM public.organizations WHERE id = v_target_org_id FOR UPDATE;

        SELECT COALESCE((os.custom_limits_override->>'max_active_activities')::INTEGER, p.max_active_activities)
        INTO v_max_activities
        FROM public.organization_subscriptions os
        JOIN public.plans p ON p.id = os.plan_id
        WHERE os.organization_id = v_target_org_id AND os.status = 'active';

        IF v_max_activities IS NULL THEN
            SELECT max_active_activities INTO v_max_activities FROM public.plans WHERE code = 'free';
        END IF;

        SELECT COUNT(*)
        INTO v_current_activities
        FROM public.activities
        WHERE organization_id = v_target_org_id
          AND is_active = TRUE
          AND (TG_OP = 'INSERT' OR id <> NEW.id);

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
    -- 1. Exigir usuario autenticado obligatoriamente
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Se requiere una sesión autenticada para encolar notificaciones.';
    END IF;

    -- 2. Validar que el usuario posea rol owner o admin en la organización destinataria
    v_is_staff := public.has_org_role(p_organization_id, ARRAY['owner', 'admin']::public.organization_role[]);

    IF NOT v_is_staff AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'No tenés permisos para encolar notificaciones en esta organización.';
    END IF;

    -- 3. Validar parámetros requeridos y formato de correo
    IF p_recipient_email IS NULL OR p_recipient_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'El correo electrónico del destinatario no es válido.';
    END IF;

    IF p_idempotency_key IS NULL OR pg_catalog.length(pg_catalog.trim(p_idempotency_key)) = 0 THEN
        RAISE EXCEPTION 'Se requiere una clave de idempotencia válida.';
    END IF;

    IF p_event_type IS NULL THEN
        RAISE EXCEPTION 'El tipo de evento de la notificación es obligatorio.';
    END IF;

    -- 4. Validar cuota mensual disponible con bloqueo pesimista
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

    -- 5. Encolar con estado 'pending' e idempotencia por (organization_id, idempotency_key)
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

    -- NOTA: NO se incrementa emails_sent_count al encolar.
    RETURN v_outbox_id;
END;
$$;

-- Procedimiento para registrar envío confirmado (ejecutado con service_role tras respuesta del proveedor)
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
    v_outbox_email TEXT;
    v_outbox_event_type public.notification_event_type;
BEGIN
    -- 1. Validar que los datos de confirmación del proveedor no estén vacíos
    IF p_provider IS NULL OR pg_catalog.length(pg_catalog.trim(p_provider)) = 0 THEN
        RAISE EXCEPTION 'El proveedor de envío es obligatorio.';
    END IF;

    IF p_provider_message_id IS NULL OR pg_catalog.length(pg_catalog.trim(p_provider_message_id)) = 0 THEN
        RAISE EXCEPTION 'El identificador de mensaje del proveedor es obligatorio.';
    END IF;

    -- 2. Bloquear y validar la fila de outbox
    SELECT status, organization_id, recipient_email, event_type
    INTO v_outbox_status, v_outbox_org_id, v_outbox_email, v_outbox_event_type
    FROM public.notification_outbox
    WHERE id = p_outbox_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La notificación con ID % no existe en la cola de salida.', p_outbox_id;
    END IF;

    -- Validar pertenencia multi-tenant estricta
    IF v_outbox_org_id <> p_organization_id THEN
        RAISE EXCEPTION 'Discrepancia de organización: la notificación pertenece a otra entidad.';
    END IF;

    -- Validar consistencia de destinatario y tipo de evento
    IF pg_catalog.lower(v_outbox_email::text) <> pg_catalog.lower(p_recipient_email) THEN
        RAISE EXCEPTION 'Discrepancia en el correo del destinatario de la notificación.';
    END IF;

    IF v_outbox_event_type <> p_event_type THEN
        RAISE EXCEPTION 'Discrepancia en el tipo de evento de la notificación.';
    END IF;

    -- IDEMPOTENCIA: Si ya figura como 'sent', retornar el log previo sin duplicar consumo de cuota
    IF v_outbox_status = 'sent' THEN
        SELECT id INTO v_log_id
        FROM public.notification_logs
        WHERE outbox_id = p_outbox_id
        LIMIT 1;

        RETURN v_log_id;
    END IF;

    -- Validar transiciones de estado válidas (únicamente desde pending o processing)
    IF v_outbox_status NOT IN ('pending', 'processing') THEN
        RAISE EXCEPTION 'Transición inválida: no se puede confirmar un envío con estado %.', v_outbox_status;
    END IF;

    -- 3. Insertar log inmutable de confirmación real
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

    -- 4. Marcar outbox como enviado
    UPDATE public.notification_outbox
    SET status = 'sent',
        processed_at = pg_catalog.now()
    WHERE id = p_outbox_id;

    -- 5. Incrementar la cuota de envíos efectivos exactamente una sola vez
    v_period_id := public.get_or_create_current_usage_period(p_organization_id);

    UPDATE public.usage_counters
    SET emails_sent_count = emails_sent_count + 1,
        updated_at = pg_catalog.now()
    WHERE organization_id = p_organization_id AND period_id = v_period_id;

    RETURN v_log_id;
END;
$$;

-- =============================================================================
-- SECCIÓN 4: INVITACIONES Y PREVENCIÓN DE ESCALADA DE PRIVILEGIOS
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
    v_existing_active BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debés iniciar sesión para reclamar esta invitación.';
    END IF;

    -- Obtener correo del usuario autenticado
    SELECT email INTO v_user_email FROM public.profiles WHERE id = v_user_id;

    -- Bloquear registro de invitación para evitar carreras concurrentes
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

    -- POLÍTICA DE SEGURIDAD 1: Ninguna invitación ordinaria puede otorgar rol 'owner'
    IF v_invitation.role = 'owner' THEN
        RAISE EXCEPTION 'No se permite la asignación del rol de propietario mediante enlaces de invitación.';
    END IF;

    -- POLÍTICA DE SEGURIDAD 2: Correo de destino estricto si está definido
    IF v_invitation.invited_email IS NOT NULL THEN
        IF v_user_email IS NULL OR pg_catalog.lower(v_invitation.invited_email::text) <> pg_catalog.lower(v_user_email) THEN
            RAISE EXCEPTION 'Esta invitación está dirigida exclusivamente a %.', v_invitation.invited_email;
        END IF;
    END IF;

    -- POLÍTICA DE SEGURIDAD 3: Prevención de escalada de privilegios
    -- Un usuario existente no puede auto-elevarse a roles superiores mediante invitaciones por enlace.
    SELECT role, is_active INTO v_existing_role, v_existing_active
    FROM public.organization_members
    WHERE organization_id = v_invitation.organization_id AND user_id = v_user_id;

    IF v_existing_role IS NOT NULL THEN
        IF v_existing_role <> v_invitation.role THEN
            RAISE EXCEPTION 'El usuario ya es miembro de esta organización con el rol %. Las promociones o cambios de privilegio deben ser gestionados por la administración.', v_existing_role;
        ELSE
            IF v_existing_active = FALSE THEN
                -- Reactivación legítima con el mismo rol
                UPDATE public.organization_members
                SET is_active = TRUE,
                    updated_at = pg_catalog.now()
                WHERE organization_id = v_invitation.organization_id AND user_id = v_user_id;
            ELSE
                RAISE EXCEPTION 'Ya sos miembro activo de esta organización con el rol %.', v_existing_role;
            END IF;
        END IF;
    ELSE
        -- Ingreso legítimo como nuevo miembro
        INSERT INTO public.organization_members (
            organization_id,
            user_id,
            role,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            v_invitation.organization_id,
            v_user_id,
            v_invitation.role,
            TRUE,
            pg_catalog.now(),
            pg_catalog.now()
        );
    END IF;

    -- Marcar invitación como reclamada de forma atómica
    UPDATE public.organization_invitations
    SET is_claimed = TRUE,
        claimed_by = v_user_id,
        claimed_at = pg_catalog.now()
    WHERE id = v_invitation.id;

    RETURN v_invitation.organization_id;
END;
$$;

-- Purgar invitaciones con rol 'owner' que hayan quedado registradas para LAVA CERÁMICA
DELETE FROM public.organization_invitations
WHERE organization_id = '00000000-0000-0000-0000-000000000001'::UUID
  AND role = 'owner';

-- =============================================================================
-- SECCIÓN 5: CANCELACIÓN ATÓMICA DE RESERVAS (BLINDAJE Y COHERENCIA)
-- =============================================================================

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
    -- 1. Bloquear y validar la reserva comprobando integridad cruzada multi-tenant
    SELECT b.session_id, b.status, b.cancellation_token_hash, c.user_id, s.start_time
    INTO v_session_id, v_status, v_stored_token_hash, v_contact_user_id, v_session_start
    FROM public.bookings b
    JOIN public.contacts c ON c.id = b.contact_id AND c.organization_id = p_organization_id
    JOIN public.activity_sessions s ON s.id = b.session_id AND s.organization_id = p_organization_id
    WHERE b.id = p_booking_id AND b.organization_id = p_organization_id
    FOR UPDATE OF b;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La reserva no existe en esta organización o presenta inconsistencia de entidad.';
    END IF;

    -- 2. EVALUAR AUTORIZACIÓN ANTES DE RETORNAR CUALQUIER ESTADO (EVITA INFERENCIAS)
    v_is_staff := public.has_org_role(p_organization_id, ARRAY['owner', 'admin', 'instructor']::public.organization_role[]);

    IF v_is_staff THEN
        v_is_authorized := TRUE;
    ELSIF auth.uid() IS NOT NULL AND v_contact_user_id = auth.uid() THEN
        v_is_authorized := TRUE;
    ELSIF p_cancellation_token IS NOT NULL AND v_stored_token_hash IS NOT NULL THEN
        IF encode(digest(p_cancellation_token, 'sha256'), 'hex') = v_stored_token_hash THEN
            v_is_authorized := TRUE;
        ELSE
            RAISE EXCEPTION 'El token de cancelación provisto no es válido.';
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'No tenés permisos para cancelar esta reserva. Se requiere sesión de usuario o un token de cancelación válido.';
    END IF;

    -- 3. Idempotencia: si ya está cancelada, retornar TRUE sin alterar cupo
    IF v_status = 'cancelled' THEN
        RETURN TRUE;
    END IF;

    -- 4. Plazo límite de anticipación (exclusivo para usuarios no-staff)
    IF NOT v_is_staff THEN
        SELECT cancellation_notice_hours INTO v_notice_hours
        FROM public.organization_settings
        WHERE organization_id = p_organization_id;

        IF v_notice_hours IS NOT NULL AND v_session_start < (pg_catalog.now() + (v_notice_hours || ' hours')::INTERVAL) THEN
            RAISE EXCEPTION 'No es posible cancelar la reserva: el plazo límite de anticipación (% horas) ha vencido.', v_notice_hours;
        END IF;
    END IF;

    -- 5. Cancelar e invalidar el token SHA-256 (uso estrictamente único)
    UPDATE public.bookings
    SET status = 'cancelled',
        cancellation_reason = p_reason,
        cancellation_token_hash = NULL,
        cancelled_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_booking_id;

    -- 6. Liberar cupo en la sesión
    UPDATE public.activity_sessions
    SET booked_count = GREATEST(0, booked_count - 1),
        updated_at = pg_catalog.now()
    WHERE id = v_session_id;

    -- 7. Registro de auditoría
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
-- SECCIÓN 6: MATRIZ DE PERMISOS DE EJECUCIÓN (GRANT Y REVOKE FINAL)
-- =============================================================================

-- Revocar accesos públicos a todas las funciones privileged
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

-- record_notification_sent: EXCLUSIVO para service_role (workers/Edge Functions backend)
REVOKE ALL ON FUNCTION public.record_notification_sent(UUID, UUID, TEXT, public.notification_event_type, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_notification_sent(UUID, UUID, TEXT, public.notification_event_type, TEXT, TEXT) TO service_role;


-- -----------------------------------------------------------------------------
-- 7. PROCEDIMIENTO PÚBLICO: CREACIÓN DE RESERVA PÚBLICA PARA VISITANTES (ANON)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_public_booking(
    p_organization_slug TEXT,
    p_session_id UUID,
    p_first_name TEXT,
    p_last_name TEXT,
    p_email TEXT,
    p_phone TEXT DEFAULT NULL,
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
    v_org_id UUID;
    v_contact_id UUID;
    v_clean_email TEXT;
BEGIN
    -- Validar formato email
    v_clean_email := lower(trim(p_email));
    IF v_clean_email IS NULL OR v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'El formato de correo electrónico no es válido.';
    END IF;

    -- Validar nombres
    IF trim(p_first_name) IS NULL OR trim(p_first_name) = '' OR trim(p_last_name) IS NULL OR trim(p_last_name) = '' THEN
        RAISE EXCEPTION 'El nombre y apellido son obligatorios.';
    END IF;

    -- Obtener la organización por slug
    SELECT id INTO v_org_id
    FROM public.organizations
    WHERE slug = p_organization_slug AND is_active = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La organización solicitada no existe o no está activa.';
    END IF;

    -- Buscar si ya existe un contacto con este email en la organización
    SELECT id INTO v_contact_id
    FROM public.contacts
    WHERE organization_id = v_org_id AND lower(email) = v_clean_email;

    -- Si no existe, crearlo
    IF v_contact_id IS NULL THEN
        INSERT INTO public.contacts (
            organization_id,
            first_name,
            last_name,
            email,
            phone,
            is_active
        ) VALUES (
            v_org_id,
            trim(p_first_name),
            trim(p_last_name),
            v_clean_email,
            nullif(trim(p_phone), ''),
            TRUE
        )
        RETURNING id INTO v_contact_id;
    END IF;

    -- Delegar en el procedimiento atómico centralizado
    RETURN QUERY
    SELECT b.booking_id, b.cancellation_token
    FROM public.create_booking_atomic(
        v_org_id,
        p_session_id,
        v_contact_id,
        p_notes
    ) b;
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_booking(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
