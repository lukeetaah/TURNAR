-- =============================================================================
-- TURNAR - MIGRACIÓN 001: NÚCLEO MULTI-TENANT Y PERMISOS
-- Creado por LUKSONARTS
-- =============================================================================

-- Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- -----------------------------------------------------------------------------
-- 1. TABLA: PROFILES
-- Extiende la tabla auth.users de Supabase
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email CITEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_platform_admin) WHERE is_platform_admin = TRUE;

-- -----------------------------------------------------------------------------
-- 2. TABLA: ORGANIZATIONS
-- Cada espacio de trabajo multi-tenant
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug CITEXT NOT NULL UNIQUE,
    description TEXT,
    activity_category TEXT,
    logo_url TEXT,
    banner_url TEXT,
    phone TEXT,
    email CITEXT,
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_custom_setup BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_active ON public.organizations(is_active);

-- -----------------------------------------------------------------------------
-- 3. TABLA: ORGANIZATION_MEMBERS
-- Pertenencia y roles por organización
-- Roles: owner, admin, instructor, client
-- -----------------------------------------------------------------------------
CREATE TYPE public.organization_role AS ENUM ('owner', 'admin', 'instructor', 'client');

CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role public.organization_role NOT NULL DEFAULT 'client',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_lookup ON public.organization_members(organization_id, user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);

-- -----------------------------------------------------------------------------
-- 4. TABLA: ORGANIZATION_SETTINGS
-- Configuraciones específicas de la organización
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_settings (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    cancellation_notice_hours INTEGER NOT NULL DEFAULT 24,
    allow_waitlist BOOLEAN NOT NULL DEFAULT TRUE,
    auto_confirm_bookings BOOLEAN NOT NULL DEFAULT TRUE,
    contact_phone_public BOOLEAN NOT NULL DEFAULT TRUE,
    contact_email_public BOOLEAN NOT NULL DEFAULT TRUE,
    currency_symbol TEXT NOT NULL DEFAULT '$',
    accent_color TEXT DEFAULT '#d86641',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 5. TABLA: ORGANIZATION_MODULES
-- Módulos activados por cada organización
-- -----------------------------------------------------------------------------
CREATE TYPE public.module_key AS ENUM (
    'agenda',
    'bookings',
    'clients',
    'instructors',
    'activities',
    'payments',
    'communications',
    'announcements',
    'events',
    'community'
);

CREATE TABLE IF NOT EXISTS public.organization_modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    module_key public.module_key NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_org_modules_active ON public.organization_modules(organization_id, module_key, is_enabled);

-- -----------------------------------------------------------------------------
-- 6. FUNCIONES DE AYUDA DE AUTORIZACIÓN (SECURITY DEFINER)
-- -----------------------------------------------------------------------------

-- Verifica si el usuario actual es administrador de plataforma (TURNAR Admin)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_platform_admin = TRUE
    );
$$;

-- Verifica si el usuario actual es miembro activo de una organización con roles requeridos
CREATE OR REPLACE FUNCTION public.has_org_role(
    target_org_id UUID,
    required_roles public.organization_role[]
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = target_org_id
          AND user_id = auth.uid()
          AND is_active = TRUE
          AND role = ANY(required_roles)
    );
$$;

-- Verifica membresía básica en una organización
CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT public.has_org_role(target_org_id, ARRAY['owner', 'admin', 'instructor', 'client']::public.organization_role[]);
$$;
