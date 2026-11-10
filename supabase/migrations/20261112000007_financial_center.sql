-- =============================================================================
-- TURNAR - MIGRACIÓN 007: CENTRO INTEGRAL DE COBROS, ARANCELES Y MATERIALES
-- Creado por LUKSONARTS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS PARA GESTIÓN ECONÓMICA
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fee_concept_type') THEN
        CREATE TYPE public.fee_concept_type AS ENUM (
            'membership',       -- Cuota mensual / arancel periódico
            'single_class',     -- Pase diario / clase suelta
            'registration',     -- Matrícula / inscripción
            'material',         -- Materiales o insumos
            'workshop_special', -- Seminario / intensivo
            'other'             -- Otro concepto
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'charge_status') THEN
        CREATE TYPE public.charge_status AS ENUM (
            'pending',          -- Pendiente de pago
            'partial',          -- Pago parcial registrado
            'paid',             -- Cobrado y verificado en su totalidad
            'cancelled',        -- Anulado / bonificado
            'overdue'           -- Vencido
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'material_billing_frequency') THEN
        CREATE TYPE public.material_billing_frequency AS ENUM (
            'one_time',         -- Cargo único inicial
            'monthly',          -- Mensual con la cuota
            'per_session'       -- Por clase o sesión
        );
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. TABLA: CONFIGURACIÓN DE MEDIOS DE PAGO Y COBRO
-- Datos bancarios / alias visibles para los alumnos al abonar
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_methods_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    bank_name TEXT,
    account_holder TEXT,
    cuit_cuil TEXT,
    cbu_cvu TEXT,
    alias TEXT,
    instructions TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payment_methods_org UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_org ON public.payment_methods_config(organization_id);

-- -----------------------------------------------------------------------------
-- 3. TABLA: CATÁLOGO DE ARANCELES Y CONCEPTOS (FEE_CONCEPTS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    concept_type public.fee_concept_type NOT NULL DEFAULT 'membership',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_concepts_org ON public.fee_concepts(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_fee_concepts_activity ON public.fee_concepts(activity_id);

-- -----------------------------------------------------------------------------
-- 4. TABLA: VERSIONES HISTÓRICAS DE PRECIOS (FEE_CONCEPT_VERSIONS)
-- Con soporte para anticipación mínima obligatoria (30 días recomendados)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_concept_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    fee_concept_id UUID NOT NULL REFERENCES public.fee_concepts(id) ON DELETE CASCADE,
    amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
    valid_from DATE NOT NULL,
    valid_until DATE,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_concept_versions_lookup 
ON public.fee_concept_versions(organization_id, fee_concept_id, valid_from);

-- -----------------------------------------------------------------------------
-- 5. TABLA: MATERIALES E INSUMOS POR ACTIVIDAD (ACTIVITY_MATERIALS)
-- Desglosa arcilla, esmaltes, herramientas, etc.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    is_mandatory BOOLEAN NOT NULL DEFAULT FALSE,
    is_included_in_fee BOOLEAN NOT NULL DEFAULT FALSE,
    billing_frequency public.material_billing_frequency NOT NULL DEFAULT 'monthly',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_materials_org ON public.activity_materials(organization_id, activity_id);

-- -----------------------------------------------------------------------------
-- 6. TABLA: CARGOS / CUENTAS POR COBRAR (CHARGES)
-- Registro de lo que un alumno debe en un período determinado
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
    fee_concept_id UUID REFERENCES public.fee_concepts(id) ON DELETE SET NULL,
    activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    period_month SMALLINT CHECK (period_month BETWEEN 1 AND 12),
    period_year SMALLINT CHECK (period_year >= 2024),
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    balance_cents BIGINT NOT NULL CHECK (balance_cents >= 0),
    due_date DATE NOT NULL,
    status public.charge_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_charges_contact_org FOREIGN KEY (organization_id, contact_id)
        REFERENCES public.contacts(organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_charges_org_contact ON public.charges(organization_id, contact_id, status);
CREATE INDEX IF NOT EXISTS idx_charges_due_date ON public.charges(organization_id, due_date);
CREATE INDEX IF NOT EXISTS idx_charges_period ON public.charges(organization_id, period_year, period_month);

-- -----------------------------------------------------------------------------
-- 7. VINCULACIÓN ENTRE PAGOS Y CARGOS (CHARGE_PAYMENTS)
-- Permite imputar un pago a uno o más cargos específicos (o pagos parciales)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.charge_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    charge_id UUID NOT NULL REFERENCES public.charges(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_charge_payment UNIQUE (charge_id, payment_id)
);

CREATE INDEX IF NOT EXISTS idx_charge_payments_lookup ON public.charge_payments(organization_id, charge_id, payment_id);

-- -----------------------------------------------------------------------------
-- 8. EXTENSIÓN DE TABLA PAYMENTS PARA COMPROBANTES Y CONTROL MEJORADO
-- -----------------------------------------------------------------------------
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS receipt_storage_path TEXT,
ADD COLUMN IF NOT EXISTS receipt_file_name TEXT,
ADD COLUMN IF NOT EXISTS receipt_uploaded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS charge_id UUID REFERENCES public.charges(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 9. FUNCIONES RPC PARA RESUMEN FINANCIERO Y CONTROL ATÓMICO
-- -----------------------------------------------------------------------------

-- Resumen financiero integral para el Dashboard y Centro de Cobros
CREATE OR REPLACE FUNCTION public.get_financial_kpis(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_total_collected_cents BIGINT := 0;
    v_total_pending_cents BIGINT := 0;
    v_overdue_charges_cents BIGINT := 0;
    v_active_debtors_count INT := 0;
    v_verified_count INT := 0;
    v_pending_count INT := 0;
    v_this_month_collected_cents BIGINT := 0;
    v_current_month INT := EXTRACT(MONTH FROM pg_catalog.now())::INT;
    v_current_year INT := EXTRACT(YEAR FROM pg_catalog.now())::INT;
BEGIN
    -- Validar permisos de administrador u owner
    IF NOT public.has_org_role(p_organization_id, ARRAY['owner', 'admin']::public.organization_role[])
       AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'No autorizado para consultar el resumen financiero de esta organización.';
    END IF;

    -- Total verificado histórico
    SELECT COALESCE(SUM(amount_cents), 0), COUNT(*)
    INTO v_total_collected_cents, v_verified_count
    FROM public.payments
    WHERE organization_id = p_organization_id AND status = 'verified';

    -- Total pendiente de verificación en pagos
    SELECT COALESCE(SUM(amount_cents), 0), COUNT(*)
    INTO v_total_pending_cents, v_pending_count
    FROM public.payments
    WHERE organization_id = p_organization_id AND status = 'pending';

    -- Cobrado este mes
    SELECT COALESCE(SUM(amount_cents), 0)
    INTO v_this_month_collected_cents
    FROM public.payments
    WHERE organization_id = p_organization_id
      AND status = 'verified'
      AND EXTRACT(MONTH FROM payment_date) = v_current_month
      AND EXTRACT(YEAR FROM payment_date) = v_current_year;

    -- Cargos vencidos no cobrados
    SELECT COALESCE(SUM(balance_cents), 0)
    INTO v_overdue_charges_cents
    FROM public.charges
    WHERE organization_id = p_organization_id
      AND status IN ('pending', 'partial', 'overdue')
      AND due_date < CURRENT_DATE;

    -- Cantidad de deudores (contactos con saldo pendiente vencido)
    SELECT COUNT(DISTINCT contact_id)
    INTO v_active_debtors_count
    FROM public.charges
    WHERE organization_id = p_organization_id
      AND status IN ('pending', 'partial', 'overdue')
      AND due_date < CURRENT_DATE;

    RETURN jsonb_build_object(
        'total_collected_cents', v_total_collected_cents,
        'total_pending_cents', v_total_pending_cents,
        'this_month_collected_cents', v_this_month_collected_cents,
        'overdue_charges_cents', v_overdue_charges_cents,
        'active_debtors_count', v_active_debtors_count,
        'verified_count', v_verified_count,
        'pending_count', v_pending_count
    );
END;
$$;

-- Imputación y actualización de cargos al verificar o registrar un pago
CREATE OR REPLACE FUNCTION public.impute_payment_to_charge(
    p_organization_id UUID,
    p_payment_id UUID,
    p_charge_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_pay_amount BIGINT;
    v_pay_status public.payment_status;
    v_charge_balance BIGINT;
    v_imputed_amount BIGINT;
BEGIN
    IF NOT public.has_org_role(p_organization_id, ARRAY['owner', 'admin']::public.organization_role[])
       AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Solo administradores pueden imputar pagos.';
    END IF;

    SELECT amount_cents, status
    INTO v_pay_amount, v_pay_status
    FROM public.payments
    WHERE id = p_payment_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pago no encontrado en esta organización.';
    END IF;

    SELECT balance_cents
    INTO v_charge_balance
    FROM public.charges
    WHERE id = p_charge_id AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cargo no encontrado en esta organización.';
    END IF;

    -- Calcular monto a imputar
    v_imputed_amount := LEAST(v_pay_amount, v_charge_balance);

    IF v_imputed_amount > 0 THEN
        INSERT INTO public.charge_payments (organization_id, charge_id, payment_id, amount_cents)
        VALUES (p_organization_id, p_charge_id, p_payment_id, v_imputed_amount)
        ON CONFLICT (charge_id, payment_id) 
        DO UPDATE SET amount_cents = EXCLUDED.amount_cents;

        -- Actualizar saldo y estado del cargo
        UPDATE public.charges
        SET balance_cents = balance_cents - v_imputed_amount,
            status = CASE 
                WHEN (balance_cents - v_imputed_amount) = 0 THEN 'paid'::public.charge_status
                ELSE 'partial'::public.charge_status
            END,
            updated_at = pg_catalog.now()
        WHERE id = p_charge_id;
    END IF;

    RETURN TRUE;
END;
$$;

-- -----------------------------------------------------------------------------
-- 10. POLÍTICAS RLS (ROW LEVEL SECURITY) MULTI-TENANT ESTRICTAS
-- -----------------------------------------------------------------------------
ALTER TABLE public.payment_methods_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_concept_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_payments ENABLE ROW LEVEL SECURITY;

-- payment_methods_config: lectura pública/miembros, edición admin
CREATE POLICY p_payment_methods_select ON public.payment_methods_config
FOR SELECT USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin', 'instructor', 'member']::public.organization_role[])
    OR public.is_platform_admin()
    OR is_active = TRUE
);

CREATE POLICY p_payment_methods_admin ON public.payment_methods_config
FOR ALL USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[])
    OR public.is_platform_admin()
);

-- fee_concepts: lectura abierta para miembros de la org, administración owner/admin
CREATE POLICY p_fee_concepts_select ON public.fee_concepts
FOR SELECT USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin', 'instructor', 'member']::public.organization_role[])
    OR public.is_platform_admin()
    OR is_active = TRUE
);

CREATE POLICY p_fee_concepts_modify ON public.fee_concepts
FOR ALL USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[])
    OR public.is_platform_admin()
);

-- fee_concept_versions:
CREATE POLICY p_fee_concept_versions_select ON public.fee_concept_versions
FOR SELECT USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin', 'instructor', 'member']::public.organization_role[])
    OR public.is_platform_admin()
);

CREATE POLICY p_fee_concept_versions_modify ON public.fee_concept_versions
FOR ALL USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[])
    OR public.is_platform_admin()
);

-- activity_materials:
CREATE POLICY p_activity_materials_select ON public.activity_materials
FOR SELECT USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin', 'instructor', 'member']::public.organization_role[])
    OR public.is_platform_admin()
    OR is_active = TRUE
);

CREATE POLICY p_activity_materials_modify ON public.activity_materials
FOR ALL USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[])
    OR public.is_platform_admin()
);

-- charges:
CREATE POLICY p_charges_select ON public.charges
FOR SELECT USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin', 'instructor']::public.organization_role[])
    OR public.is_platform_admin()
    OR contact_id IN (
        SELECT id FROM public.contacts 
        WHERE user_id = auth.uid() AND organization_id = public.charges.organization_id
    )
);

CREATE POLICY p_charges_modify ON public.charges
FOR ALL USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[])
    OR public.is_platform_admin()
);

-- charge_payments:
CREATE POLICY p_charge_payments_select ON public.charge_payments
FOR SELECT USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin', 'instructor']::public.organization_role[])
    OR public.is_platform_admin()
);

CREATE POLICY p_charge_payments_modify ON public.charge_payments
FOR ALL USING (
    public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.organization_role[])
    OR public.is_platform_admin()
);
