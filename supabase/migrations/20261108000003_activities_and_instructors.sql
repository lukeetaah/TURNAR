-- =============================================================================
-- TURNAR - MIGRACIÓN 003: ACTIVIDADES, PROFESIONALES Y AGENDA
-- Creado por LUKSONARTS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: INSTRUCTORS
-- Profesores y profesionales por organización
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instructors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    email CITEXT,
    phone TEXT,
    bio TEXT,
    color_code TEXT DEFAULT '#6d7b95',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instructors_org ON public.instructors(organization_id, is_active);

-- -----------------------------------------------------------------------------
-- 2. TABLA: INSTRUCTOR_AVAILABILITY
-- Disponibilidad semanal recurrente (0: Domingo, 1: Lunes, ..., 6: Sábado)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instructor_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instructor_id UUID NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL CHECK (end_time > start_time),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (instructor_id, day_of_week, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS idx_inst_avail ON public.instructor_availability(instructor_id, day_of_week);

-- -----------------------------------------------------------------------------
-- 3. TABLA: AVAILABILITY_EXCEPTIONS
-- Bloqueos, licencias o vacaciones de profesionales
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.availability_exceptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instructor_id UUID NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
    exception_date DATE NOT NULL,
    is_fully_blocked BOOLEAN NOT NULL DEFAULT TRUE,
    start_time TIME,
    end_time TIME,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_avail_exceptions ON public.availability_exceptions(instructor_id, exception_date);

-- -----------------------------------------------------------------------------
-- 4. TABLA: ACTIVITIES
-- Catálogo de clases, talleres y actividades
-- -----------------------------------------------------------------------------
CREATE TYPE public.activity_modality AS ENUM ('in_person', 'online', 'hybrid');

CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT, -- Ej: 'Cerámica Adultos', 'Cerámica Niños'
    duration_minutes INTEGER NOT NULL DEFAULT 120, -- Duración configurable, no asume 2 horas fijas
    default_capacity INTEGER NOT NULL DEFAULT 10,
    price_cents BIGINT NOT NULL DEFAULT 0,
    min_age INTEGER,
    max_age INTEGER,
    modality public.activity_modality NOT NULL DEFAULT 'in_person',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_org ON public.activities(organization_id, is_active, is_public);

-- -----------------------------------------------------------------------------
-- 5. TABLA: ACTIVITY_SCHEDULES
-- Programación recurrente semanal de cada actividad
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    instructor_id UUID REFERENCES public.instructors(id) ON DELETE SET NULL,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL CHECK (end_time > start_time),
    capacity_override INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_act_schedules ON public.activity_schedules(activity_id, day_of_week, is_active);

-- -----------------------------------------------------------------------------
-- 6. TABLA: ACTIVITY_SESSIONS
-- Sesiones concretas generadas para fechas específicas
-- -----------------------------------------------------------------------------
CREATE TYPE public.session_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

CREATE TABLE IF NOT EXISTS public.activity_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    schedule_id UUID REFERENCES public.activity_schedules(id) ON DELETE SET NULL,
    instructor_id UUID REFERENCES public.instructors(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL CHECK (end_time > start_time),
    capacity INTEGER NOT NULL,
    booked_count INTEGER NOT NULL DEFAULT 0,
    status public.session_status NOT NULL DEFAULT 'scheduled',
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_booked_capacity CHECK (booked_count >= 0 AND booked_count <= capacity)
);

CREATE INDEX IF NOT EXISTS idx_sessions_org_dates ON public.activity_sessions(organization_id, start_time, status);
CREATE INDEX IF NOT EXISTS idx_sessions_activity ON public.activity_sessions(activity_id, start_time);
