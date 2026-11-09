import { useOrg, type OrgMembership } from '@/contexts/OrgContext';

export type { OrgMembership };

export const useOrganizations = () => {
  const { orgs, loading, error, refetchOrgs, claimInvite } = useOrg();

  return {
    orgs,
    loading,
    error,
    refetch: refetchOrgs,
    claimInvite,
  };
};
