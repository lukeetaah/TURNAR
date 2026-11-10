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
  is_archived?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActivityDependencies {
  activity_id: string;
  activity_name: string;
  is_archived: boolean;
  is_active: boolean;
  schedules_count: number;
  past_sessions_count: number;
  future_sessions_count: number;
  future_sessions_with_bookings: number;
  future_sessions_without_bookings: number;
  confirmed_bookings_count: number;
  active_recurring_count: number;
  has_bookings_or_history: boolean;
  can_delete_safely: boolean;
  can_clean_unbooked_and_archive: boolean;
}

export const useActivities = (orgId: string | null, includeArchived = true) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!supabase || !orgId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase
      .from('activities')
      .select('*')
      .eq('organization_id', orgId);

    if (!includeArchived) {
      query = query.or('is_archived.is.null,is_archived.eq.false');
    }

    const { data, error: err } = await query.order('name');
    if (err) setError(err.message);
    else setActivities((data as Activity[]) ?? []);
    setLoading(false);
  }, [orgId, includeArchived]);

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

  // Modificación simple
  const updateActivity = async (id: string, payload: Partial<Activity>) => {
    if (!supabase) return { error: 'No configurado' };
    const { error: err } = await supabase
      .from('activities')
      .update(payload)
      .eq('id', id);
    if (!err) await fetch();
    return { error: err?.message ?? null };
  };

  // Modificación inteligente con alcance en cascada (Section 3)
  const updateActivityWithScope = async (
    id: string,
    payload: Partial<Activity>,
    scope: 'only_activity' | 'future_unbooked' | 'future_all'
  ) => {
    if (!supabase || !orgId) return { error: 'No configurado', affectedSessions: 0 };

    // 1. Actualizar la definición principal de la actividad
    const { error: actErr } = await supabase
      .from('activities')
      .update(payload)
      .eq('id', id);

    if (actErr) return { error: actErr.message, affectedSessions: 0 };

    let affectedSessions = 0;

    // 2. Si el alcance incluye sesiones futuras
    if (scope !== 'only_activity') {
      const nowIso = new Date().toISOString();
      const sessionUpdates: Record<string, unknown> = {};

      if (payload.default_capacity !== undefined) {
        sessionUpdates.capacity = payload.default_capacity;
      }

      // Si hay actualizaciones aplicables a las sesiones
      if (Object.keys(sessionUpdates).length > 0) {
        let query = supabase
          .from('activity_sessions')
          .update(sessionUpdates)
          .eq('activity_id', id)
          .eq('organization_id', orgId)
          .gte('start_time', nowIso)
          .neq('status', 'cancelled');

        if (scope === 'future_unbooked') {
          query = query.eq('booked_count', 0);
        }

        const { data: updated, error: sessErr } = await query.select('id');
        if (!sessErr && updated) {
          affectedSessions = updated.length;
        }
      }
    }

    await fetch();
    return { error: null, affectedSessions };
  };

  // Análisis profundo de dependencias antes de eliminar o modificar (Section 2.1)
  const analyzeActivityDependencies = async (activityId: string): Promise<ActivityDependencies | null> => {
    if (!supabase || !orgId) return null;

    // 1. Intentar mediante RPC atómica
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('analyze_activity_dependencies', {
        p_organization_id: orgId,
        p_activity_id: activityId,
      });

      if (!rpcErr && rpcData) {
        return rpcData as ActivityDependencies;
      }
    } catch {
      // Fallback en cliente si la migración aún no fue ejecutada
    }

    // 2. Fallback de cliente: consultar tablas relacionadas
    try {
      const targetAct = activities.find((a) => a.id === activityId);
      const nowIso = new Date().toISOString();

      // Horarios habituales
      const { count: schedCount } = await supabase
        .from('activity_schedules')
        .select('*', { count: 'exact', head: true })
        .eq('activity_id', activityId);

      // Sesiones pasadas
      const { count: pastCount } = await supabase
        .from('activity_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('activity_id', activityId)
        .lt('start_time', nowIso);

      // Sesiones futuras
      const { data: futureSessions } = await supabase
        .from('activity_sessions')
        .select('id, booked_count')
        .eq('activity_id', activityId)
        .gte('start_time', nowIso)
        .neq('status', 'cancelled');

      const futureList: Array<{ id: string; booked_count: number | null }> = futureSessions || [];
      const futureTotal = futureList.length;
      const futureWithBookings = futureList.filter((s) => (s.booked_count ?? 0) > 0).length;
      const futureWithoutBookings = futureTotal - futureWithBookings;

      // Recurrencias
      let recurringCount = 0;
      try {
        const { count: recCount } = await supabase
          .from('client_recurring_schedules')
          .select('*', { count: 'exact', head: true })
          .eq('activity_id', activityId)
          .eq('status', 'active');
        recurringCount = recCount || 0;
      } catch {
        // ignore
      }

      const hasHistory = (pastCount ?? 0) > 0 || futureWithBookings > 0;
      const canDeleteSafely = (pastCount ?? 0) === 0 && futureTotal === 0 && (schedCount ?? 0) === 0;

      return {
        activity_id: activityId,
        activity_name: targetAct?.name || 'Actividad',
        is_archived: Boolean(targetAct?.is_archived),
        is_active: Boolean(targetAct?.is_active),
        schedules_count: schedCount || 0,
        past_sessions_count: pastCount || 0,
        future_sessions_count: futureTotal,
        future_sessions_with_bookings: futureWithBookings,
        future_sessions_without_bookings: futureWithoutBookings,
        confirmed_bookings_count: futureWithBookings, // estimado seguro
        active_recurring_count: recurringCount,
        has_bookings_or_history: hasHistory,
        can_delete_safely: canDeleteSafely,
        can_clean_unbooked_and_archive: futureWithoutBookings > 0,
      };
    } catch {
      return null;
    }
  };

  // Archivar actividad (Section 2.3)
  const archiveActivity = async (activityId: string) => {
    if (!supabase || !orgId) return { error: 'No configurado' };

    // Intentar RPC
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('archive_activity', {
        p_organization_id: orgId,
        p_activity_id: activityId,
      });
      if (!rpcErr && rpcData) {
        await fetch();
        return { error: null };
      }
    } catch {
      // Fallback
    }

    // Fallback: actualizar en cliente
    const { error: err } = await supabase
      .from('activities')
      .update({
        is_archived: true,
        is_active: false,
        is_public: false,
      })
      .eq('id', activityId)
      .eq('organization_id', orgId);

    // Pausar schedules
    await supabase
      .from('activity_schedules')
      .update({ is_active: false })
      .eq('activity_id', activityId)
      .eq('organization_id', orgId);

    if (!err) await fetch();
    return { error: err?.message ?? null };
  };

  // Eliminación inteligente evaluando dependencias (Section 2.1 y 2.2)
  const deleteActivityIntelligent = async (
    activityId: string,
    mode: 'delete_pure' | 'clean_unbooked_future_and_archive'
  ) => {
    if (!supabase || !orgId) return { error: 'No configurado', message: '' };

    // Intentar RPC
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('delete_activity_intelligent', {
        p_organization_id: orgId,
        p_activity_id: activityId,
        p_mode: mode,
      });

      if (!rpcErr && rpcData) {
        await fetch();
        return {
          error: null,
          message: (rpcData as { message?: string })?.message || 'Operación completada con éxito.',
        };
      }
      if (rpcErr) {
        return { error: rpcErr.message, message: '' };
      }
    } catch {
      // Fallback
    }

    // Fallback en cliente protegiendo sesiones con reservas
    try {
      if (mode === 'delete_pure') {
        // Eliminar turnos sin alumnos
        await supabase
          .from('activity_sessions')
          .delete()
          .eq('activity_id', activityId)
          .eq('organization_id', orgId)
          .eq('booked_count', 0);

        // Eliminar horarios habituales
        await supabase
          .from('activity_schedules')
          .delete()
          .eq('activity_id', activityId)
          .eq('organization_id', orgId);

        // Eliminar la actividad
        const { error: delErr } = await supabase
          .from('activities')
          .delete()
          .eq('id', activityId)
          .eq('organization_id', orgId);

        if (delErr) throw delErr;
        await fetch();
        return { error: null, message: 'Actividad eliminada con éxito.' };
      } else {
        // Eliminar únicamente sesiones futuras sin reservas
        const nowIso = new Date().toISOString();
        await supabase
          .from('activity_sessions')
          .delete()
          .eq('activity_id', activityId)
          .eq('organization_id', orgId)
          .gte('start_time', nowIso)
          .eq('booked_count', 0);

        // Pausar horarios habituales
        await supabase
          .from('activity_schedules')
          .update({ is_active: false })
          .eq('activity_id', activityId)
          .eq('organization_id', orgId);

        // Archivar actividad
        await supabase
          .from('activities')
          .update({ is_archived: true, is_active: false, is_public: false })
          .eq('id', activityId)
          .eq('organization_id', orgId);

        await fetch();
        return {
          error: null,
          message: 'Se limpiaron las sesiones vacías futuras y la actividad fue archivada protegiendo las reservas.',
        };
      }
    } catch (err: any) {
      return { error: err?.message || 'Error al procesar la operación.', message: '' };
    }
  };

  return {
    activities,
    loading,
    error,
    refetch: fetch,
    createActivity,
    updateActivity,
    updateActivityWithScope,
    analyzeActivityDependencies,
    archiveActivity,
    deleteActivityIntelligent,
  };
};
