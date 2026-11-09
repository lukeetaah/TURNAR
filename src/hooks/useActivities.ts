import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface Activity {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  default_capacity: number;
  price_cents: number;
  is_public: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const useActivities = (orgId: string | null) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!supabase || !orgId) { setLoading(false); return; }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('activities')
      .select('*')
      .eq('organization_id', orgId)
      .order('name');
    if (err) setError(err.message);
    else setActivities((data as Activity[]) ?? []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetch(); }, [fetch]);

  const createActivity = async (payload: Partial<Activity>) => {
    if (!supabase || !orgId) return { error: 'No configurado' };
    const { error: err } = await supabase.from('activities').insert({
      ...payload,
      organization_id: orgId,
    });
    if (!err) await fetch();
    return { error: err?.message ?? null };
  };

  const updateActivity = async (id: string, payload: Partial<Activity>) => {
    if (!supabase) return { error: 'No configurado' };
    const { error: err } = await supabase
      .from('activities')
      .update(payload)
      .eq('id', id);
    if (!err) await fetch();
    return { error: err?.message ?? null };
  };

  return { activities, loading, error, refetch: fetch, createActivity, updateActivity };
};
