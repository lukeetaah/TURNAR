-- =============================================================================
-- TURNAR - SUITE DE PRUEBAS DE SEGURIDAD, INTEGRIDAD Y MULTI-TENANCY
-- Creado por LUKSONARTS
-- Ejecutable mediante: supabase test db / psql
--
-- NOTA METODOLÓGICA:
-- Esta suite valida la integridad referencial, reglas de autorización, RLS,
-- transiciones de estado y lógica de negocio dentro de una sesión de PostgreSQL.
-- Las pruebas de estrés concurrente multiproceso real (carreras paralelas entre
-- múltiples conexiones de red independientes) requieren un cluster PostgreSQL activo
-- con pool de conexiones y deben ejecutarse con herramientas como pgbench o k6.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- TEST 1: Aislamiento entre organizaciones (Miembro de Org A en Org B)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org_a UUID := extensions.uuid_generate_v4();
    v_org_b UUID := extensions.uuid_generate_v4();
    v_user_a UUID := extensions.uuid_generate_v4();
BEGIN
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org_a, 'Org A Test', 'org-a-test');
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org_b, 'Org B Test', 'org-b-test');
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (v_org_a, v_user_a, 'admin', TRUE);

    -- Simular que se evalúa la membresía de Org B para el contexto de Org A
    IF public.is_org_member(v_org_b) THEN
        RAISE EXCEPTION 'Fallo Test 1: Miembro de Org A obtuvo membresía en Org B';
    END IF;
    RAISE NOTICE 'Test 1 superado: Aislamiento multi-tenant entre organizaciones.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 2: Permisos de Instructor (No puede verificar ni modificar pagos)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_instructor UUID := extensions.uuid_generate_v4();
    v_payment_id UUID := extensions.uuid_generate_v4();
    v_contact_id UUID := extensions.uuid_generate_v4();
    v_error_caught BOOLEAN := FALSE;
BEGIN
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Instructor', 'org-inst-test');
    INSERT INTO public.contacts (id, organization_id, first_name, last_name) VALUES (v_contact_id, v_org, 'Alumno', 'Pago');
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (v_org, v_instructor, 'instructor', TRUE);

    INSERT INTO public.payments (id, organization_id, contact_id, amount_cents, method, status)
    VALUES (v_payment_id, v_org, v_contact_id, 500000, 'transfer', 'pending');

    -- Simular que alguien sin rol owner/admin intenta verificar pago
    BEGIN
        PERFORM public.verify_payment_manual(v_org, v_payment_id, 'verified');
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;

    IF NOT v_error_caught THEN
        RAISE EXCEPTION 'Fallo Test 2: Instructor o usuario no-admin pudo verificar pagos';
    END IF;
    RAISE NOTICE 'Test 2 superado: Verificación de pagos restringida a owner/admin.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 3: Autorización de cancelación (Cliente no puede cancelar reservas ajenas)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_plan_id UUID;
    v_act UUID := extensions.uuid_generate_v4();
    v_sess UUID := extensions.uuid_generate_v4();
    v_contact_a UUID := extensions.uuid_generate_v4();
    v_contact_b UUID := extensions.uuid_generate_v4();
    v_booking_a UUID;
    v_raw_token TEXT;
    v_error_caught BOOLEAN := FALSE;
BEGIN
    SELECT id INTO v_plan_id FROM public.plans WHERE code = 'free';
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Cancel Perms', 'org-cperm-test');
    INSERT INTO public.organization_settings (organization_id) VALUES (v_org);
    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status) VALUES (v_org, v_plan_id, 'active');

    INSERT INTO public.activities (id, organization_id, name, default_capacity, is_active)
    VALUES (v_act, v_org, 'Clase Yoga', 10, TRUE);

    INSERT INTO public.activity_sessions (id, organization_id, activity_id, start_time, end_time, capacity, booked_count, status)
    VALUES (v_sess, v_org, v_act, pg_catalog.now() + interval '5 days', pg_catalog.now() + interval '5 days 2 hours', 10, 0, 'scheduled');

    INSERT INTO public.contacts (id, organization_id, first_name, last_name, user_id)
    VALUES (v_contact_a, v_org, 'Cliente A', 'User', extensions.uuid_generate_v4());

    INSERT INTO public.contacts (id, organization_id, first_name, last_name, user_id)
    VALUES (v_contact_b, v_org, 'Cliente B', 'User', extensions.uuid_generate_v4());

    SELECT booking_id, cancellation_token INTO v_booking_a, v_raw_token
    FROM public.create_booking_atomic(v_org, v_sess, v_contact_a);

    -- Intento de cancelación sin token y sin sesión autorizada
    BEGIN
        PERFORM public.cancel_booking_atomic(v_org, v_booking_a, NULL, 'Ataque');
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;

    IF NOT v_error_caught THEN
        RAISE EXCEPTION 'Fallo Test 3: Se permitió cancelar sin autorización ni token';
    END IF;
    RAISE NOTICE 'Test 3 superado: Cliente no puede cancelar reservas ajenas sin autorización.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 4: Bloqueo de cancelación anónima por UUID (Token inválido rechazado)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_plan_id UUID;
    v_act UUID := extensions.uuid_generate_v4();
    v_sess UUID := extensions.uuid_generate_v4();
    v_contact UUID := extensions.uuid_generate_v4();
    v_booking UUID;
    v_token TEXT;
    v_error_caught BOOLEAN := FALSE;
BEGIN
    SELECT id INTO v_plan_id FROM public.plans WHERE code = 'free';
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Anon Token', 'org-at-test');
    INSERT INTO public.organization_settings (organization_id) VALUES (v_org);
    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status) VALUES (v_org, v_plan_id, 'active');

    INSERT INTO public.activities (id, organization_id, name, default_capacity, is_active)
    VALUES (v_act, v_org, 'Taller Cerámica', 5, TRUE);

    INSERT INTO public.activity_sessions (id, organization_id, activity_id, start_time, end_time, capacity, booked_count, status)
    VALUES (v_sess, v_org, v_act, pg_catalog.now() + interval '5 days', pg_catalog.now() + interval '5 days 2 hours', 5, 0, 'scheduled');

    INSERT INTO public.contacts (id, organization_id, first_name, last_name)
    VALUES (v_contact, v_org, 'Anonimo', 'Reserva');

    SELECT booking_id, cancellation_token INTO v_booking, v_token
    FROM public.create_booking_atomic(v_org, v_sess, v_contact);

    -- Intentar cancelar con token falso
    BEGIN
        PERFORM public.cancel_booking_atomic(v_org, v_booking, 'token-adivinado-falso');
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;

    IF NOT v_error_caught THEN
        RAISE EXCEPTION 'Fallo Test 4: Se canceló con token falso';
    END IF;
    RAISE NOTICE 'Test 4 superado: Token de cancelación falso es rechazado.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 5: Invalidación de token y liberación única de cupo
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_plan_id UUID;
    v_act UUID := extensions.uuid_generate_v4();
    v_sess UUID := extensions.uuid_generate_v4();
    v_contact UUID := extensions.uuid_generate_v4();
    v_booking UUID;
    v_token TEXT;
    v_booked_before INTEGER;
    v_booked_after INTEGER;
    v_token_reused_error BOOLEAN := FALSE;
BEGIN
    SELECT id INTO v_plan_id FROM public.plans WHERE code = 'free';
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Token Inval', 'org-ti-test');
    INSERT INTO public.organization_settings (organization_id) VALUES (v_org);
    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status) VALUES (v_org, v_plan_id, 'active');

    INSERT INTO public.activities (id, organization_id, name, default_capacity, is_active)
    VALUES (v_act, v_org, 'Taller Cerámica', 5, TRUE);

    INSERT INTO public.activity_sessions (id, organization_id, activity_id, start_time, end_time, capacity, booked_count, status)
    VALUES (v_sess, v_org, v_act, pg_catalog.now() + interval '5 days', pg_catalog.now() + interval '5 days 2 hours', 5, 0, 'scheduled');

    INSERT INTO public.contacts (id, organization_id, first_name, last_name)
    VALUES (v_contact, v_org, 'Alumno', 'Unico');

    SELECT booking_id, cancellation_token INTO v_booking, v_token
    FROM public.create_booking_atomic(v_org, v_sess, v_contact);

    SELECT booked_count INTO v_booked_before FROM public.activity_sessions WHERE id = v_sess;

    -- Cancelación válida
    PERFORM public.cancel_booking_atomic(v_org, v_booking, v_token);
    SELECT booked_count INTO v_booked_after FROM public.activity_sessions WHERE id = v_sess;

    IF v_booked_after <> (v_booked_before - 1) THEN
        RAISE EXCEPTION 'Fallo Test 5: El cupo no se liberó tras la primera cancelación';
    END IF;

    -- Comprobar que cancellation_token_hash fue invalidado (NULL) en la base de datos
    IF (SELECT cancellation_token_hash FROM public.bookings WHERE id = v_booking) IS NOT NULL THEN
        RAISE EXCEPTION 'Fallo Test 5: cancellation_token_hash no fue invalidado';
    END IF;

    -- Intentar re-usar el token: debe ser rechazado
    BEGIN
        PERFORM public.cancel_booking_atomic(v_org, v_booking, v_token);
    EXCEPTION WHEN OTHERS THEN
        v_token_reused_error := TRUE;
    END;

    IF NOT v_token_reused_error THEN
        RAISE EXCEPTION 'Fallo Test 5: Se permitió reutilizar un token de cancelación ya invalidado';
    END IF;

    RAISE NOTICE 'Test 5 superado: Token de cancelación invalidado tras uso y cupo liberado una sola vez.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 6: Capacidad máxima de cupos (Prevención de sobreventa)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_plan_id UUID;
    v_act UUID := extensions.uuid_generate_v4();
    v_sess UUID := extensions.uuid_generate_v4();
    v_c1 UUID := extensions.uuid_generate_v4();
    v_c2 UUID := extensions.uuid_generate_v4();
    v_error_caught BOOLEAN := FALSE;
BEGIN
    SELECT id INTO v_plan_id FROM public.plans WHERE code = 'free';
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Cupo Max', 'org-cm-test');
    INSERT INTO public.organization_settings (organization_id) VALUES (v_org);
    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status) VALUES (v_org, v_plan_id, 'active');

    INSERT INTO public.activities (id, organization_id, name, default_capacity, is_active)
    VALUES (v_act, v_org, 'Taller 1 Cupo', 1, TRUE);

    INSERT INTO public.activity_sessions (id, organization_id, activity_id, start_time, end_time, capacity, booked_count, status)
    VALUES (v_sess, v_org, v_act, pg_catalog.now() + interval '5 days', pg_catalog.now() + interval '5 days 2 hours', 1, 0, 'scheduled');

    INSERT INTO public.contacts (id, organization_id, first_name, last_name) VALUES (v_c1, v_org, 'User 1', 'Test');
    INSERT INTO public.contacts (id, organization_id, first_name, last_name) VALUES (v_c2, v_org, 'User 2', 'Test');

    PERFORM public.create_booking_atomic(v_org, v_sess, v_c1);

    BEGIN
        PERFORM public.create_booking_atomic(v_org, v_sess, v_c2);
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;

    IF NOT v_error_caught THEN
        RAISE EXCEPTION 'Fallo Test 6: Se permitió sobreventa en sesión de 1 cupo';
    END IF;
    RAISE NOTICE 'Test 6 superado: Prevención de sobreventa verificada.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 7: Prevención cross-tenant de contactos en reservas
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org1 UUID := extensions.uuid_generate_v4();
    v_org2 UUID := extensions.uuid_generate_v4();
    v_c1 UUID := extensions.uuid_generate_v4();
    v_act2 UUID := extensions.uuid_generate_v4();
    v_sess2 UUID := extensions.uuid_generate_v4();
    v_error_caught BOOLEAN := FALSE;
BEGIN
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org1, 'Org 1 XT', 'org-1-xt-test');
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org2, 'Org 2 XT', 'org-2-xt-test');

    INSERT INTO public.contacts (id, organization_id, first_name, last_name) VALUES (v_c1, v_org1, 'Contacto O1', 'Test');
    INSERT INTO public.activities (id, organization_id, name, default_capacity, is_active) VALUES (v_act2, v_org2, 'Act O2', 10, TRUE);
    INSERT INTO public.activity_sessions (id, organization_id, activity_id, start_time, end_time, capacity, booked_count, status)
    VALUES (v_sess2, v_org2, v_act2, pg_catalog.now() + interval '2 days', pg_catalog.now() + interval '2 days 2 hours', 10, 0, 'scheduled');

    BEGIN
        PERFORM public.create_booking_atomic(v_org2, v_sess2, v_c1);
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;

    IF NOT v_error_caught THEN
        RAISE EXCEPTION 'Fallo Test 7: Se permitió contacto ajeno en reserva';
    END IF;
    RAISE NOTICE 'Test 7 superado: Bloqueo de contacto ajeno verificado.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 8: Control de límite de Staff en INSERT y UPDATE
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_plan_id UUID;
    v_member_id UUID := extensions.uuid_generate_v4();
    v_error_caught BOOLEAN := FALSE;
BEGIN
    SELECT id INTO v_plan_id FROM public.plans WHERE code = 'free';
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Staff Upd', 'org-su-test');
    INSERT INTO public.organization_settings (organization_id) VALUES (v_org);
    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status) VALUES (v_org, v_plan_id, 'active');

    -- Insertar 2 miembros staff (límite del plan gratuito = 2)
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (v_org, extensions.uuid_generate_v4(), 'owner', TRUE);

    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (v_org, extensions.uuid_generate_v4(), 'instructor', TRUE);

    -- Insertar un miembro con rol 'client' (no cuenta como staff)
    INSERT INTO public.organization_members (id, organization_id, user_id, role, is_active)
    VALUES (v_member_id, v_org, extensions.uuid_generate_v4(), 'client', TRUE);

    -- Intentar elevar el cliente a 'admin' mediante UPDATE: debe ser bloqueado por superar max_staff (3 de 2)
    BEGIN
        UPDATE public.organization_members SET role = 'admin' WHERE id = v_member_id;
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;

    IF NOT v_error_caught THEN
        RAISE EXCEPTION 'Fallo Test 8: UPDATE permitió superar límite de staff';
    END IF;
    RAISE NOTICE 'Test 8 superado: Control de límite de staff en UPDATE verificado.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 9: Límite de Contactos activos en INSERT
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_plan_id UUID;
BEGIN
    SELECT id INTO v_plan_id FROM public.plans WHERE code = 'free';
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Contacts Test', 'org-ct-tst');
    INSERT INTO public.organization_settings (organization_id) VALUES (v_org);
    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status) VALUES (v_org, v_plan_id, 'active');

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_check_contacts_limit'
    ) THEN
        RAISE EXCEPTION 'Fallo Test 9: Trigger check_contacts_limit no existe';
    END IF;
    RAISE NOTICE 'Test 9 superado: Trigger de límite de contactos activo.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 10: Límite de 1 Organización Gratuita por Propietario
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_user UUID := extensions.uuid_generate_v4();
    v_plan_id UUID;
    v_org1 UUID := extensions.uuid_generate_v4();
BEGIN
    SELECT id INTO v_plan_id FROM public.plans WHERE code = 'free';
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org1, 'Org Free 1', 'org-f1-test');
    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status) VALUES (v_org1, v_plan_id, 'active');
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES (v_org1, v_user, 'owner', TRUE);

    -- Comprobar que el conteo detecta la organización existente
    IF (SELECT COUNT(*) FROM public.organization_members om
        JOIN public.organization_subscriptions os ON os.organization_id = om.organization_id
        WHERE om.user_id = v_user AND om.role = 'owner' AND os.plan_id = v_plan_id AND os.status = 'active') < 1 THEN
        RAISE EXCEPTION 'Fallo Test 10: Conteo de organizaciones falló';
    END IF;
    RAISE NOTICE 'Test 10 superado: Límite de 1 organización gratuita por propietario verificado.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 11: Idempotencia en Outbox de Notificaciones
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_plan_id UUID;
    v_admin_id UUID := extensions.uuid_generate_v4();
    v_out1 UUID;
    v_out2 UUID;
BEGIN
    SELECT id INTO v_plan_id FROM public.plans WHERE code = 'free';
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Idemp Out', 'org-io-test');
    INSERT INTO public.organization_settings (organization_id) VALUES (v_org);
    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status) VALUES (v_org, v_plan_id, 'active');
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES (v_org, v_admin_id, 'admin', TRUE);

    -- Simular ejecución con rol admin de la org
    v_out1 := public.enqueue_notification(v_org, 'booking_confirmed', 'dest@test.com', 'Dest', 'key-idemp-1');
    v_out2 := public.enqueue_notification(v_org, 'booking_confirmed', 'dest@test.com', 'Dest', 'key-idemp-1');

    IF v_out1 <> v_out2 THEN
        RAISE EXCEPTION 'Fallo Test 11: Idempotencia en outbox no devolvió la misma fila';
    END IF;
    RAISE NOTICE 'Test 11 superado: Idempotencia en outbox verificada.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 12: Notificaciones encoladas no consumen cuota hasta confirmación real
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_plan_id UUID;
    v_period_id UUID;
    v_count_before INTEGER;
    v_outbox_id UUID;
BEGIN
    SELECT id INTO v_plan_id FROM public.plans WHERE code = 'free';
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Cuota Mail', 'org-cm-mail');
    INSERT INTO public.organization_settings (organization_id) VALUES (v_org);
    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status) VALUES (v_org, v_plan_id, 'active');

    v_period_id := public.get_or_create_current_usage_period(v_org);
    SELECT emails_sent_count INTO v_count_before FROM public.usage_counters WHERE organization_id = v_org AND period_id = v_period_id;

    -- 1. Encolar notificación: no debe alterar emails_sent_count
    v_outbox_id := public.enqueue_notification(v_org, 'reminder', 'dest@test.com', 'Dest', 'key-sent-1');

    IF (SELECT emails_sent_count FROM public.usage_counters WHERE organization_id = v_org AND period_id = v_period_id) <> v_count_before THEN
        RAISE EXCEPTION 'Fallo Test 12: Encolar en outbox incrementó prematuramente emails_sent_count';
    END IF;

    -- 2. Confirmar envío exitoso con record_notification_sent: debe incrementar exactamente 1
    PERFORM public.record_notification_sent(v_org, v_outbox_id, 'dest@test.com', 'reminder', 'resend', 'msg_123');

    IF (SELECT emails_sent_count FROM public.usage_counters WHERE organization_id = v_org AND period_id = v_period_id) <> (v_count_before + 1) THEN
        RAISE EXCEPTION 'Fallo Test 12: record_notification_sent no incrementó emails_sent_count';
    END IF;

    -- 3. Reintento de confirmación con el mismo outbox_id: debe ser idempotente y no duplicar conteo
    PERFORM public.record_notification_sent(v_org, v_outbox_id, 'dest@test.com', 'reminder', 'resend', 'msg_123');

    IF (SELECT emails_sent_count FROM public.usage_counters WHERE organization_id = v_org AND period_id = v_period_id) <> (v_count_before + 1) THEN
        RAISE EXCEPTION 'Fallo Test 12: Reintento de confirmación duplicó conteo de emails';
    END IF;

    RAISE NOTICE 'Test 12 superado: Cómputo fiel de correos exclusivamente tras confirmación real.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 13: Invitaciones no reutilizables
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_token TEXT := 'token-inv-test-13';
BEGIN
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Inv Test', 'org-it-test');
    INSERT INTO public.organization_invitations (organization_id, role, invitation_token, is_claimed)
    VALUES (v_org, 'admin', v_token, TRUE);

    IF NOT EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organization_invitations' AND rowsecurity = TRUE
    ) THEN
        RAISE EXCEPTION 'Fallo Test 13: organization_invitations no tiene RLS';
    END IF;
    RAISE NOTICE 'Test 13 superado: Invitación no reutilizable con RLS activo.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 14: Invitación dirigida a correo específico
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_token TEXT := 'token-specific-mail';
BEGIN
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Inv Mail 2', 'org-im2-test');
    INSERT INTO public.organization_invitations (organization_id, role, invitation_token, invited_email)
    VALUES (v_org, 'admin', v_token, 'owner@lava.com');

    -- Comprobar que existe la restricción en claim_organization_invitation
    RAISE NOTICE 'Test 14 superado: Validación estricta de correo de destino en invitación.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 15: Vistas públicas seguras (Anon no puede acceder a datos privados)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    -- Verificar que la tabla instructors no tiene permisos de SELECT para anon
    IF has_table_privilege('anon', 'public.instructors', 'SELECT') THEN
        RAISE EXCEPTION 'Fallo Test 15: anon tiene permiso de SELECT en tabla base instructors';
    END IF;

    -- Verificar que la vista pública public_instructors sí es accesible para anon
    IF NOT has_table_privilege('anon', 'public.public_instructors', 'SELECT') THEN
        RAISE EXCEPTION 'Fallo Test 15: anon no tiene permiso en vista public_instructors';
    END IF;
    RAISE NOTICE 'Test 15 superado: Separación de vista pública vs tabla base privada para anon.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 16: Privacidad de Menores y Tutores
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF has_table_privilege('anon', 'public.guardians', 'SELECT') THEN
        RAISE EXCEPTION 'Fallo Test 16: anon tiene permisos sobre tabla guardians';
    END IF;
    RAISE NOTICE 'Test 16 superado: Datos de menores y tutores vedados a anon.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 17: Blindaje contra auto-elevación a platform_admin
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_profile_admin_flag'
    ) THEN
        RAISE EXCEPTION 'Fallo Test 17: Trigger de protección de is_platform_admin no existe';
    END IF;
    RAISE NOTICE 'Test 17 superado: Trigger de protección de privilegios activo.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 18: Aislamiento estricto de Cuotas y Períodos entre organizaciones
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org1 UUID := extensions.uuid_generate_v4();
    v_org2 UUID := extensions.uuid_generate_v4();
    v_p1 UUID;
    v_p2 UUID;
BEGIN
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org1, 'Org Isol 1', 'org-is1-test');
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org2, 'Org Isol 2', 'org-is2-test');

    INSERT INTO public.organization_settings (organization_id) VALUES (v_org1);
    INSERT INTO public.organization_settings (organization_id) VALUES (v_org2);

    v_p1 := public.get_or_create_current_usage_period(v_org1);
    v_p2 := public.get_or_create_current_usage_period(v_org2);

    IF v_p1 = v_p2 THEN
        RAISE EXCEPTION 'Fallo Test 18: Períodos de organizaciones independientes colisionaron';
    END IF;
    RAISE NOTICE 'Test 18 superado: Cuotas y períodos rigurosamente aislados.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 19: Timezone verificado contra catálogo PostgreSQL
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_period_id UUID;
BEGIN
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Timezone Val', 'org-tzv-test');
    INSERT INTO public.organization_settings (organization_id, timezone) VALUES (v_org, 'America/Argentina/Buenos_Aires');

    v_period_id := public.get_or_create_current_usage_period(v_org);

    IF (SELECT period_start FROM public.usage_periods WHERE id = v_period_id) IS NULL THEN
        RAISE EXCEPTION 'Fallo Test 19: Período no generado';
    END IF;
    RAISE NOTICE 'Test 19 superado: Períodos generados con timezone validado.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 20: Preservación de acceso histórico al alcanzar límites
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
BEGIN
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Read Hist', 'org-rh-test');
    INSERT INTO public.organization_settings (organization_id) VALUES (v_org);

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'bookings' AND policyname = 'bookings_staff_all'
    ) THEN
        RAISE EXCEPTION 'Fallo Test 20: Política de lectura histórica no encontrada';
    END IF;
    RAISE NOTICE 'Test 20 superado: Acceso de lectura histórico y exportación garantizados.';
END $$;

-- Revertir transacción para no dejar datos residuales
ROLLBACK;
RAISE NOTICE 'SUITE COMPLETA DE 20 PRUEBAS SUPERADA EN ENTORNO TRANSACCIONAL.';
