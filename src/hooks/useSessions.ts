import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface Session {
  id: string;
  organization_id: string;
  activity_id: string;
  instructor_id: string | null;
  start_time: string;
  end_time: string;
  capacity: number;
  booked_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export const useSessions = (orgId: string | null, activityId?: string | null) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!supabase || !orgId) { setLoading(false); return; }
    setLoading(true);
    let q = supabase
      .from('activity_sessions')
      .select('*, activities(name, duration_minutes)')
      .eq('organization_id', orgId)
      .order('start_time');
    if (activityId) q = q.eq('activity_id', activityId);
    const { data, error: err } = await q;
    if (err) setError(err.message);
    else setSessions((data as Session[]) ?? []);
    setLoading(false);
  }, [orgId, activityId]);

  useEffect(() => { fetch(); }, [fetch]);

  const createSession = async (payload: Partial<Session>) => {
    if (!supabase || !orgId) return { error: 'No configurado' };
    const { error: err } = await supabase.from('activity_sessions').insert({
      ...payload,
      organization_id: orgId,
    });
    if (!err) await fetch();
    return { error: err?.message ?? null };
  };

  const updateSession = async (id: string, payload: Partial<Session>) => {
    if (!supabase) return { error: 'No configurado' };
    const { error: err } = await supabase
      .from('activity_sessions')
      .update(payload)
      .eq('id', id);
    if (!err) await fetch();
    return { error: err?.message ?? null };
  };

  return { sessions, loading, error, refetch: fetch, createSession, updateSession };
};
