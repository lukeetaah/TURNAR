-- =============================================================================
-- TURNAR - MIGRACIÓN 005: PAGOS MANUALES, NOTICIAS, EVENTOS Y COMUNICACIONES
-- Creado por LUKSONARTS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: PRICE_VERSIONS
-- Historial inmutable de importes (períodos anteriores conservan el valor original)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES public.activities(id) ON DELETE CASCADE,
    item_concept TEXT NOT NULL, -- Ej: 'Cuota Mensual Taller', 'Clase Suelta'
    amount_cents BIGINT NOT NULL,
    valid_from DATE NOT NULL,
    valid_until DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_versions_lookup ON public.price_versions(organization_id, activity_id, valid_from);

-- -----------------------------------------------------------------------------
-- 2. TABLA: PAYMENTS
-- Registro de pagos manuales (no genera factura fiscal)
-- -----------------------------------------------------------------------------
CREATE TYPE public.payment_method AS ENUM (
    'cash',
    'transfer',
    'card',
    'mercadopago',
    'other'
);

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
    price_version_id UUID REFERENCES public.price_versions(id) ON DELETE SET NULL,
    amount_cents BIGINT NOT NULL,
    method public.payment_method NOT NULL DEFAULT 'transfer',
    period_month SMALLINT CHECK (period_month BETWEEN 1 AND 12),
    period_year SMALLINT CHECK (period_year >= 2024),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_code TEXT,
    notes TEXT,
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_org_contact ON public.payments(organization_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_payments_period ON public.payments(organization_id, period_year, period_month);

-- -----------------------------------------------------------------------------
-- 3. TABLA: ANNOUNCEMENTS
-- Novedades y avisos para clientes y alumnos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_org ON public.announcements(organization_id, published_at);

-- -----------------------------------------------------------------------------
-- 4. TABLA: EVENTS
-- Encuentros especiales o muestras de fecha única
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    capacity INTEGER,
    price_cents BIGINT DEFAULT 0,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_org ON public.events(organization_id, start_time);

-- -----------------------------------------------------------------------------
-- 5. TABLA: NOTIFICATION_OUTBOX
-- Cola transaccional para Edge Functions con idempotencia
-- -----------------------------------------------------------------------------
CREATE TYPE public.notification_event_type AS ENUM (
    'booking_received',
    'booking_confirmed',
    'booking_cancelled',
    'booking_rescheduled',
    'reminder',
    'schedule_change',
    'new_activity',
    'announcement',
    'waitlist_alert',
    'price_update'
);

CREATE TYPE public.notification_status AS ENUM ('pending', 'processing', 'sent', 'failed');

CREATE TABLE IF NOT EXISTS public.notification_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_type public.notification_event_type NOT NULL,
    recipient_email CITEXT NOT NULL,
    recipient_name TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    status public.notification_status NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending ON public.notification_outbox(status, created_at)
WHERE status = 'pending';

-- -----------------------------------------------------------------------------
-- 6. TABLA: NOTIFICATION_LOGS
-- Historial inmutable de envíos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    outbox_id UUID REFERENCES public.notification_outbox(id) ON DELETE SET NULL,
    recipient_email CITEXT NOT NULL,
    event_type public.notification_event_type NOT NULL,
    provider TEXT NOT NULL DEFAULT 'resend',
    provider_message_id TEXT,
    status TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_org ON public.notification_logs(organization_id, sent_at);

-- -----------------------------------------------------------------------------
-- 7. TABLA: AUDIT_LOGS
-- Registro de auditoría para operaciones críticas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    entity_id UUID,
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.audit_logs(organization_id, created_at);
