import React, { createContext, useContext, useState } from 'react';

interface OrgContextValue {
  orgId: string | null;
  orgSlug: string | null;
  orgName: string | null;
  orgRole: string | null;
  setOrg: (org: { id: string; slug: string; name: string; role: string } | null) => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export const OrgProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgRole, setOrgRole] = useState<string | null>(null);

  const setOrg = (org: { id: string; slug: string; name: string; role: string } | null) => {
    setOrgId(org?.id ?? null);
    setOrgSlug(org?.slug ?? null);
    setOrgName(org?.name ?? null);
    setOrgRole(org?.role ?? null);
  };

  return (
    <OrgContext.Provider value={{ orgId, orgSlug, orgName, orgRole, setOrg }}>
      {children}
    </OrgContext.Provider>
  );
};

export const useOrg = () => {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
};
