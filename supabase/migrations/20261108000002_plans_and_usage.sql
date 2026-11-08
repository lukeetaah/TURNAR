-- =============================================================================
-- TURNAR - MIGRACIÓN 002: PLANES Y CONSUMO CONTROLADO
-- Creado por LUKSONARTS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: PLANS
-- Catálogo de planes y cuotas de uso (modificables sin tocar código)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    max_organizations INTEGER NOT NULL DEFAULT 1,
    max_staff INTEGER NOT NULL DEFAULT 2,
    max_active_contacts INTEGER NOT NULL DEFAULT 100,
    max_monthly_bookings INTEGER NOT NULL DEFAULT 200,
    max_active_activities INTEGER NOT NULL DEFAULT 5,
    max_monthly_emails INTEGER NOT NULL DEFAULT 250,
    max_storage_bytes BIGINT NOT NULL DEFAULT 262144000, -- 250 MB
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sembrado inicial del Plan Gratuito oficial
INSERT INTO public.plans (
    code,
    name,
    description,
    max_organizations,
    max_staff,
    max_active_contacts,
    max_monthly_bookings,
    max_active_activities,
    max_monthly_emails,
    max_storage_bytes
) VALUES (
    'free',
    'Plan Gratuito',
    'Para personas, profesionales y pequeños talleres que comienzan su gestión.',
    1,
    2,
    100,
    200,
    5,
    250,
    262144000
) ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. TABLA: ORGANIZATION_SUBSCRIPTIONS
-- Asignación de plan por organización (administrable desde TURNAR Admin)
-- -----------------------------------------------------------------------------
CREATE TYPE public.subscription_status AS ENUM ('active', 'past_due', 'suspended', 'cancelled');

CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
    plan_id UUID NOT NULL REFERENCES public.plans(id),
    status public.subscription_status NOT NULL DEFAULT 'active',
    custom_limits_override JSONB, -- Permite configuraciones a medida como LAVA CERÁMICA
    notes TEXT,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    renewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_subs_org ON public.organization_subscriptions(organization_id);

-- -----------------------------------------------------------------------------
-- 3. TABLA: USAGE_PERIODS
-- Ciclos mensuales de consumo por organización
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_usage_periods_current ON public.usage_periods(organization_id, is_current);

-- -----------------------------------------------------------------------------
-- 4. TABLA: USAGE_COUNTERS
-- Contadores transaccionales de consumo (nunca editables desde cliente)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_counters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    period_id UUID NOT NULL REFERENCES public.usage_periods(id) ON DELETE CASCADE,
    bookings_count INTEGER NOT NULL DEFAULT 0,
    emails_sent_count INTEGER NOT NULL DEFAULT 0,
    storage_used_bytes BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, period_id)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_lookup ON public.usage_counters(organization_id, period_id);

-- -----------------------------------------------------------------------------
-- 5. FUNCIONES BACKEND PARA CONSUMO SEGURO
-- -----------------------------------------------------------------------------

-- Obtiene o crea el período de consumo mensual actual
CREATE OR REPLACE FUNCTION public.get_or_create_current_usage_period(target_org_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_period_id UUID;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    v_start_date := date_trunc('month', CURRENT_DATE)::DATE;
    v_end_date := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;

    SELECT id INTO current_period_id
    FROM public.usage_periods
    WHERE organization_id = target_org_id
      AND period_start = v_start_date
      AND period_end = v_end_date
    LIMIT 1;

    IF current_period_id IS NULL THEN
        -- Desmarcar períodos anteriores como actuales
        UPDATE public.usage_periods
        SET is_current = FALSE
        WHERE organization_id = target_org_id AND is_current = TRUE;

        -- Crear nuevo período mensual
        INSERT INTO public.usage_periods (organization_id, period_start, period_end, is_current)
        VALUES (target_org_id, v_start_date, v_end_date, TRUE)
        RETURNING id INTO current_period_id;

        -- Inicializar contadores en cero
        INSERT INTO public.usage_counters (organization_id, period_id, bookings_count, emails_sent_count, storage_used_bytes)
        VALUES (target_org_id, current_period_id, 0, 0, 0)
        ON CONFLICT (organization_id, period_id) DO NOTHING;
    END IF;

    RETURN current_period_id;
END;
$$;
