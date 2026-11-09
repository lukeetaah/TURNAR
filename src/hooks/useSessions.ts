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
  activities?: {
    name: string;
    duration_minutes: number;
  };
}

export const useSessions = (orgId: string | null, activityId?: string | null) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!supabase || !orgId) { setLoading(false); return; }
    setLoading(true);

    // 1. Intentar consulta con relación explícita por restricción de integridad
    let q = supabase
      .from('activity_sessions')
      .select('*, activities:activities!fk_sessions_activity_org(name, duration_minutes)')
      .eq('organization_id', orgId)
      .order('start_time');
    if (activityId) q = q.eq('activity_id', activityId);

    const { data, error: err } = await q;

    if (err) {
      // 2. Fallback resiliente: consultar sesiones y actividades por separado y combinar en cliente
      let fallbackQ = supabase
        .from('activity_sessions')
        .select('*')
        .eq('organization_id', orgId)
        .order('start_time');
      if (activityId) fallbackQ = fallbackQ.eq('activity_id', activityId);

      const sessRes = await fallbackQ;
      if (sessRes.error) {
        setError(sessRes.error.message);
        setSessions([]);
      } else {
        const actRes = await supabase
          .from('activities')
          .select('id, name, duration_minutes')
          .eq('organization_id', orgId);

        const actMap = new Map((actRes.data || []).map((a: any) => [a.id, a]));
        const merged = (sessRes.data || []).map((s: any) => ({
          ...s,
          activities: actMap.get(s.activity_id) || { name: 'Actividad', duration_minutes: 60 },
        }));
        setSessions(merged as Session[]);
        setError(null);
      }
    } else {
      setSessions((data as Session[]) ?? []);
      setError(null);
    }
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
