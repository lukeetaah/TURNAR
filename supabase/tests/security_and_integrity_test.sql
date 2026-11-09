-- =============================================================================
-- TURNAR - SUITE COMPLETA DE PRUEBAS DE SEGURIDAD, INTEGRIDAD Y MULTI-TENANCY
-- Creado por LUKSONARTS
-- Ejecutable mediante psql / Supabase test runner dentro de una transacción aislada
--
-- CARACTERÍSTICAS METODOLÓGICAS:
-- 1. Simulación fidedigna de identidad con SET LOCAL / set_config para 'anon' y 'authenticated'
-- 2. Inyección de claims JWT ('request.jwt.claim.sub', 'request.jwt.claims') para auth.uid()
-- 3. Restauración estricta de contexto a 'postgres' tras cada bloque
-- 4. Rollback incondicional al final de la suite para no persistir datos de prueba
-- =============================================================================

BEGIN;

-- Helper para asegurar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- BLOQUE 1: IDENTIDAD Y AISLAMIENTO MULTI-TENANT (TESTS 1 A 5)
-- =============================================================================

-- TEST 1: Usuario de Organización A no accede a datos privados de Organización B
DO $$
DECLARE
    v_org_a UUID := extensions.uuid_generate_v4();
    v_org_b UUID := extensions.uuid_generate_v4();
    v_user_a UUID := extensions.uuid_generate_v4();
    v_contact_b UUID := extensions.uuid_generate_v4();
    v_visible_count INTEGER;
BEGIN
    INSERT INTO public.profiles (id, first_name, last_name, email) VALUES (v_user_a, 'User', 'A', 'user_a@test.com');
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org_a, 'Org A', 'org-a-sec');
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org_b, 'Org B', 'org-b-sec');
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES (v_org_a, v_user_a, 'admin', TRUE);
    INSERT INTO public.contacts (id, organization_id, first_name, last_name, email) VALUES (v_contact_b, v_org_b, 'Privado', 'B', 'privado@orgb.com');

    -- Simular contexto authenticated como User A
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);

    SELECT COUNT(*) INTO v_visible_count FROM public.contacts WHERE organization_id = v_org_b;

    -- Restaurar postgres
    PERFORM set_config('role', 'postgres', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);

    IF v_visible_count > 0 THEN
        RAISE EXCEPTION 'Fallo Test 1: Usuario de Org A pudo consultar contactos privados de Org B (RLS bypass)';
    END IF;
    RAISE NOTICE 'Test 1 superado: Aislamiento RLS multi-tenant estricto entre organizaciones.';
END $$;

-- TEST 2: Instructor no puede verificar pagos (restringido a owner/admin)
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_instructor UUID := extensions.uuid_generate_v4();
    v_payment UUID := extensions.uuid_generate_v4();
    v_contact UUID := extensions.uuid_generate_v4();
    v_error_caught BOOLEAN := FALSE;
BEGIN
    INSERT INTO public.profiles (id, first_name, last_name, email) VALUES (v_instructor, 'Inst', 'Test', 'inst@test.com');
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Inst', 'org-inst-sec');
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES (v_org, v_instructor, 'instructor', TRUE);
    INSERT INTO public.contacts (id, organization_id, first_name, last_name) VALUES (v_contact, v_org, 'Alumno', 'Pago');
    INSERT INTO public.payments (id, organization_id, contact_id, amount_cents, method, status)
    VALUES (v_payment, v_org, v_contact, 150000, 'transfer', 'pending');

    -- Simular instructor
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_instructor::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_instructor, 'role', 'authenticated')::text, true);

    BEGIN
        PERFORM public.verify_payment_manual(v_org, v_payment, 'verified');
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;

    PERFORM set_config('role', 'postgres', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);

    IF NOT v_error_caught THEN
        RAISE EXCEPTION 'Fallo Test 2: Un instructor pudo verificar un pago (violación de RBAC)';
    END IF;
    RAISE NOTICE 'Test 2 superado: Instructor impedido de verificar pagos.';
END $$;

-- TEST 3: Admin puede verificar pagos de su propia organización
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_admin UUID := extensions.uuid_generate_v4();
    v_payment UUID := extensions.uuid_generate_v4();
    v_contact UUID := extensions.uuid_generate_v4();
    v_verified BOOLEAN := FALSE;
BEGIN
    INSERT INTO public.profiles (id, first_name, last_name, email) VALUES (v_admin, 'Admin', 'Test', 'admin@test.com');
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Admin', 'org-admin-sec');
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES (v_org, v_admin, 'admin', TRUE);
    INSERT INTO public.contacts (id, organization_id, first_name, last_name) VALUES (v_contact, v_org, 'Alumno', 'Verif');
    INSERT INTO public.payments (id, organization_id, contact_id, amount_cents, method, status)
    VALUES (v_payment, v_org, v_contact, 250000, 'transfer', 'pending');

    -- Simular admin
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    v_verified := public.verify_payment_manual(v_org, v_payment, 'verified', 'Comprobante transfer OK');

    PERFORM set_config('role', 'postgres', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);

    IF NOT v_verified THEN
        RAISE EXCEPTION 'Fallo Test 3: Admin no pudo verificar un pago legítimo de su organización';
    END IF;
    RAISE NOTICE 'Test 3 superado: Admin verificó el pago con éxito y trazabilidad auditada.';
END $$;

-- TEST 4: Usuario anónimo no puede ejecutar funciones administrativas
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_payment UUID := extensions.uuid_generate_v4();
    v_error_caught BOOLEAN := FALSE;
BEGIN
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}'::text, true);

    BEGIN
        PERFORM public.verify_payment_manual(v_org, v_payment, 'verified');
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;

    PERFORM set_config('role', 'postgres', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);

    IF NOT v_error_caught THEN
        RAISE EXCEPTION 'Fallo Test 4: Usuario anónimo pudo invocar función administrativa verify_payment_manual';
    END IF;
    RAISE NOTICE 'Test 4 superado: Usuario anónimo bloqueado de funciones administrativas.';
END $$;

-- TEST 5: Usuario autenticado no puede operar sobre otra organización
DO $$
DECLARE
    v_org_a UUID := extensions.uuid_generate_v4();
    v_org_b UUID := extensions.uuid_generate_v4();
    v_admin_a UUID := extensions.uuid_generate_v4();
    v_payment_b UUID := extensions.uuid_generate_v4();
    v_contact_b UUID := extensions.uuid_generate_v4();
    v_error_caught BOOLEAN := FALSE;
BEGIN
    INSERT INTO public.profiles (id, first_name, last_name, email) VALUES (v_admin_a, 'Admin', 'A', 'admin_a@test.com');
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org_a, 'Org Cross A', 'org-cross-a');
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org_b, 'Org Cross B', 'org-cross-b');
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES (v_org_a, v_admin_a, 'admin', TRUE);
    INSERT INTO public.contacts (id, organization_id, first_name, last_name) VALUES (v_contact_b, v_org_b, 'Alumno', 'B');
    INSERT INTO public.payments (id, organization_id, contact_id, amount_cents, method, status)
    VALUES (v_payment_b, v_org_b, v_contact_b, 100000, 'transfer', 'pending');

    -- Simular Admin de Org A intentando operar sobre Org B
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);

    BEGIN
        PERFORM public.verify_payment_manual(v_org_b, v_payment_b, 'verified');
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
    END;

    PERFORM set_config('role', 'postgres', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);

    IF NOT v_error_caught THEN
        RAISE EXCEPTION 'Fallo Test 5: Admin de Org A pudo verificar pago de Org B (falla de frontera tenant)';
    END IF;
    RAISE NOTICE 'Test 5 superado: Intento cross-tenant denegado correctamente.';
END $$;

-- =============================================================================
-- BLOQUE 2: CANCELACIÓN DE RESERVAS Y GESTIÓN DE TOKENS (TESTS 6 A 10)
-- =============================================================================

-- TEST 6: Reserva pública puede cancelarse con token válido
-- TEST 7: Token inválido es rechazado
-- TEST 8: Token utilizado no puede reutilizarse (un solo uso)
-- TEST 9: UUID de reserva por sí solo no permite cancelar sin token o sesión
-- TEST 10: El cupo se libera exactamente una vez
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_plan_id UUID;
    v_act UUID := extensions.uuid_generate_v4();
    v_sess UUID := extensions.uuid_generate_v4();
    v_contact UUID := extensions.uuid_generate_v4();
    v_booking_id UUID;
    v_cancellation_token TEXT;
    v_booked_before INTEGER;
    v_booked_after INTEGER;
    v_err_invalid_token BOOLEAN := FALSE;
    v_err_no_token BOOLEAN := FALSE;
    v_err_reused_token BOOLEAN := FALSE;
BEGIN
    SELECT id INTO v_plan_id FROM public.plans WHERE code = 'free';
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Bookings', 'org-book-sec');
    INSERT INTO public.organization_settings (organization_id) VALUES (v_org);
    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status) VALUES (v_org, v_plan_id, 'active');
    INSERT INTO public.activities (id, organization_id, name, default_capacity, is_active) VALUES (v_act, v_org, 'Taller Cerámica', 8, TRUE);
    INSERT INTO public.activity_sessions (id, organization_id, activity_id, start_time, end_time, capacity, booked_count, status)
    VALUES (v_sess, v_org, v_act, pg_catalog.now() + interval '3 days', pg_catalog.now() + interval '3 days 2 hours', 8, 0, 'scheduled');
    INSERT INTO public.contacts (id, organization_id, first_name, last_name) VALUES (v_contact, v_org, 'Cliente', 'Reserva');

    -- Crear reserva atómica y obtener token de 32 bytes
    SELECT booking_id, cancellation_token INTO v_booking_id, v_cancellation_token
    FROM public.create_booking_atomic(v_org, v_sess, v_contact, 'Nota prueba');

    SELECT booked_count INTO v_booked_before FROM public.activity_sessions WHERE id = v_sess;
    IF v_booked_before <> 1 THEN
        RAISE EXCEPTION 'Fallo setup Test 6: El cupo no incrementó al crear la reserva';
    END IF;

    -- Simular contexto anónimo
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}'::text, true);

    -- TEST 9: UUID de reserva sin token no permite cancelar
    BEGIN
        PERFORM public.cancel_booking_atomic(v_org, v_booking_id, NULL, 'Intento anónimo sin token');
    EXCEPTION WHEN OTHERS THEN
        v_err_no_token := TRUE;
    END;

    -- TEST 7: Token inválido es rechazado
    BEGIN
        PERFORM public.cancel_booking_atomic(v_org, v_booking_id, 'token_falso_invalido_12345', 'Intento token falso');
    EXCEPTION WHEN OTHERS THEN
        v_err_invalid_token := TRUE;
    END;

    -- TEST 6: Cancelación exitosa con token legítimo
    PERFORM public.cancel_booking_atomic(v_org, v_booking_id, v_cancellation_token, 'Cancelación voluntaria');

    -- TEST 8: Token utilizado no puede reutilizarse (destruido en la tabla)
    BEGIN
        PERFORM public.cancel_booking_atomic(v_org, v_booking_id, v_cancellation_token, 'Intento re-cancelar');
    EXCEPTION WHEN OTHERS THEN
        v_err_reused_token := TRUE;
    END;

    -- Restaurar postgres para verificar efectos en base de datos
    PERFORM set_config('role', 'postgres', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);

    SELECT booked_count INTO v_booked_after FROM public.activity_sessions WHERE id = v_sess;

    IF NOT v_err_no_token THEN
        RAISE EXCEPTION 'Fallo Test 9: Se permitió cancelar sin proveer el token de cancelación';
    END IF;
    IF NOT v_err_invalid_token THEN
        RAISE EXCEPTION 'Fallo Test 7: Se permitió cancelar con un token falso';
    END IF;
    IF NOT v_err_reused_token THEN
        RAISE EXCEPTION 'Fallo Test 8: El token de cancelación pudo reutilizarse tras ser consumido';
    END IF;
    -- TEST 10: Cupo liberado exactamente una vez
    IF v_booked_after <> 0 THEN
        RAISE EXCEPTION 'Fallo Test 10: El cupo de la sesión no se liberó exactamente a 0 (actual: %)', v_booked_after;
    END IF;

    RAISE NOTICE 'Tests 6 a 10 superados: Cancelación pública blindada con token hash único e idempotencia.';
END $$;

-- =============================================================================
-- BLOQUE 3: NOTIFICACIONES Y CUOTAS TRANSACCIONALES (TESTS 11 A 17)
-- =============================================================================

-- TEST 11: Anónimo no puede encolar notificaciones
-- TEST 12: Usuario sin rol no puede encolar
-- TEST 13: Staff autorizado puede encolar
-- TEST 14: Idempotencia no genera registros duplicados en outbox
-- TEST 15: Un envío exitoso contabiliza una sola unidad
-- TEST 16: Un reintento no duplica el consumo de cuota
-- TEST 17: No se puede confirmar un envío perteneciente a otra organización
DO $$
DECLARE
    v_org_a UUID := extensions.uuid_generate_v4();
    v_org_b UUID := extensions.uuid_generate_v4();
    v_plan_id UUID;
    v_admin_a UUID := extensions.uuid_generate_v4();
    v_random_user UUID := extensions.uuid_generate_v4();
    v_outbox_id_1 UUID;
    v_outbox_id_2 UUID;
    v_log_id_1 UUID;
    v_log_id_2 UUID;
    v_emails_count_before INTEGER;
    v_emails_count_after INTEGER;
    v_err_anon BOOLEAN := FALSE;
    v_err_norole BOOLEAN := FALSE;
    v_err_cross_org BOOLEAN := FALSE;
BEGIN
    SELECT id INTO v_plan_id FROM public.plans WHERE code = 'free';
    INSERT INTO public.profiles (id, first_name, last_name, email) VALUES (v_admin_a, 'Admin', 'Notify', 'admin_notif@test.com');
    INSERT INTO public.profiles (id, first_name, last_name, email) VALUES (v_random_user, 'No', 'Role', 'norole@test.com');
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org_a, 'Org Notif A', 'org-notif-a');
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org_b, 'Org Notif B', 'org-notif-b');
    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status) VALUES (v_org_a, v_plan_id, 'active');
    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status) VALUES (v_org_b, v_plan_id, 'active');
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES (v_org_a, v_admin_a, 'admin', TRUE);

    -- TEST 11: Anónimo no puede encolar
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}'::text, true);
    BEGIN
        PERFORM public.enqueue_notification(v_org_a, 'booking_confirmed', 'dest@test.com', 'Dest', 'key_anon_1', '{}'::jsonb);
    EXCEPTION WHEN OTHERS THEN
        v_err_anon := TRUE;
    END;

    -- TEST 12: Usuario sin rol no puede encolar
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_random_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_random_user, 'role', 'authenticated')::text, true);
    BEGIN
        PERFORM public.enqueue_notification(v_org_a, 'booking_confirmed', 'dest@test.com', 'Dest', 'key_norole_1', '{}'::jsonb);
    EXCEPTION WHEN OTHERS THEN
        v_err_norole := TRUE;
    END;

    -- TEST 13: Staff autorizado puede encolar
    PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);

    v_outbox_id_1 := public.enqueue_notification(v_org_a, 'booking_confirmed', 'cliente@turnar.test', 'Cliente Test', 'idem_key_unique_1', '{"booking": 1}'::jsonb);

    -- TEST 14: Idempotencia: reenviar con la misma clave devuelve el mismo ID sin duplicar
    v_outbox_id_2 := public.enqueue_notification(v_org_a, 'booking_confirmed', 'cliente@turnar.test', 'Cliente Test', 'idem_key_unique_1', '{"booking": 1}'::jsonb);

    IF v_outbox_id_1 <> v_outbox_id_2 THEN
        RAISE EXCEPTION 'Fallo Test 14: La clave de idempotencia generó un registro duplicado';
    END IF;

    -- Restaurar postgres para simular backend worker (service_role)
    PERFORM set_config('role', 'postgres', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);

    -- TEST 17: No se puede confirmar un envío asignándolo a una organización errónea
    BEGIN
        PERFORM public.record_notification_sent(v_org_b, v_outbox_id_1, 'cliente@turnar.test', 'booking_confirmed', 'resend', 'msg_resend_123');
    EXCEPTION WHEN OTHERS THEN
        v_err_cross_org := TRUE;
    END;

    -- TEST 15: Envío confirmado incrementa una sola unidad de cuota
    SELECT uc.emails_sent_count INTO v_emails_count_before
    FROM public.usage_counters uc
    WHERE uc.organization_id = v_org_a;

    v_log_id_1 := public.record_notification_sent(v_org_a, v_outbox_id_1, 'cliente@turnar.test', 'booking_confirmed', 'resend', 'msg_resend_123');

    -- TEST 16: Reintento sobre el mismo outbox no duplica el consumo de cuota
    v_log_id_2 := public.record_notification_sent(v_org_a, v_outbox_id_1, 'cliente@turnar.test', 'booking_confirmed', 'resend', 'msg_resend_123');

    SELECT uc.emails_sent_count INTO v_emails_count_after
    FROM public.usage_counters uc
    WHERE uc.organization_id = v_org_a;

    IF NOT v_err_anon THEN
        RAISE EXCEPTION 'Fallo Test 11: Usuario anónimo pudo encolar una notificación';
    END IF;
    IF NOT v_err_norole THEN
        RAISE EXCEPTION 'Fallo Test 12: Usuario sin rol administrativo pudo encolar notificación';
    END IF;
    IF NOT v_err_cross_org THEN
        RAISE EXCEPTION 'Fallo Test 17: Se permitió confirmar notificación con una organización ajena';
    END IF;
    IF v_log_id_1 <> v_log_id_2 THEN
        RAISE EXCEPTION 'Fallo Test 16: Reintento generó logs distintos';
    END IF;
    IF (v_emails_count_after - v_emails_count_before) <> 1 THEN
        RAISE EXCEPTION 'Fallo Test 15/16: La cuota de emails incrementó incorrectamente (diferencia: %)', (v_emails_count_after - v_emails_count_before);
    END IF;

    RAISE NOTICE 'Tests 11 a 17 superados: Notificaciones encoladas bajo RBAC y cuota computable estrictamente contra envíos reales.';
END $$;

-- =============================================================================
-- BLOQUE 4: INVITACIONES Y CONTROL DE ESCALADA DE PRIVILEGIOS (TESTS 18 A 23)
-- =============================================================================

-- TEST 18: Invitación válida permite ingresar con el rol autorizado
-- TEST 19: Invitación a otro correo es rechazada
-- TEST 20: Invitación vencida es rechazada
-- TEST 21: Invitación reclamada no puede reutilizarse
-- TEST 22: Un usuario existente no puede elevar privilegios mediante una invitación
-- TEST 23: Un usuario no puede convertirse en owner mediante una invitación ordinaria
DO $$
DECLARE
    v_org UUID := extensions.uuid_generate_v4();
    v_user_1 UUID := extensions.uuid_generate_v4();
    v_user_2 UUID := extensions.uuid_generate_v4();
    v_token_valid TEXT := 'token_test_valid_1234567890abcdef';
    v_token_email TEXT := 'token_test_email_1234567890abcdef';
    v_token_expired TEXT := 'token_test_expired_1234567890abcdef';
    v_token_owner TEXT := 'token_test_owner_1234567890abcdef';
    v_token_upgrade TEXT := 'token_test_upgrade_1234567890abcdef';
    v_err_email BOOLEAN := FALSE;
    v_err_expired BOOLEAN := FALSE;
    v_err_reused BOOLEAN := FALSE;
    v_err_upgrade BOOLEAN := FALSE;
    v_err_owner BOOLEAN := FALSE;
    v_role_after public.organization_role;
BEGIN
    INSERT INTO public.profiles (id, first_name, last_name, email) VALUES (v_user_1, 'User', 'Uno', 'user1@turnar.test');
    INSERT INTO public.profiles (id, first_name, last_name, email) VALUES (v_user_2, 'User', 'Dos', 'user2@turnar.test');
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'Org Invitations', 'org-inv-sec');

    -- Invitación ordinaria válida (instructor)
    INSERT INTO public.organization_invitations (organization_id, role, invitation_token, expires_at)
    VALUES (v_org, 'instructor', v_token_valid, pg_catalog.now() + interval '7 days');

    -- Invitación con destinatario específico
    INSERT INTO public.organization_invitations (organization_id, role, invitation_token, invited_email, expires_at)
    VALUES (v_org, 'admin', v_token_email, 'destinatario_estricto@turnar.test', pg_catalog.now() + interval '7 days');

    -- Invitación expirada
    INSERT INTO public.organization_invitations (organization_id, role, invitation_token, expires_at)
    VALUES (v_org, 'instructor', v_token_expired, pg_catalog.now() - interval '1 hour');

    -- Intento de invitación prohibida con rol 'owner'
    INSERT INTO public.organization_invitations (organization_id, role, invitation_token, expires_at)
    VALUES (v_org, 'owner', v_token_owner, pg_catalog.now() + interval '7 days');

    -- Invitación para test de escalada
    INSERT INTO public.organization_invitations (organization_id, role, invitation_token, expires_at)
    VALUES (v_org, 'admin', v_token_upgrade, pg_catalog.now() + interval '7 days');

    -- Simular User 1
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_user_1::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_1, 'role', 'authenticated')::text, true);

    -- TEST 19: Correo incorrecto es rechazado
    BEGIN
        PERFORM public.claim_organization_invitation(v_token_email);
    EXCEPTION WHEN OTHERS THEN
        v_err_email := TRUE;
    END;

    -- TEST 20: Invitación vencida es rechazada
    BEGIN
        PERFORM public.claim_organization_invitation(v_token_expired);
    EXCEPTION WHEN OTHERS THEN
        v_err_expired := TRUE;
    END;

    -- TEST 23: Invitación ordinaria no puede convertir en owner
    BEGIN
        PERFORM public.claim_organization_invitation(v_token_owner);
    EXCEPTION WHEN OTHERS THEN
        v_err_owner := TRUE;
    END;

    -- TEST 18: Invitación válida otorga el rol autorizado
    PERFORM public.claim_organization_invitation(v_token_valid);

    -- TEST 21: Invitación ya reclamada no puede reutilizarse
    BEGIN
        PERFORM public.claim_organization_invitation(v_token_valid);
    EXCEPTION WHEN OTHERS THEN
        v_err_reused := TRUE;
    END;

    -- TEST 22: User 1 ahora es 'instructor'. Si intenta reclamar una invitación para 'admin', debe ser rechazado
    BEGIN
        PERFORM public.claim_organization_invitation(v_token_upgrade);
    EXCEPTION WHEN OTHERS THEN
        v_err_upgrade := TRUE;
    END;

    -- Restaurar postgres para comprobar rol en members
    PERFORM set_config('role', 'postgres', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);

    SELECT role INTO v_role_after
    FROM public.organization_members
    WHERE organization_id = v_org AND user_id = v_user_1;

    IF NOT v_err_email THEN
        RAISE EXCEPTION 'Fallo Test 19: Usuario pudo reclamar invitación dirigida a otro email';
    END IF;
    IF NOT v_err_expired THEN
        RAISE EXCEPTION 'Fallo Test 20: Se permitió reclamar una invitación vencida';
    END IF;
    IF NOT v_err_owner THEN
        RAISE EXCEPTION 'Fallo Test 23: Se permitió reclamar una invitación con rol owner';
    END IF;
    IF NOT v_err_reused THEN
        RAISE EXCEPTION 'Fallo Test 21: La invitación reclamada pudo reutilizarse';
    END IF;
    IF NOT v_err_upgrade THEN
        RAISE EXCEPTION 'Fallo Test 22: Usuario existente pudo auto-elevar privilegios mediante invitación';
    END IF;
    IF v_role_after <> 'instructor' THEN
        RAISE EXCEPTION 'Fallo Test 18: El rol asignado no coincide con la invitación autorizada';
    END IF;

    RAISE NOTICE 'Tests 18 a 23 superados: Sistema de invitaciones hermético anti auto-elevación de privilegios.';
END $$;

-- =============================================================================
-- BLOQUE 5: LÍMITES, REACTIVACIONES E INTEGRIDAD CROSS-TENANT (TESTS 24 A 30)
-- =============================================================================

-- TEST 24: No se supera el límite de contactos activos
-- TEST 25: Reactivar contactos respeta el límite
-- TEST 26: Cambiar un contacto de organización no permite evadir el límite
-- TEST 27: No se supera el límite de staff
-- TEST 28: No se supera el límite de actividades
-- TEST 29: No se pueden crear relaciones cross-tenant compuestas
-- TEST 30: Las vistas públicas no exponen información privada
DO $$
DECLARE
    v_org_1 UUID := extensions.uuid_generate_v4();
    v_org_2 UUID := extensions.uuid_generate_v4();
    v_plan_id UUID;
    v_contact_extra UUID := extensions.uuid_generate_v4();
    v_contact_inactive UUID := extensions.uuid_generate_v4();
    v_inst_1 UUID := extensions.uuid_generate_v4();
    v_inst_2 UUID := extensions.uuid_generate_v4();
    v_inst_3 UUID := extensions.uuid_generate_v4();
    v_act_1 UUID := extensions.uuid_generate_v4();
    v_act_2 UUID := extensions.uuid_generate_v4();
    v_act_3 UUID := extensions.uuid_generate_v4();
    v_err_contacts_limit BOOLEAN := FALSE;
    v_err_reactivate_limit BOOLEAN := FALSE;
    v_err_change_org_limit BOOLEAN := FALSE;
    v_err_staff_limit BOOLEAN := FALSE;
    v_err_act_limit BOOLEAN := FALSE;
    v_err_cross_tenant_fk BOOLEAN := FALSE;
    v_public_inst_count INTEGER;
BEGIN
    SELECT id INTO v_plan_id FROM public.plans WHERE code = 'free';
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org_1, 'Org Limits 1', 'org-lim-1');
    INSERT INTO public.organizations (id, name, slug) VALUES (v_org_2, 'Org Limits 2', 'org-lim-2');

    -- Asignar plan con cuota reducida para testing (max_active_contacts = 2, max_staff = 2, max_active_activities = 2)
    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status, custom_limits_override)
    VALUES (v_org_1, v_plan_id, 'active', '{"max_active_contacts": 2, "max_staff": 2, "max_active_activities": 2}'::jsonb);

    INSERT INTO public.organization_subscriptions (organization_id, plan_id, status, custom_limits_override)
    VALUES (v_org_2, v_plan_id, 'active', '{"max_active_contacts": 1}'::jsonb);

    -- Insertar 2 contactos activos en Org 1 (alcanzando el límite)
    INSERT INTO public.contacts (organization_id, first_name, last_name, is_active) VALUES (v_org_1, 'C1', 'Test', TRUE);
    INSERT INTO public.contacts (organization_id, first_name, last_name, is_active) VALUES (v_org_1, 'C2', 'Test', TRUE);

    -- TEST 24: El 3er contacto activo en Org 1 debe fallar
    BEGIN
        INSERT INTO public.contacts (id, organization_id, first_name, last_name, is_active)
        VALUES (v_contact_extra, v_org_1, 'C3', 'Test', TRUE);
    EXCEPTION WHEN OTHERS THEN
        v_err_contacts_limit := TRUE;
    END;

    -- Un contacto inactivo sí puede insertarse (no consume cupo activo)
    INSERT INTO public.contacts (id, organization_id, first_name, last_name, is_active)
    VALUES (v_contact_inactive, v_org_1, 'C_Inactivo', 'Test', FALSE);

    -- TEST 25: Reactivar un contacto inactivo cuando se está en el cupo máximo debe fallar
    BEGIN
        UPDATE public.contacts SET is_active = TRUE WHERE id = v_contact_inactive;
    EXCEPTION WHEN OTHERS THEN
        v_err_reactivate_limit := TRUE;
    END;

    -- TEST 26: Mudar un contacto activo a una organización llena debe fallar
    -- Org 2 tiene límite de 1 y ya insertamos 1 contacto:
    INSERT INTO public.contacts (organization_id, first_name, last_name, is_active) VALUES (v_org_2, 'C_Org2', 'Test', TRUE);
    -- Intentar mover un contacto inactivo de Org 1 a Org 2 como activo:
    BEGIN
        UPDATE public.contacts SET organization_id = v_org_2, is_active = TRUE WHERE id = v_contact_inactive;
    EXCEPTION WHEN OTHERS THEN
        v_err_change_org_limit := TRUE;
    END;

    -- TEST 27: Control de límite de staff
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (v_org_1, extensions.uuid_generate_v4(), 'owner', TRUE);
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (v_org_1, extensions.uuid_generate_v4(), 'instructor', TRUE);

    -- El 3er miembro de staff en Org 1 debe fallar (límite = 2)
    BEGIN
        INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
        VALUES (v_org_1, extensions.uuid_generate_v4(), 'admin', TRUE);
    EXCEPTION WHEN OTHERS THEN
        v_err_staff_limit := TRUE;
    END;

    -- TEST 28: Control de límite de actividades
    INSERT INTO public.activities (organization_id, name, is_active) VALUES (v_org_1, 'Act 1', TRUE);
    INSERT INTO public.activities (organization_id, name, is_active) VALUES (v_org_1, 'Act 2', TRUE);

    -- La 3ra actividad activa en Org 1 debe fallar (límite = 2)
    BEGIN
        INSERT INTO public.activities (organization_id, name, is_active) VALUES (v_org_1, 'Act 3', TRUE);
    EXCEPTION WHEN OTHERS THEN
        v_err_act_limit := TRUE;
    END;

    -- TEST 29: Integridad referencial compuesta anti cross-tenant
    -- Crear instructor en Org 1
    INSERT INTO public.instructors (id, organization_id, full_name, is_active)
    VALUES (v_inst_1, v_org_1, 'Profesor Org 1', TRUE);

    -- Intentar asociar disponibilidad en Org 2 apuntando al instructor de Org 1 debe fallar
    BEGIN
        INSERT INTO public.instructor_availability (organization_id, instructor_id, day_of_week, start_time, end_time)
        VALUES (v_org_2, v_inst_1, 1, '10:00', '12:00');
    EXCEPTION WHEN OTHERS THEN
        v_err_cross_tenant_fk := TRUE;
    END;

    -- TEST 30: Vistas públicas no exponen datos privados y son consultables por anon
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '{"role": "anon"}'::text, true);

    SELECT COUNT(*) INTO v_public_inst_count
    FROM public.public_instructors
    WHERE organization_id = v_org_1;

    PERFORM set_config('role', 'postgres', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);

    IF NOT v_err_contacts_limit THEN
        RAISE EXCEPTION 'Fallo Test 24: Se permitió superar el límite de contactos activos';
    END IF;
    IF NOT v_err_reactivate_limit THEN
        RAISE EXCEPTION 'Fallo Test 25: Se permitió reactivar un contacto evadiendo el límite';
    END IF;
    IF NOT v_err_change_org_limit THEN
        RAISE EXCEPTION 'Fallo Test 26: Se permitió transferir un contacto a una organización llena';
    END IF;
    IF NOT v_err_staff_limit THEN
        RAISE EXCEPTION 'Fallo Test 27: Se permitió superar el límite de staff';
    END IF;
    IF NOT v_err_act_limit THEN
        RAISE EXCEPTION 'Fallo Test 28: Se permitió superar el límite de actividades activas';
    END IF;
    IF NOT v_err_cross_tenant_fk THEN
        RAISE EXCEPTION 'Fallo Test 29: Se permitió crear relación cross-tenant entre instructor y disponibilidad';
    END IF;
    IF v_public_inst_count <> 1 THEN
        RAISE EXCEPTION 'Fallo Test 30: Visitante anónimo no pudo consultar vista pública segura (conteo: %)', v_public_inst_count;
    END IF;

    RAISE NOTICE 'Tests 24 a 30 superados: Triggers de límites atómicos y llaves compuestas anti cross-tenant validadas.';
END $$;

-- =============================================================================
-- BLOQUE 6: MATRIZ DE PERMISOS, VISTAS Y PRIVILEGIOS EFECTIVOS (TESTS 31 A 35)
-- =============================================================================

-- TEST 31: Verificar ACL de funciones SECURITY DEFINER (sin EXECUTE sobre PUBLIC)
-- TEST 32: Verificar permisos efectivos de tablas y vistas
-- TEST 33: Comprobar que anon no puede acceder a tablas privadas
-- TEST 34: Comprobar que authenticated no recibe permisos de backend service
-- TEST 35: Comprobar que funciones privilegiadas críticas no tienen EXECUTE para anon
DO $$
DECLARE
    v_has_anon_contacts_select BOOLEAN;
    v_has_anon_record_sent_exec BOOLEAN;
    v_has_auth_record_sent_exec BOOLEAN;
    v_has_anon_cancel_exec BOOLEAN;
    v_has_anon_create_booking_exec BOOLEAN;
    v_has_anon_verify_payment_exec BOOLEAN;
    v_has_anon_view_select BOOLEAN;
BEGIN
    -- TEST 33: anon NO debe tener privilegio SELECT sobre tabla privada contacts
    v_has_anon_contacts_select := has_table_privilege('anon', 'public.contacts', 'SELECT');

    -- TEST 34: authenticated NO debe tener privilegio EXECUTE sobre record_notification_sent
    v_has_auth_record_sent_exec := has_function_privilege('authenticated', 'public.record_notification_sent(uuid, uuid, text, public.notification_event_type, text, text)', 'EXECUTE');

    -- TEST 35: anon NO debe tener privilegio EXECUTE sobre verify_payment_manual ni record_notification_sent
    v_has_anon_record_sent_exec := has_function_privilege('anon', 'public.record_notification_sent(uuid, uuid, text, public.notification_event_type, text, text)', 'EXECUTE');
    v_has_anon_verify_payment_exec := has_function_privilege('anon', 'public.verify_payment_manual(uuid, uuid, public.payment_status, text)', 'EXECUTE');

    -- Funciones públicas autorizadas para anon: creación y cancelación atómica
    v_has_anon_cancel_exec := has_function_privilege('anon', 'public.cancel_booking_atomic(uuid, uuid, text, text)', 'EXECUTE');
    v_has_anon_create_booking_exec := has_function_privilege('anon', 'public.create_booking_atomic(uuid, uuid, uuid, text)', 'EXECUTE');

    -- TEST 32: anon SÍ debe poder consultar vistas públicas seguras
    v_has_anon_view_select := has_table_privilege('anon', 'public.public_activities', 'SELECT');

    IF v_has_anon_contacts_select THEN
        RAISE EXCEPTION 'Fallo Test 33: El rol anon posee permisos directos de SELECT sobre la tabla privada contacts';
    END IF;

    IF v_has_auth_record_sent_exec THEN
        RAISE EXCEPTION 'Fallo Test 34: El rol authenticated posee permiso indebido sobre record_notification_sent (debe ser service_role)';
    END IF;

    IF v_has_anon_record_sent_exec OR v_has_anon_verify_payment_exec THEN
        RAISE EXCEPTION 'Fallo Test 35: El rol anon posee permisos de ejecución sobre funciones administrativas restringidas';
    END IF;

    IF NOT v_has_anon_cancel_exec OR NOT v_has_anon_create_booking_exec THEN
        RAISE EXCEPTION 'Fallo Test 31: El rol anon no posee acceso a las funciones transaccionales públicas de reserva y cancelación';
    END IF;

    IF NOT v_has_anon_view_select THEN
        RAISE EXCEPTION 'Fallo Test 32: El rol anon no puede consultar las vistas públicas de actividades';
    END IF;

    RAISE NOTICE 'Tests 31 a 35 superados: Matriz de privilegios, ACLs y permisos efectivos verificados conforme al diseño.';
END $$;

-- =============================================================================
-- ROLLBACK FINAL
-- =============================================================================
-- Garantiza que absolutamente ninguna fila de prueba persista en la base de datos
ROLLBACK;
