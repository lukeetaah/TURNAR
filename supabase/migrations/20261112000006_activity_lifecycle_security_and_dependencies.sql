-- =============================================================================
-- TURNAR - MIGRACIÓN 016: CICLO DE VIDA DE ACTIVIDADES, SEGURIDAD RLS Y DEPENDENCIAS
-- =============================================================================
-- 1. Agrega soporte para archivo de actividades (is_archived).
-- 2. Función de análisis de dependencias (analyze_activity_dependencies).
-- 3. Procedimientos de archivo y eliminación inteligente (archive_activity, delete_activity_intelligent).
-- 4. Fortalecimiento de seguridad de revert_batch_operation (valida rol del usuario autenticado).
-- 5. Endurecimiento de RLS en rule_acceptances, organization_rules y client_recurring_schedules.
-- 6. Actualización de vistas públicas para respetar is_archived = FALSE.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CAMPO IS_ARCHIVED EN ACTIVITIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.activities
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_activities_archived 
ON public.activities(organization_id, is_archived, is_active);

-- -----------------------------------------------------------------------------
-- 2. FUNCIÓN: ANALIZAR DEPENDENCIAS DE UNA ACTIVIDAD
-- Identifica exactamente qué elementos existen relacionados antes de modificar o eliminar
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analyze_activity_dependencies(
    p_organization_id UUID,
    p_activity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_schedules_count INTEGER := 0;
    v_past_sessions_count INTEGER := 0;
    v_future_sessions_count INTEGER := 0;
    v_future_sessions_with_bookings INTEGER := 0;
    v_future_sessions_without_bookings INTEGER := 0;
    v_confirmed_bookings_count INTEGER := 0;
    v_active_recurring_count INTEGER := 0;
    v_activity_name TEXT;
    v_is_archived BOOLEAN;
    v_is_active BOOLEAN;
BEGIN
    -- Validar que el usuario tenga rol en la organización o sea admin
    IF NOT (
        public.has_org_role(p_organization_id, ARRAY['owner', 'admin', 'instructor']::public.organization_role[])
        OR public.is_platform_admin()
    ) THEN
        RAISE EXCEPTION 'No tenés permisos para consultar esta actividad.';
    END IF;

    -- Obtener datos básicos de la actividad
    SELECT name, is_archived, is_active
    INTO v_activity_name, v_is_archived, v_is_active
    FROM public.activities
    WHERE id = p_activity_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La actividad solicitada no existe en esta organización.';
    END IF;

    -- Cantidad de horarios habituales (plantillas semanales)
    SELECT COUNT(*) INTO v_schedules_count
    FROM public.activity_schedules
    WHERE activity_id = p_activity_id AND organization_id = p_organization_id;

    -- Cantidad de sesiones pasadas
    SELECT COUNT(*) INTO v_past_sessions_count
    FROM public.activity_sessions
    WHERE activity_id = p_activity_id 
      AND organization_id = p_organization_id
      AND start_time < NOW();

    -- Cantidad de sesiones futuras totales
    SELECT COUNT(*) INTO v_future_sessions_count
    FROM public.activity_sessions
    WHERE activity_id = p_activity_id 
      AND organization_id = p_organization_id
      AND start_time >= NOW()
      AND status != 'cancelled';

    -- Sesiones futuras con reservas
    SELECT COUNT(*) INTO v_future_sessions_with_bookings
    FROM public.activity_sessions
    WHERE activity_id = p_activity_id 
      AND organization_id = p_organization_id
      AND start_time >= NOW()
      AND status != 'cancelled'
      AND booked_count > 0;

    -- Sesiones futuras sin reservas
    v_future_sessions_without_bookings := v_future_sessions_count - v_future_sessions_with_bookings;

    -- Reservas confirmadas históricas y futuras
    SELECT COUNT(b.id) INTO v_confirmed_bookings_count
    FROM public.bookings b
    JOIN public.activity_sessions s ON b.session_id = s.id
    WHERE s.activity_id = p_activity_id
      AND s.organization_id = p_organization_id
      AND b.status = 'confirmed';

    -- Recurrencias semanales activas de alumnos
    SELECT COUNT(*) INTO v_active_recurring_count
    FROM public.client_recurring_schedules
    WHERE activity_id = p_activity_id
      AND organization_id = p_organization_id
      AND status = 'active';

    RETURN jsonb_build_object(
        'activity_id', p_activity_id,
        'activity_name', v_activity_name,
        'is_archived', v_is_archived,
        'is_active', v_is_active,
        'schedules_count', v_schedules_count,
        'past_sessions_count', v_past_sessions_count,
        'future_sessions_count', v_future_sessions_count,
        'future_sessions_with_bookings', v_future_sessions_with_bookings,
        'future_sessions_without_bookings', v_future_sessions_without_bookings,
        'confirmed_bookings_count', v_confirmed_bookings_count,
        'active_recurring_count', v_active_recurring_count,
        'has_bookings_or_history', (v_confirmed_bookings_count > 0 OR v_past_sessions_count > 0),
        'can_delete_safely', (v_confirmed_bookings_count = 0 AND v_past_sessions_count = 0 AND v_future_sessions_count = 0 AND v_schedules_count = 0),
        'can_clean_unbooked_and_archive', (v_future_sessions_without_bookings > 0)
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. PROCEDIMIENTO: ARCHIVAR ACTIVIDAD (PRESERVA HISTORIAL Y RESERVAS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_activity(
    p_organization_id UUID,
    p_activity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    -- Validar que el usuario sea owner o admin de la organización
    IF NOT (
        public.has_org_role(p_organization_id, ARRAY['owner', 'admin']::public.organization_role[])
        OR public.is_platform_admin()
    ) THEN
        RAISE EXCEPTION 'No tenés permisos para archivar actividades en esta organización.';
    END IF;

    -- 1. Marcar actividad como archivada, inactiva y no pública
    UPDATE public.activities
    SET is_archived = TRUE,
        is_active = FALSE,
        is_public = FALSE,
        updated_at = NOW()
    WHERE id = p_activity_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La actividad no existe en esta organización.';
    END IF;

    -- 2. Pausar horarios habituales asociados
    UPDATE public.activity_schedules
    SET is_active = FALSE,
        updated_at = NOW()
    WHERE activity_id = p_activity_id AND organization_id = p_organization_id;

    -- 3. Pausar recurrencias de alumnos
    UPDATE public.client_recurring_schedules
    SET status = 'paused',
        updated_at = NOW()
    WHERE activity_id = p_activity_id AND organization_id = p_organization_id AND status = 'active';

    RETURN jsonb_build_object(
        'success', TRUE,
        'activity_id', p_activity_id,
        'message', 'Actividad archivada exitosamente. Se preservaron todas las reservas e historial.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3.1 PROCEDIMIENTO: REACTIVAR / DESARCHIVAR ACTIVIDAD
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unarchive_activity(
    p_organization_id UUID,
    p_activity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    IF NOT (
        public.has_org_role(p_organization_id, ARRAY['owner', 'admin']::public.organization_role[])
        OR public.is_platform_admin()
    ) THEN
        RAISE EXCEPTION 'No tenés permisos para reactivar actividades en esta organización.';
    END IF;

    UPDATE public.activities
    SET is_archived = FALSE,
        is_active = TRUE,
        is_public = TRUE,
        updated_at = NOW()
    WHERE id = p_activity_id AND organization_id = p_organization_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'activity_id', p_activity_id,
        'message', 'Actividad reactivada exitosamente.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. PROCEDIMIENTO: ELIMINACIÓN INTELIGENTE DE ACTIVIDAD
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_activity_intelligent(
    p_organization_id UUID,
    p_activity_id UUID,
    p_mode TEXT -- 'delete_pure' o 'clean_unbooked_future_and_archive'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_has_bookings BOOLEAN := FALSE;
    v_past_sessions INTEGER := 0;
    v_deleted_sessions INTEGER := 0;
    v_deleted_schedules INTEGER := 0;
    v_preserved_sessions INTEGER := 0;
BEGIN
    -- Validar permisos de administrador
    IF NOT (
        public.has_org_role(p_organization_id, ARRAY['owner', 'admin']::public.organization_role[])
        OR public.is_platform_admin()
    ) THEN
        RAISE EXCEPTION 'No tenés permisos para eliminar actividades en esta organización.';
    END IF;

    -- Verificar si existen reservas de alumnos
    SELECT EXISTS (
        SELECT 1 
        FROM public.bookings b
        JOIN public.activity_sessions s ON b.session_id = s.id
        WHERE s.activity_id = p_activity_id
          AND s.organization_id = p_organization_id
          AND b.status = 'confirmed'
    ) INTO v_has_bookings;

    -- Verificar si existen sesiones pasadas
    SELECT COUNT(*) INTO v_past_sessions
    FROM public.activity_sessions
    WHERE activity_id = p_activity_id 
      AND organization_id = p_organization_id
      AND start_time < NOW();

    IF p_mode = 'delete_pure' THEN
        -- Si hay reservas o sesiones pasadas, IMPEDIR el borrado físico para proteger datos
        IF v_has_bookings OR v_past_sessions > 0 THEN
            RAISE EXCEPTION 'No es posible eliminar físicamente la actividad porque tiene reservas de alumnos o historial de clases dictadas. Utilizá la opción de archivar para preservarlas.';
        END IF;

        -- Eliminar recurrencias
        DELETE FROM public.client_recurring_schedules
        WHERE activity_id = p_activity_id AND organization_id = p_organization_id;

        -- Eliminar sesiones sin inscriptos
        DELETE FROM public.activity_sessions
        WHERE activity_id = p_activity_id AND organization_id = p_organization_id;
        GET DIAGNOSTICS v_deleted_sessions = ROW_COUNT;

        -- Eliminar horarios habituales
        DELETE FROM public.activity_schedules
        WHERE activity_id = p_activity_id AND organization_id = p_organization_id;
        GET DIAGNOSTICS v_deleted_schedules = ROW_COUNT;

        -- Eliminar la actividad físicamente
        DELETE FROM public.activities
        WHERE id = p_activity_id AND organization_id = p_organization_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'deleted_pure',
            'deleted_sessions', v_deleted_sessions,
            'deleted_schedules', v_deleted_schedules,
            'message', 'Actividad eliminada definitivamente junto con sus horarios y turnos vacíos.'
        );

    ELSIF p_mode = 'clean_unbooked_future_and_archive' THEN
        -- 1. Eliminar únicamente las sesiones futuras que NO tengan alumnos inscriptos
        DELETE FROM public.activity_sessions
        WHERE activity_id = p_activity_id 
          AND organization_id = p_organization_id
          AND start_time >= NOW()
          AND booked_count = 0;
        GET DIAGNOSTICS v_deleted_sessions = ROW_COUNT;

        -- 2. Contar las sesiones que se conservaron por tener inscriptos o ser pasadas
        SELECT COUNT(*) INTO v_preserved_sessions
        FROM public.activity_sessions
        WHERE activity_id = p_activity_id AND organization_id = p_organization_id;

        -- 3. Pausar horarios habituales
        UPDATE public.activity_schedules
        SET is_active = FALSE,
            updated_at = NOW()
        WHERE activity_id = p_activity_id AND organization_id = p_organization_id;

        -- 4. Archivar la actividad para proteger las reservas existentes
        UPDATE public.activities
        SET is_archived = TRUE,
            is_active = FALSE,
            is_public = FALSE,
            updated_at = NOW()
        WHERE id = p_activity_id AND organization_id = p_organization_id;

        -- 5. Pausar recurrencias de alumnos
        UPDATE public.client_recurring_schedules
        SET status = 'paused',
            updated_at = NOW()
        WHERE activity_id = p_activity_id AND organization_id = p_organization_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'cleaned_and_archived',
            'deleted_empty_sessions', v_deleted_sessions,
            'preserved_sessions', v_preserved_sessions,
            'message', format('Se eliminaron %s turnos vacíos. Se conservaron %s sesiones con inscriptos o historial y la actividad fue archivada.', v_deleted_sessions, v_preserved_sessions)
        );
    ELSE
        RAISE EXCEPTION 'Modo de eliminación no reconocido: %', p_mode;
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. FORTALECIMIENTO DE SEGURIDAD EN REVERT_BATCH_OPERATION
-- Valida que el usuario autenticado tenga permisos en la organización
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_batch_operation(
    p_organization_id UUID,
    p_batch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_batch RECORD;
    v_deleted_count INTEGER := 0;
    v_blocked_count INTEGER := 0;
    v_blocked_sessions JSONB := '[]'::JSONB;
BEGIN
    -- VALIDACIÓN DE SEGURIDAD: Usuario debe pertenecer a la organización con rol owner o admin
    IF NOT (
        public.has_org_role(p_organization_id, ARRAY['owner', 'admin']::public.organization_role[])
        OR public.is_platform_admin()
    ) THEN
        RAISE EXCEPTION 'Acceso denegado: No tenés permisos administrativos para revertir operaciones en esta organización.';
    END IF;

    -- Validar existencia del lote en la organización especificada
    SELECT * INTO v_batch
    FROM public.schedule_batch_operations
    WHERE id = p_batch_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La operación masiva no existe en esta organización.';
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
        'success', TRUE,
        'deleted_count', v_deleted_count,
        'blocked_count', COALESCE(v_blocked_count, 0),
        'blocked_sessions', COALESCE(v_blocked_sessions, '[]'::JSONB)
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. POLÍTICAS RLS PARA CLIENT_RECURRING_SCHEDULES (ALUMNOS)
-- Permite que los alumnos consulten su propio horario habitual
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "recurring_schedules_client_read" ON public.client_recurring_schedules;
CREATE POLICY "recurring_schedules_client_read" ON public.client_recurring_schedules
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.contacts c
        WHERE c.id = client_recurring_schedules.contact_id
          AND c.user_id = auth.uid()
    )
);

-- -----------------------------------------------------------------------------
-- 7. VALIDACIÓN EN RULE_ACCEPTANCES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "rule_acceptances_insert" ON public.rule_acceptances;
CREATE POLICY "rule_acceptances_insert" ON public.rule_acceptances
FOR INSERT TO anon, authenticated
WITH CHECK (
    email IS NOT NULL 
    AND length(email::text) >= 5
    AND organization_id IS NOT NULL
    AND (
        auth.uid() IS NULL 
        OR user_id IS NULL 
        OR user_id = auth.uid()
    )
);

-- -----------------------------------------------------------------------------
-- 8. ACTUALIZACIÓN DE VISTA PÚBLICA DEL DIRECTORIO (EXCLUYE ARCHIVADAS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_directory_organizations
WITH (security_invoker = false)
AS
SELECT
    o.id,
    o.name,
    o.slug,
    o.description,
    o.activity_category,
    o.logo_url,
    o.address,
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id', a.id,
                    'name', a.name,
                    'duration_minutes', a.duration_minutes,
                    'price_cents', a.price_cents
                )
            )
            FROM public.activities a
            WHERE a.organization_id = o.id
              AND a.is_public = TRUE
              AND a.is_active = TRUE
              AND a.is_archived = FALSE
        ),
        '[]'::json
    ) AS activities
FROM public.organizations o
WHERE o.is_active = TRUE
  AND o.is_directory_listed = TRUE;

-- Permisos sobre las nuevas funciones
GRANT EXECUTE ON FUNCTION public.analyze_activity_dependencies TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_activity TO authenticated;
GRANT EXECUTE ON FUNCTION public.unarchive_activity TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_activity_intelligent TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_batch_operation TO authenticated;
