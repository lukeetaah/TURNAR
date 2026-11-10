-- =============================================================================
-- TURNAR - MIGRACIÓN 015: OPERACIONES MASIVAS REVERSIBLES, REGLAS Y RECURRENCIAS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CAMPO BATCH_ID EN ACTIVITY_SESSIONS
-- -----------------------------------------------------------------------------
ALTER TABLE public.activity_sessions 
ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_sessions_batch ON public.activity_sessions(batch_id);

-- -----------------------------------------------------------------------------
-- 2. TABLA: SCHEDULE_BATCH_OPERATIONS
-- Registro de operaciones masivas con capacidad de reversión (Undo)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedule_batch_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    operation_type TEXT NOT NULL, -- 'generate_week', 'generate_month', 'clone_week', 'bulk_create'
    description TEXT NOT NULL,
    affected_count INTEGER NOT NULL DEFAULT 0,
    session_ids UUID[] DEFAULT '{}',
    is_reverted BOOLEAN NOT NULL DEFAULT FALSE,
    reverted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_batch_ops_org ON public.schedule_batch_operations(organization_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. PROCEDIMIENTO ATÓMICO: REVERTIR OPERACIÓN MASIVA (UNDO SEGURO)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_batch_operation(
    p_organization_id UUID,
    p_batch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_batch RECORD;
    v_deleted_count INTEGER := 0;
    v_blocked_count INTEGER := 0;
    v_blocked_sessions JSONB := '[]'::JSONB;
BEGIN
    -- Validar existencia
    SELECT * INTO v_batch
    FROM public.schedule_batch_operations
    WHERE id = p_batch_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La operación no existe en esta organización.';
    END IF;

    IF v_batch.is_reverted THEN
        RAISE EXCEPTION 'Esta operación ya fue revertida anteriormente.';
    END IF;

    -- Identificar sesiones con reservas existentes para proteger a los alumnos
    SELECT 
        COUNT(*),
        COALESCE(jsonb_agg(jsonb_build_object(
            'id', s.id, 
            'start_time', s.start_time, 
            'booked_count', s.booked_count
        )), '[]'::JSONB)
    INTO v_blocked_count, v_blocked_sessions
    FROM public.activity_sessions s
    WHERE (s.batch_id = p_batch_id OR s.id = ANY(v_batch.session_ids))
      AND s.organization_id = p_organization_id
      AND s.booked_count > 0;

    -- Eliminar únicamente las sesiones vacías sin reservas
    DELETE FROM public.activity_sessions s
    WHERE (s.batch_id = p_batch_id OR s.id = ANY(v_batch.session_ids))
      AND s.organization_id = p_organization_id
      AND s.booked_count = 0;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Marcar la operación como revertida (total o parcial según si quedaron bloqueadas)
    UPDATE public.schedule_batch_operations
    SET is_reverted = (v_blocked_count = 0),
        reverted_at = NOW()
    WHERE id = p_batch_id;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_count', v_deleted_count,
        'blocked_count', COALESCE(v_blocked_count, 0),
        'blocked_sessions', COALESCE(v_blocked_sessions, '[]'::JSONB)
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. TABLA: ORGANIZATION_RULES
-- Dos niveles de reglas: Globales (organization_id IS NULL) y Particulares
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general', -- 'cancellation', 'punctuality', 'community', 'recovery', 'facilities', 'general'
    requires_acceptance BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_rules ON public.organization_rules(organization_id, is_active, sort_order);

-- Insertar lineamientos globales estándar de TURNAR si no existen
INSERT INTO public.organization_rules (organization_id, title, content, category, requires_acceptance, is_active, version, sort_order)
SELECT 
    NULL,
    'Lineamientos Generales de Convivencia y Participación en TURNAR',
    '1. Puntualidad y asistencia: Te pedimos llegar con 5 minutos de anticipación al horario de tu clase.\n2. Cancelaciones anticipadas: Si no podés asistir, cancelá con la antelación requerida por el espacio para permitir que otra persona aproveche el cupo.\n3. Cuidado y respeto: Respetá las instalaciones, herramientas y pautas de convivencia del espacio y la comunidad.',
    'general',
    TRUE,
    TRUE,
    1,
    0
WHERE NOT EXISTS (
    SELECT 1 FROM public.organization_rules WHERE organization_id IS NULL AND category = 'general'
);

-- -----------------------------------------------------------------------------
-- 5. TABLA: RULE_ACCEPTANCES
-- Registro versionado y auditable de aceptación de condiciones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rule_acceptances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    email CITEXT NOT NULL,
    rule_version INTEGER NOT NULL DEFAULT 1,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rule_acc_email ON public.rule_acceptances(organization_id, email);

-- -----------------------------------------------------------------------------
-- 6. TABLA: CLIENT_RECURRING_SCHEDULES
-- Horario habitual y recurrencia de alumnos por actividad
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_recurring_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'cancelled'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_schedules ON public.client_recurring_schedules(organization_id, contact_id, status);

-- -----------------------------------------------------------------------------
-- 7. POLÍTICAS RLS Y PERMISOS
-- -----------------------------------------------------------------------------
ALTER TABLE public.schedule_batch_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_recurring_schedules ENABLE ROW LEVEL SECURITY;

-- Reglas: Lectura pública (anónimos y autenticados) de reglas activas
DROP POLICY IF EXISTS "rules_read_public" ON public.organization_rules;
CREATE POLICY "rules_read_public" ON public.organization_rules
FOR SELECT TO anon, authenticated
USING (is_active = TRUE);

-- Reglas: Staff de la organización puede administrar las reglas propias
DROP POLICY IF EXISTS "rules_manage_staff" ON public.organization_rules;
CREATE POLICY "rules_manage_staff" ON public.organization_rules
FOR ALL TO authenticated
USING (
    organization_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = organization_rules.organization_id
          AND om.user_id = auth.uid()
          AND om.role IN ('owner', 'admin')
    )
)
WITH CHECK (
    organization_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = organization_rules.organization_id
          AND om.user_id = auth.uid()
          AND om.role IN ('owner', 'admin')
    )
);

-- Aceptaciones de reglas: Crear libremente (anon y authenticated)
DROP POLICY IF EXISTS "rule_acceptances_insert" ON public.rule_acceptances;
CREATE POLICY "rule_acceptances_insert" ON public.rule_acceptances
FOR INSERT TO anon, authenticated
WITH CHECK (TRUE);

-- Aceptaciones de reglas: Staff puede leer aceptaciones de su organización
DROP POLICY IF EXISTS "rule_acceptances_staff_read" ON public.rule_acceptances;
CREATE POLICY "rule_acceptances_staff_read" ON public.rule_acceptances
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = rule_acceptances.organization_id
          AND om.user_id = auth.uid()
          AND om.role IN ('owner', 'admin', 'instructor')
    )
);

-- Batch operations: Solo staff de la organización
DROP POLICY IF EXISTS "batch_ops_staff" ON public.schedule_batch_operations;
CREATE POLICY "batch_ops_staff" ON public.schedule_batch_operations
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = schedule_batch_operations.organization_id
          AND om.user_id = auth.uid()
          AND om.role IN ('owner', 'admin', 'instructor')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = schedule_batch_operations.organization_id
          AND om.user_id = auth.uid()
          AND om.role IN ('owner', 'admin', 'instructor')
    )
);

-- Client recurring schedules: Staff de la organización
DROP POLICY IF EXISTS "recurring_schedules_staff" ON public.client_recurring_schedules;
CREATE POLICY "recurring_schedules_staff" ON public.client_recurring_schedules
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = client_recurring_schedules.organization_id
          AND om.user_id = auth.uid()
          AND om.role IN ('owner', 'admin', 'instructor')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = client_recurring_schedules.organization_id
          AND om.user_id = auth.uid()
          AND om.role IN ('owner', 'admin', 'instructor')
    )
);

-- Permisos de ejecución sobre funciones
GRANT EXECUTE ON FUNCTION public.revert_batch_operation TO authenticated;
