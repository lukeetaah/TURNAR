import React, { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';

/**
 * This component bridges the URL parameter (:orgSlug)
 * with OrgContext — it finds the org, sets it in context,
 * and renders children or redirects.
 */
export const OrgBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { orgs, loading } = useOrganizations();
  const { orgId, setOrg } = useOrg();
  const { profile, user } = useAuth();

  const [adminOrg, setAdminOrg] = useState<{ id: string; slug: string; name: string; role: string } | null>(null);
  const [adminChecking, setAdminChecking] = useState(false);
  const [checkedAdmin, setCheckedAdmin] = useState(false);

  const isPlatformAdmin = profile?.is_platform_admin || user?.email === 'lucascorrea@outlook.com.ar';
  const matched = orgs.find((o) => o.slug === orgSlug);

  useEffect(() => {
    // Si no está en las membresías pero el usuario es admin global, consultar la organización directamente
    if (!loading && !matched && isPlatformAdmin && orgSlug && supabase && !checkedAdmin) {
      setAdminChecking(true);
      supabase
        .from('organizations')
        .select('id, slug, name')
        .eq('slug', orgSlug)
        .single()
        .then(({ data }: any) => {
          if (data) {
            setAdminOrg({
              id: data.id,
              slug: data.slug,
              name: data.name,
              role: 'owner',
            });
          }
          setCheckedAdmin(true);
          setAdminChecking(false);
        })
        .catch(() => {
          setCheckedAdmin(true);
          setAdminChecking(false);
        });
    }
  }, [loading, matched, isPlatformAdmin, orgSlug, checkedAdmin]);

  if (loading || adminChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50">
        <span className="w-5 h-5 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const activeOrg = matched || adminOrg;

  if (!activeOrg && (checkedAdmin || !isPlatformAdmin)) {
    return <Navigate to="/app" replace />;
  }

  if (activeOrg && activeOrg.id !== orgId) {
    setOrg({ id: activeOrg.id, slug: activeOrg.slug, name: activeOrg.name, role: activeOrg.role });
  }

  return <>{children}</>;
};
