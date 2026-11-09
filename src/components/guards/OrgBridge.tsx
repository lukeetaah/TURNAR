import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';
import { useOrganizations } from '@/hooks/useOrganizations';

/**
 * This component bridges the URL parameter (:orgSlug)
 * with OrgContext — it finds the org, sets it in context,
 * and renders children or redirects.
 */
export const OrgBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { orgs, loading } = useOrganizations();
  const { orgId, setOrg } = useOrg();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50">
        <span className="w-5 h-5 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const matched = orgs.find((o) => o.slug === orgSlug);

  if (!matched) {
    return <Navigate to="/app" replace />;
  }

  // Set context if changed
  if (matched.id !== orgId) {
    setOrg({ id: matched.id, slug: matched.slug, name: matched.name, role: matched.role });
  }

  return <>{children}</>;
};
