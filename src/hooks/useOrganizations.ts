import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface OrgMembership {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  activity_category: string | null;
  role: string;
  plan_id: string | null;
}

export const useOrganizations = () => {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('organization_members')
      .select(`
        role,
        organizations (
          id,
          slug,
          name,
          logo_url,
          activity_category,
          plan_id
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (err) {
      setError(err.message);
    } else {
      setOrgs(
        (data ?? []).flatMap((m: any) => {
          if (!m.organizations) return [];
          const org = m.organizations as {
            id: string;
            slug: string;
            name: string;
            logo_url: string | null;
            activity_category: string | null;
            plan_id: string | null;
          };
          return [{ ...org, role: m.role }];
        })
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { orgs, loading, error, refetch: fetch };
};
