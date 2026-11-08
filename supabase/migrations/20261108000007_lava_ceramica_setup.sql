-- =============================================================================
-- TURNAR - MIGRACIÓN 007: ORGANIZACIÓN PILOTO (LAVA CERÁMICA) E INVITACIONES
-- Creado por LUKSONARTS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA: ORGANIZATION_INVITATIONS
-- Flujo de invitaciones seguras sin crear cuentas ficticias previas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role public.organization_role NOT NULL DEFAULT 'admin',
    invitation_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    invited_email CITEXT, -- Puede ser NULL para invitaciones mediante enlace seguro de inicialización
    claimed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.organization_invitations(invitation_token)
WHERE is_claimed = FALSE;

-- -----------------------------------------------------------------------------
-- 2. PROCEDIMIENTO SEGURO: RECLAMAR INVITACIÓN
-- Vincula al usuario autenticado como miembro con el rol correspondiente
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_organization_invitation(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invitation RECORD;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Debés iniciar sesión para reclamar esta invitación.';
    END IF;

    SELECT id, organization_id, role, is_claimed, expires_at
    INTO v_invitation
    FROM public.organization_invitations
    WHERE invitation_token = p_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La invitación no es válida o no existe.';
    END IF;

    IF v_invitation.is_claimed THEN
        RAISE EXCEPTION 'Esta invitación ya ha sido utilizada.';
    END IF;

    IF v_invitation.expires_at < NOW() THEN
        RAISE EXCEPTION 'La invitación ha expirado.';
    END IF;

    -- Agregar como miembro de la organización
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (v_invitation.organization_id, v_user_id, v_invitation.role, TRUE)
    ON CONFLICT (organization_id, user_id)
    DO UPDATE SET role = EXCLUDED.role, is_active = TRUE, updated_at = NOW();

    -- Marcar invitación como reclamada
    UPDATE public.organization_invitations
    SET is_claimed = TRUE,
        claimed_by = v_user_id,
        claimed_at = NOW()
    WHERE id = v_invitation.id;

    RETURN v_invitation.organization_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. INICIALIZACIÓN CONTROLADA DE LAVA CERÁMICA (Sin identidades ficticias)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_lava_id UUID;
    v_free_plan_id UUID;
BEGIN
    -- 1. Insertar organización LAVA CERÁMICA si no existe
    SELECT id INTO v_lava_id FROM public.organizations WHERE slug = 'lava-ceramica';
    
    IF v_lava_id IS NULL THEN
        INSERT INTO public.organizations (
            name,
            slug,
            description,
            activity_category,
            is_active,
            is_custom_setup
        ) VALUES (
            'LAVA CERÁMICA',
            'lava-ceramica',
            'Taller de cerámica. Clases regulares para adultos y niños, turnos de mañana y tarde.',
            'Taller de Cerámica',
            TRUE,
            TRUE
        ) RETURNING id INTO v_lava_id;

        -- 2. Configuración específica de LAVA CERÁMICA
        INSERT INTO public.organization_settings (
            organization_id,
            cancellation_notice_hours,
            allow_waitlist,
            auto_confirm_bookings,
            currency_symbol,
            accent_color
        ) VALUES (
            v_lava_id,
            24,
            TRUE,
            TRUE,
            '$',
            '#d86641' -- Color terracota representativo
        ) ON CONFLICT (organization_id) DO NOTHING;

        -- 3. Habilitar módulos de LAVA CERÁMICA
        INSERT INTO public.organization_modules (organization_id, module_key, is_enabled)
        VALUES
            (v_lava_id, 'activities', TRUE),
            (v_lava_id, 'instructors', TRUE),
            (v_lava_id, 'agenda', TRUE),
            (v_lava_id, 'bookings', TRUE),
            (v_lava_id, 'clients', TRUE),
            (v_lava_id, 'payments', TRUE),
            (v_lava_id, 'announcements', TRUE),
            (v_lava_id, 'events', TRUE),
            (v_lava_id, 'communications', TRUE)
        ON CONFLICT (organization_id, module_key) DO NOTHING;

        -- 4. Asignar suscripción con parámetros acordados para piloto LAVA
        SELECT id INTO v_free_plan_id FROM public.plans WHERE code = 'free';

        IF v_free_plan_id IS NOT NULL THEN
            INSERT INTO public.organization_subscriptions (
                organization_id,
                plan_id,
                status,
                custom_limits_override,
                notes
            ) VALUES (
                v_lava_id,
                v_free_plan_id,
                'active',
                '{"max_staff": 4, "max_active_contacts": 300, "max_monthly_bookings": 600}'::JSONB,
                'Configuración acordada para piloto LAVA CERÁMICA (2 administradores + 2 profesores)'
            ) ON CONFLICT (organization_id) DO NOTHING;
        END IF;

        -- 5. Generar token de invitación inicial para el primer Administrador de LAVA CERÁMICA
        -- (No inventamos correos ni contraseñas; se entrega mediante este token seguro)
        INSERT INTO public.organization_invitations (
            organization_id,
            role,
            invited_email,
            expires_at
        ) VALUES (
            v_lava_id,
            'owner',
            NULL,
            NOW() + INTERVAL '90 days'
        );
    END IF;
END $$;
