import React, { useState, useEffect, useCallback } from 'react';
import { Calendar as CalendarIcon, Clock, Users, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';

interface BookingItem {
  id: string;
  status: string;
  payment_status: string;
  cancellation_reason?: string;
  contacts: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  } | null;
}

interface SessionWithActivity {
  id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  booked_count: number;
  status: string;
  activities: {
    name: string;
    duration_minutes: number;
  } | null;
}

export const Agenda: React.FC = () => {
  const { orgId } = useOrg();
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  const [sessions, setSessions] = useState<SessionWithActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<SessionWithActivity | null>(null);
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!supabase || !orgId) return;
    setLoading(true);

    const startOfDay = new Date(`${selectedDate}T00:00:00`);
    const endOfDay = new Date(`${selectedDate}T23:59:59`);

    const { data, error } = await supabase
      .from('activity_sessions')
      .select('id, start_time, end_time, capacity, booked_count, status, activities:activities!fk_sessions_activity_org(name, duration_minutes)')
      .eq('organization_id', orgId)
      .gte('start_time', startOfDay.toISOString())
      .lte('start_time', endOfDay.toISOString())
      .order('start_time');

    if (error) {
      // Fallback resiliente
      const sessRes = await supabase
        .from('activity_sessions')
        .select('id, start_time, end_time, capacity, booked_count, status, activity_id')
        .eq('organization_id', orgId)
        .gte('start_time', startOfDay.toISOString())
        .lte('start_time', endOfDay.toISOString())
        .order('start_time');

      if (!sessRes.error && sessRes.data) {
        const actRes = await supabase
          .from('activities')
          .select('id, name, duration_minutes')
          .eq('organization_id', orgId);

        const actMap = new Map((actRes.data || []).map((a: any) => [a.id, a]));
        const merged = sessRes.data.map((s: any) => ({
          ...s,
          activities: actMap.get(s.activity_id) || { name: 'Actividad', duration_minutes: 60 },
        }));
        setSessions(merged as unknown as SessionWithActivity[]);
      }
    } else if (data) {
      setSessions(data as unknown as SessionWithActivity[]);
    }
    setLoading(false);
  }, [orgId, selectedDate]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const loadSessionBookings = async (session: SessionWithActivity) => {
    setSelectedSession(session);
    setLoadingBookings(true);
    setActionError(null);

    if (!supabase || !orgId) return;

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        status,
        payment_status,
        cancellation_reason,
        contacts(first_name, last_name, email, phone)
      `)
      .eq('session_id', session.id)
      .eq('organization_id', orgId)
      .order('created_at');

    if (!error && data) {
      setBookings(data as unknown as BookingItem[]);
    }
    setLoadingBookings(false);
  };

  const changeDateBy = (days: number) => {
    const cur = new Date(`${selectedDate}T12:00:00`);
    cur.setDate(cur.getDate() + days);
    setSelectedDate(cur.toISOString().split('T')[0]);
  };

  const updateBookingStatus = async (bookingId: string, newStatus: string) => {
    if (!supabase) return;
    setActionError(null);
    const { error } = await supabase
      .from('bookings')
      .update({ status: newStatus } as never)
      .eq('id', bookingId);

    if (error) {
      setActionError(error.message);
    } else {
      if (selectedSession) {
        await loadSessionBookings(selectedSession);
        await fetchSessions();
      }
    }
  };

  const prettyDate = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-bold text-brand-900">Agenda Diaria</h1>
          <p className="text-xs text-brand-400">Revisá la asistencia y reservas para cada turno</p>
        </div>

        {/* Date Navigator */}
        <div className="flex items-center gap-2 bg-white border border-brand-200 rounded-xl p-1 shadow-2xs">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => changeDateBy(-1)}
            icon={<ChevronLeft className="w-3.5 h-3.5" />}
          />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-xs font-semibold text-brand-800 border-0 bg-transparent focus:outline-none cursor-pointer"
          />
          <Button
            variant="ghost"
            size="xs"
            onClick={() => changeDateBy(1)}
            icon={<ChevronRight className="w-3.5 h-3.5" />}
          />
          <Button
            variant="secondary"
            size="xs"
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
          >
            Hoy
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <h2 className="text-sm font-bold text-brand-800 capitalize">{prettyDate}</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="w-5 h-5 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="w-6 h-6" />}
          title="No hay sesiones para esta fecha"
          description="Podés seleccionar otro día en el navegador de arriba o programar nuevas sesiones desde el menú Sesiones."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((sess) => {
            const start = new Date(sess.start_time);
            const end = new Date(sess.end_time);
            const timeStr = `${start.toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
            })} - ${end.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;

            return (
              <div
                key={sess.id}
                onClick={() => loadSessionBookings(sess)}
                className="bg-white rounded-xl border border-brand-200 p-4 shadow-2xs hover:border-brand-400 hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold font-mono text-brand-700 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-brand-400" />
                      {timeStr}
                    </span>
                    <Badge
                      variant={
                        sess.status === 'cancelled'
                          ? 'danger'
                          : sess.booked_count >= sess.capacity
                          ? 'warning'
                          : 'success'
                      }
                    >
                      {sess.status === 'cancelled' ? 'Cancelada' : `${sess.booked_count}/${sess.capacity}`}
                    </Badge>
                  </div>
                  <h3 className="text-sm font-bold text-brand-900 mb-1">
                    {sess.activities?.name || 'Actividad'}
                  </h3>
                </div>

                <div className="pt-3 border-t border-brand-100 flex items-center justify-between text-xs text-brand-500">
                  <span className="flex items-center gap-1 font-medium text-brand-700">
                    <Users className="w-3 h-3 text-brand-400" />
                    Ver {sess.booked_count} reserva(s)
                  </span>
                  <span className="text-[11px] text-terracotta-600 font-semibold hover:underline">
                    Gestionar →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Detalle de Sesión y Reservas */}
      <Modal
        open={Boolean(selectedSession)}
        onClose={() => setSelectedSession(null)}
        title={
          selectedSession
            ? `${selectedSession.activities?.name} (${new Date(selectedSession.start_time).toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
              })})`
            : 'Turno'
        }
        size="lg"
      >
        {actionError && (
          <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {actionError}
          </div>
        )}

        {loadingBookings ? (
          <div className="flex justify-center py-8">
            <span className="w-5 h-5 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-8 text-brand-400 text-xs">
            <Users className="w-8 h-8 text-brand-200 mx-auto mb-2" />
            No hay reservas registradas para este turno.
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-brand-600 mb-2">
              Alumnos inscriptos ({bookings.filter((b) => b.status !== 'cancelled').length} activos / {bookings.length} totales)
            </p>
            <div className="divide-y divide-brand-100 border border-brand-100 rounded-xl overflow-hidden">
              {bookings.map((b) => {
                const contact = b.contacts;
                const isCancelled = b.status === 'cancelled';
                const isAttended = b.status === 'attended';

                return (
                  <div
                    key={b.id}
                    className={`p-3 flex items-center justify-between gap-3 text-xs ${
                      isCancelled ? 'bg-brand-50/50 opacity-60' : 'bg-white'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-brand-900">
                        {contact ? `${contact.first_name} ${contact.last_name}` : 'Alumno anónimo'}
                      </div>
                      <div className="text-[11px] text-brand-400">
                        {contact?.email} {contact?.phone && `· ${contact.phone}`}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge
                          variant={
                            isCancelled
                              ? 'danger'
                              : isAttended
                              ? 'success'
                              : b.status === 'confirmed'
                              ? 'info'
                              : 'warning'
                          }
                        >
                          {b.status}
                        </Badge>
                        <Badge
                          variant={
                            b.payment_status === 'paid'
                              ? 'success'
                              : b.payment_status === 'pending'
                              ? 'warning'
                              : 'muted'
                          }
                        >
                          Pago: {b.payment_status}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!isCancelled && (
                        <>
                          <Button
                            variant={isAttended ? 'secondary' : 'primary'}
                            size="xs"
                            onClick={() => updateBookingStatus(b.id, isAttended ? 'confirmed' : 'attended')}
                            title={isAttended ? 'Marcar como pendiente' : 'Presente'}
                          >
                            <Check className="w-3 h-3" />
                            {isAttended ? 'Asistió' : 'Presente'}
                          </Button>

                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => updateBookingStatus(b.id, 'cancelled')}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Cancelar reserva"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-4">
          <Button variant="secondary" onClick={() => setSelectedSession(null)}>
            Cerrar
          </Button>
        </div>
      </Modal>
    </div>
  );
};
