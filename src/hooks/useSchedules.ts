import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface ActivitySchedule {
  id: string;
  activity_id: string;
  instructor_id: string | null;
  day_of_week: number; // 0: Dom, 1: Lun, ..., 6: Sáb
  start_time: string; // '18:00:00'
  end_time: string;   // '20:00:00'
  capacity_override: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BatchOperation {
  id: string;
  organization_id: string;
  operation_type: string;
  description: string;
  affected_count: number;
  session_ids: string[];
  is_reverted: boolean;
  reverted_at: string | null;
  created_at: string;
}

export const useSchedules = (orgId: string | null) => {
  const [schedules, setSchedules] = useState<ActivitySchedule[]>([]);
  const [batches, setBatches] = useState<BatchOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cargar programación habitual
  const fetchSchedules = useCallback(async () => {
    if (!supabase || !orgId) { setLoading(false); return; }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('activity_schedules')
      .select('*')
      .order('day_of_week')
      .order('start_time');

    if (err) setError(err.message);
    else setSchedules((data as ActivitySchedule[]) ?? []);
    setLoading(false);
  }, [orgId]);

  // Cargar historial de operaciones masivas
  const fetchBatches = useCallback(async () => {
    if (!supabase || !orgId) return;
    try {
      const { data } = await supabase
        .from('schedule_batch_operations')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setBatches(data as BatchOperation[]);
    } catch {
      // ignore si la tabla remota aún no existe
    }
  }, [orgId]);

  useEffect(() => {
    fetchSchedules();
    fetchBatches();
  }, [fetchSchedules, fetchBatches]);

  // Crear horario habitual
  const createSchedule = async (payload: {
    activity_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    capacity_override?: number | null;
  }) => {
    if (!supabase || !orgId) return { error: 'No configurado' };
    const { error: err } = await supabase.from('activity_schedules').insert({
      ...payload,
      is_active: true,
    });
    if (!err) await fetchSchedules();
    return { error: err?.message ?? null };
  };

  // Modificar horario habitual
  const updateSchedule = async (id: string, payload: Partial<ActivitySchedule>) => {
    if (!supabase) return { error: 'No configurado' };
    const { error: err } = await supabase
      .from('activity_schedules')
      .update(payload)
      .eq('id', id);
    if (!err) await fetchSchedules();
    return { error: err?.message ?? null };
  };

  // Eliminar horario habitual
  const deleteSchedule = async (id: string) => {
    if (!supabase) return { error: 'No configurado' };
    const { error: err } = await supabase
      .from('activity_schedules')
      .delete()
      .eq('id', id);
    if (!err) await fetchSchedules();
    return { error: err?.message ?? null };
  };

  // Generar turnos masivos fechados a partir de los horarios habituales
  const generateSessionsFromSchedules = async (
    startDate: Date,
    weeksCount: number,
    activitiesMap: Record<string, { default_capacity: number; name: string }>
  ) => {
    if (!supabase || !orgId) return { error: 'No configurado', count: 0 };
    if (schedules.length === 0) return { error: 'No tenés horarios habituales configurados para generar.', count: 0 };

    const batchId = crypto.randomUUID();
    const toInsert: Array<{
      organization_id: string;
      activity_id: string;
      schedule_id: string;
      start_time: string;
      end_time: string;
      capacity: number;
      status: string;
      batch_id: string;
    }> = [];

    // Iterar cada semana del horizonte
    for (let w = 0; w < weeksCount; w++) {
      const currentWeekMonday = new Date(startDate);
      currentWeekMonday.setDate(currentWeekMonday.getDate() + w * 7);

      for (const sch of schedules) {
        if (!sch.is_active) continue;

        // Calcular la fecha exacta del día de la semana (sch.day_of_week: 0=dom, 1=lun, ..., 6=sab)
        // currentWeekMonday es lunes
        const targetDate = new Date(currentWeekMonday);
        // Si day_of_week es 1 (lunes), diff = 0; si es 2 (martes), diff = 1; etc.
        const dayOffset = sch.day_of_week === 0 ? 6 : sch.day_of_week - 1;
        targetDate.setDate(targetDate.getDate() + dayOffset);

        const [sh, sm] = sch.start_time.split(':').map(Number);
        const [eh, em] = sch.end_time.split(':').map(Number);

        const startDt = new Date(targetDate);
        startDt.setHours(sh, sm, 0, 0);

        const endDt = new Date(targetDate);
        endDt.setHours(eh, em, 0, 0);

        const actInfo = activitiesMap[sch.activity_id];
        const cap = sch.capacity_override ?? actInfo?.default_capacity ?? 10;

        toInsert.push({
          organization_id: orgId,
          activity_id: sch.activity_id,
          schedule_id: sch.id,
          start_time: startDt.toISOString(),
          end_time: endDt.toISOString(),
          capacity: cap,
          status: 'scheduled',
          batch_id: batchId,
        });
      }
    }

    if (toInsert.length === 0) {
      return { error: 'No se generaron sesiones.', count: 0 };
    }

    // Inserción en la base de datos
    const { data: inserted, error: insErr } = await supabase
      .from('activity_sessions')
      .insert(toInsert)
      .select('id');

    if (insErr) {
      return { error: insErr.message, count: 0 };
    }

    const insertedIds = inserted ? inserted.map((row: { id: string }) => row.id) : [];

    // Registrar la operación masiva (Batch) para permitir Deshacer (Undo)
    try {
      await supabase.from('schedule_batch_operations').insert({
        id: batchId,
        organization_id: orgId,
        operation_type: 'generate_from_schedule',
        description: `Generación de ${toInsert.length} turnos para ${weeksCount} ${weeksCount === 1 ? 'semana' : 'semanas'}`,
        affected_count: toInsert.length,
        session_ids: insertedIds,
        is_reverted: false,
      });
      await fetchBatches();
    } catch {
      // ignore si la tabla remota de batches aún no fue migrada
    }

    return { error: null, count: toInsert.length, batchId };
  };

  // Deshacer una operación masiva (Undo seguro)
  const undoBatchOperation = async (batchId: string) => {
    if (!supabase || !orgId) return { error: 'No configurado', deletedCount: 0, blockedCount: 0 };

    // 1. Intentar mediante RPC atómica centralizada
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('revert_batch_operation', {
        p_organization_id: orgId,
        p_batch_id: batchId,
      });

      if (!rpcErr && rpcRes) {
        await fetchBatches();
        return {
          error: null,
          deletedCount: (rpcRes as { deleted_count: number }).deleted_count ?? 0,
          blockedCount: (rpcRes as { blocked_count: number }).blocked_count ?? 0,
        };
      }
    } catch {
      // Fallback si la función aún no se corrió en SQL Editor
    }

    // Fallback: eliminación en cliente protegiendo sesiones con reservas
    const { data: batchData } = await supabase
      .from('schedule_batch_operations')
      .select('*')
      .eq('id', batchId)
      .eq('organization_id', orgId)
      .single();

    const sessionIds = (batchData as BatchOperation)?.session_ids || [];

    // Identificar sesiones con reservas (booked_count > 0)
    const { data: sessionsWithBookings } = await supabase
      .from('activity_sessions')
      .select('id')
      .eq('organization_id', orgId)
      .gt('booked_count', 0)
      .or(`batch_id.eq.${batchId},id.in.(${sessionIds.join(',')})`);

    const blockedIds = new Set((sessionsWithBookings || []).map((s: { id: string }) => s.id));

    // Eliminar solo las sesiones vacías
    const toDeleteIds = sessionIds.filter((id) => !blockedIds.has(id));

    let deleted = 0;
    if (toDeleteIds.length > 0) {
      const { error: delErr } = await supabase
        .from('activity_sessions')
        .delete()
        .in('id', toDeleteIds);
      if (!delErr) deleted = toDeleteIds.length;
    }

    // Actualizar estado del batch
    try {
      await supabase
        .from('schedule_batch_operations')
        .update({
          is_reverted: blockedIds.size === 0,
          reverted_at: new Date().toISOString(),
        })
        .eq('id', batchId);
      await fetchBatches();
    } catch {
      // ignore
    }

    return {
      error: null,
      deletedCount: deleted,
      blockedCount: blockedIds.size,
    };
  };

  return {
    schedules,
    batches,
    loading,
    error,
    refetchSchedules: fetchSchedules,
    refetchBatches: fetchBatches,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    generateSessionsFromSchedules,
    undoBatchOperation,
  };
};
