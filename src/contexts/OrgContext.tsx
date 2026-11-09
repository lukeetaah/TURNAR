import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface OrgMembership {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  activity_category: string | null;
  role: string;
}

interface OrgContextValue {
  orgs: OrgMembership[];
  loading: boolean;
  error: string | null;
  orgId: string | null;
  orgSlug: string | null;
  orgName: string | null;
  orgRole: string | null;
  currentOrg: OrgMembership | null;
  setOrg: (org: { id: string; slug: string; name: string; role: string } | null) => void;
  refetchOrgs: () => Promise<OrgMembership[]>;
  claimInvite: (token: string) => Promise<{ error: string | null; orgId: string | null }>;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export const OrgProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgRole, setOrgRole] = useState<string | null>(null);

  const fetchOrgs = useCallback(async (): Promise<OrgMembership[]> => {
    if (!supabase || !user) {
      setOrgs([]);
      setLoading(false);
      return [];
    }

    setLoading(true);
    setError(null);

    // Consulta de membresías sin la columna inexistente 'plan_id'
    const { data, error: err } = await supabase
      .from('organization_members')
      .select(`
        role,
        organizations (
          id,
          slug,
          name,
          logo_url,
          activity_category
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true);

    let parsedOrgs: OrgMembership[] = [];

    if (err) {
      setError(err.message);
    } else if (data) {
      parsedOrgs = (data as any[]).flatMap((m) => {
        if (!m.organizations) return [];
        return [{
          id: m.organizations.id,
          slug: m.organizations.slug,
          name: m.organizations.name,
          logo_url: m.organizations.logo_url || null,
          activity_category: m.organizations.activity_category || null,
          role: m.role,
        }];
      });
      setOrgs(parsedOrgs);
    }

    setLoading(false);
    return parsedOrgs;
  }, [user]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const setOrg = (org: { id: string; slug: string; name: string; role: string } | null) => {
    setOrgId(org?.id ?? null);
    setOrgSlug(org?.slug ?? null);
    setOrgName(org?.name ?? null);
    setOrgRole(org?.role ?? null);
  };

  const claimInvite = async (token: string): Promise<{ error: string | null; orgId: string | null }> => {
    if (!supabase) return { error: 'Supabase no configurado', orgId: null };

    const cleanToken = token.trim();
    if (!cleanToken) return { error: 'Ingresá un token de invitación válido.', orgId: null };

    const { data, error: err } = await supabase.rpc('claim_organization_invitation', {
      p_token: cleanToken,
    });

    if (err) {
      return { error: err.message, orgId: null };
    }

    // Actualizar inmediatamente la lista global de organizaciones
    await fetchOrgs();
    return { error: null, orgId: data as string };
  };

  const currentOrg = orgs.find((o) => o.id === orgId || o.slug === orgSlug) || null;

  return (
    <OrgContext.Provider
      value={{
        orgs,
        loading,
        error,
        orgId,
        orgSlug,
        orgName,
        orgRole,
        currentOrg,
        setOrg,
        refetchOrgs: fetchOrgs,
        claimInvite,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
};

export const useOrg = () => {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
};
