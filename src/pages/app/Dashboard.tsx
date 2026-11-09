import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Users,
  Dumbbell,
  Calendar,
  CreditCard,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useOrg } from '@/contexts/OrgContext';

interface DashboardStats {
  totalContacts: number;
  activeContacts: number;
  totalActivities: number;
  upcomingSessionsToday: number;
  pendingPayments: number;
  monthlyBookings: number;
}

const StatCard: React.FC<{
  label: string;
  value: number | string;
  icon: React.ReactNode;
  sub?: string;
  color?: string;
}> = ({ label, value, icon, sub, color = 'bg-brand-100 text-brand-600' }) => (
  <div className="bg-white rounded-xl border border-brand-100 p-4 flex items-start gap-3">
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-xs text-brand-400">{label}</p>
      <p className="text-xl font-bold text-brand-900 leading-tight">{value}</p>
      {sub && <p className="text-xs text-brand-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

export const Dashboard: React.FC = () => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { orgId, orgName } = useOrg();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<Array<{
    id: string;
    start_time: string;
    end_time: string;
    booked_count: number;
    capacity: number;
    activities: { name: string } | null;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !orgId) { setLoading(false); return; }
    const load = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      const [contacts, activities, sessions, payments, bookings, upcoming] =
        await Promise.all([
          supabase.from('contacts').select('id, is_active').eq('organization_id', orgId),
          supabase.from('activities').select('id, name').eq('organization_id', orgId).eq('is_active', true),
          supabase
            .from('activity_sessions')
            .select('id')
            .eq('organization_id', orgId)
            .gte('start_time', today.toISOString())
            .lt('start_time', tomorrow.toISOString()),
          supabase
            .from('payments')
            .select('id')
            .eq('organization_id', orgId)
            .eq('status', 'pending'),
          supabase
            .from('bookings')
            .select('id')
            .eq('organization_id', orgId)
            .gte('created_at', firstDay.toISOString())
            .lte('created_at', lastDay.toISOString()),
          supabase
            .from('activity_sessions')
            .select('id, start_time, end_time, booked_count, capacity, activity_id')
            .eq('organization_id', orgId)
            .gte('start_time', today.toISOString())
            .lt('start_time', tomorrow.toISOString())
            .order('start_time')
            .limit(5),
        ]);

      const allContacts = contacts.data ?? [];
      const actList = activities.data ?? [];
      const actMap = new Map(actList.map((a: any) => [a.id, a]));

      setStats({
        totalContacts: allContacts.length,
        activeContacts: allContacts.filter((c: any) => c.is_active).length,
        totalActivities: actList.length,
        upcomingSessionsToday: sessions.data?.length ?? 0,
        pendingPayments: payments.data?.length ?? 0,
        monthlyBookings: bookings.data?.length ?? 0,
      });

      const formattedUpcoming = (upcoming.data ?? []).map((s: any) => ({
        id: s.id,
        start_time: s.start_time,
        end_time: s.end_time,
        booked_count: s.booked_count,
        capacity: s.capacity,
        activities: actMap.get(s.activity_id) || { name: 'Actividad' },
      }));

      setUpcomingSessions(formattedUpcoming as typeof upcomingSessions);
      setLoading(false);
    };
    load();
  }, [orgId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="w-5 h-5 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const fmt = (s: string) =>
    new Date(s).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-brand-900">{orgName}</h1>
        <p className="text-xs text-brand-400">Resumen del día</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard
          label="Alumnos activos"
          value={stats?.activeContacts ?? 0}
          sub={`${stats?.totalContacts ?? 0} totales`}
          icon={<Users className="w-4 h-4" />}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Actividades"
          value={stats?.totalActivities ?? 0}
          icon={<Dumbbell className="w-4 h-4" />}
          color="bg-terracotta-50 text-terracotta-600"
        />
        <StatCard
          label="Sesiones hoy"
          value={stats?.upcomingSessionsToday ?? 0}
          icon={<Calendar className="w-4 h-4" />}
          color="bg-green-50 text-green-600"
        />
        <StatCard
          label="Pagos pendientes"
          value={stats?.pendingPayments ?? 0}
          icon={<CreditCard className="w-4 h-4" />}
          color="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Reservas este mes"
          value={stats?.monthlyBookings ?? 0}
          icon={<TrendingUp className="w-4 h-4" />}
          color="bg-purple-50 text-purple-600"
        />
      </div>

      {/* Upcoming sessions today */}
      <div className="bg-white rounded-xl border border-brand-100 p-4">
        <h2 className="text-xs font-semibold text-brand-700 mb-3 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Sesiones de hoy
        </h2>
        {upcomingSessions.length === 0 ? (
          <p className="text-xs text-brand-400 text-center py-4">
            No hay sesiones programadas para hoy
          </p>
        ) : (
          <div className="space-y-2">
            {upcomingSessions.map((s) => (
              <div
                key={s.id}
                onClick={() => navigate(`/app/${orgSlug}/agenda`)}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-brand-50 hover:bg-brand-100 cursor-pointer transition-colors"
              >
                <div className="text-center min-w-[52px]">
                  <p className="text-xs font-bold text-brand-900">{fmt(s.start_time)}</p>
                  <p className="text-[10px] text-brand-400">{fmt(s.end_time)}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-brand-800 truncate">
                    {s.activities?.name ?? 'Actividad'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-brand-700">
                    {s.booked_count}/{s.capacity}
                  </p>
                  <p className="text-[10px] text-brand-400">lugares</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
