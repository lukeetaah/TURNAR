-- =============================================================================
-- TURNAR - MIGRACIÓN 004: PERSONAS, MENORES, RESERVAS Y LISTAS DE ESPERA
-- Creado por LUKSONARTS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: CONTACTS
-- Padrón de personas, alumnos y clientes (Minimización de datos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email CITEXT,
    phone TEXT,
    notes TEXT,
    is_minor BOOLEAN NOT NULL DEFAULT FALSE,
    birth_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_org ON public.contacts(organization_id, last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(organization_id, email);

-- -----------------------------------------------------------------------------
-- 2. TABLA: GUARDIANS
-- Adulto responsable para actividades infantiles (no requiere cuenta obligatoria)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guardians (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    guardian_name TEXT NOT NULL,
    guardian_email CITEXT NOT NULL,
    guardian_phone TEXT NOT NULL,
    relationship TEXT NOT NULL DEFAULT 'Madre/Padre/Tutor',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guardians_contact ON public.guardians(contact_id);

-- -----------------------------------------------------------------------------
-- 3. TABLA: BOOKINGS
-- Reservas transaccionales con estados controlados
-- -----------------------------------------------------------------------------
CREATE TYPE public.booking_status AS ENUM (
    'requested',
    'confirmed',
    'cancelled',
    'waitlisted',
    'attended',
    'absent'
);

CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.activity_sessions(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
    status public.booking_status NOT NULL DEFAULT 'confirmed',
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_bookings_session_status ON public.bookings(session_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_contact ON public.bookings(contact_id);
CREATE INDEX IF NOT EXISTS idx_bookings_org_dates ON public.bookings(organization_id, created_at);

-- -----------------------------------------------------------------------------
-- 4. TABLA: WAITLISTS
-- Listas de espera ordenadas por posición
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.waitlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.activity_sessions(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, contact_id),
    UNIQUE (session_id, position)
);

CREATE INDEX IF NOT EXISTS idx_waitlists_session ON public.waitlists(session_id, position);

-- -----------------------------------------------------------------------------
-- 5. TABLA: ATTENDANCE
-- Registro histórico de asistencia
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE UNIQUE,
    session_id UUID NOT NULL REFERENCES public.activity_sessions(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
    has_attended BOOLEAN NOT NULL DEFAULT TRUE,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_attendance_session ON public.attendance(session_id);

-- -----------------------------------------------------------------------------
-- 6. PROCEDIMIENTO ATÓMICO: CREAR RESERVA CON CONTROL DE CONCURRENCIA Y CUOTAS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
    p_organization_id UUID,
    p_session_id UUID,
    p_contact_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session_capacity INTEGER;
    v_session_booked INTEGER;
    v_session_status public.session_status;
    v_booking_id UUID;
    v_period_id UUID;
    v_current_bookings_count INTEGER;
    v_max_monthly_bookings INTEGER;
BEGIN
    -- 1. Bloquear y validar la sesión mediante SELECT FOR UPDATE (evita sobreventa concurrente)
    SELECT capacity, booked_count, status
    INTO v_session_capacity, v_session_booked, v_session_status
    FROM public.activity_sessions
    WHERE id = p_session_id AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La sesión seleccionada no existe.';
    END IF;

    IF v_session_status <> 'scheduled' THEN
        RAISE EXCEPTION 'La sesión no se encuentra disponible para reservas.';
    END IF;

    IF v_session_booked >= v_session_capacity THEN
        RAISE EXCEPTION 'No hay cupos disponibles en esta sesión.';
    END IF;

    -- 2. Validar límite mensual del plan de la organización
    v_period_id := public.get_or_create_current_usage_period(p_organization_id);

    SELECT uc.bookings_count, COALESCE(os.custom_limits_override->>'max_monthly_bookings', p.max_monthly_bookings::TEXT)::INTEGER
    INTO v_current_bookings_count, v_max_monthly_bookings
    FROM public.usage_counters uc
    JOIN public.organization_subscriptions os ON os.organization_id = p_organization_id
    JOIN public.plans p ON p.id = os.plan_id
    WHERE uc.organization_id = p_organization_id AND uc.period_id = v_period_id;

    IF v_current_bookings_count >= v_max_monthly_bookings THEN
        RAISE EXCEPTION 'Alcanzaste el límite mensual de reservas de tu plan. Podés consultar las opciones para ampliar tu capacidad.';
    END IF;

    -- 3. Crear la reserva
    INSERT INTO public.bookings (organization_id, session_id, contact_id, status, notes)
    VALUES (p_organization_id, p_session_id, p_contact_id, 'confirmed', p_notes)
    RETURNING id INTO v_booking_id;

    -- 4. Incrementar cupo de la sesión
    UPDATE public.activity_sessions
    SET booked_count = booked_count + 1,
        updated_at = NOW()
    WHERE id = p_session_id;

    -- 5. Incrementar contador de uso mensual
    UPDATE public.usage_counters
    SET bookings_count = bookings_count + 1,
        updated_at = NOW()
    WHERE organization_id = p_organization_id AND period_id = v_period_id;

    RETURN v_booking_id;
END;
$$;
