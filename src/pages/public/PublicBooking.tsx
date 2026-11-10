import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  Megaphone,
  Copy,
  Check,
  Building2,
  UserCheck,
  Calendar,
  ShieldCheck,
  FileText,
  Repeat,
  Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

interface OrgData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  activity_category: string | null;
}

interface ActivityView {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  default_capacity: number;
  price_cents: number;
}

interface SessionView {
  id: string;
  activity_id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  booked_count: number;
  available_spots: number; // calculado en cliente: capacity - booked_count
}

interface AnnouncementView {
  id: string;
  title: string;
  content: string;
  published_at: string;
}

interface RuleItem {
  id: string;
  organization_id: string | null;
  title: string;
  content: string;
  category: string;
  requires_acceptance: boolean;
  version: number;
}

// Lineamientos estándar globales de TURNAR (fallback seguro)
const DEFAULT_GLOBAL_RULES: RuleItem[] = [
  {
    id: 'global-1',
    organization_id: null,
    title: 'Puntualidad y asistencia',
    content: 'Te pedimos llegar con 5 minutos de anticipación al horario de tu clase para comenzar a tiempo y aprovechar la sesión.',
    category: 'punctuality',
    requires_acceptance: true,
    version: 1,
  },
  {
    id: 'global-2',
    organization_id: null,
    title: 'Cancelación anticipada y cuidado del cupo',
    content: 'Si no podés asistir, cancelá con anticipación para liberar tu lugar a otra persona interesada.',
    category: 'cancellation',
    requires_acceptance: true,
    version: 1,
  },
  {
    id: 'global-3',
    organization_id: null,
    title: 'Cuidado de instalaciones y convivencia',
    content: 'Tratá con cuidado las herramientas, materiales y espacios compartidos, manteniendo un ambiente respetuoso y seguro.',
    category: 'community',
    requires_acceptance: true,
    version: 1,
  },
];

export const PublicBooking: React.FC = () => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, profile } = useAuth();

  const [org, setOrg] = useState<OrgData | null>(null);
  const [activities, setActivities] = useState<ActivityView[]>([]);
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementView[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Booking selection
  const [selectedActivity, setSelectedActivity] = useState<ActivityView | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionView | null>(null);

  // Booking form
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    notes: '',
  });
  const [isAutoFilled, setIsAutoFilled] = useState(false);
  const [emailOnlyFilled, setEmailOnlyFilled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Recurrencia contextual
  const [recurrenceChoice, setRecurrenceChoice] = useState<'weekly' | 'single'>('weekly');
  const [habitualSchedule, setHabitualSchedule] = useState<{ dayName: string; time: string; actName: string } | null>(null);

  // Reglas de participación
  const [rules, setRules] = useState<RuleItem[]>(DEFAULT_GLOBAL_RULES);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);

  // Resolución honesta y en cascada de datos del usuario
  useEffect(() => {
    const resolveUser = async () => {
      let resolvedFirst = profile?.first_name || (user?.user_metadata?.first_name as string) || '';
      let resolvedLast = profile?.last_name || (user?.user_metadata?.last_name as string) || '';
      let resolvedEmail = profile?.email || user?.email || '';
      let resolvedPhone = profile?.phone || (user?.user_metadata?.phone as string) || '';

      // Si tenemos full_name en metadata pero no first/last
      if (!resolvedFirst && user?.user_metadata?.full_name) {
        const parts = (user.user_metadata.full_name as string).trim().split(' ');
        resolvedFirst = parts[0] || '';
        resolvedLast = parts.slice(1).join(' ') || '';
      }

      // Si falta nombre o teléfono pero tenemos email y Supabase, buscar en padrón de contactos
      if ((!resolvedFirst || !resolvedLast || !resolvedPhone) && resolvedEmail && supabase) {
        try {
          const { data: contact } = await supabase
            .from('contacts')
            .select('first_name, last_name, phone')
            .eq('email', resolvedEmail.trim().toLowerCase())
            .limit(1)
            .maybeSingle();
          if (contact) {
            if (!resolvedFirst && contact.first_name) resolvedFirst = contact.first_name;
            if (!resolvedLast && contact.last_name) resolvedLast = contact.last_name;
            if (!resolvedPhone && contact.phone) resolvedPhone = contact.phone;
          }
        } catch {
          // ignore
        }
      }

      // Si aún falta información, consultar almacenamiento local
      if (!resolvedFirst || !resolvedLast || !resolvedPhone || !resolvedEmail) {
        try {
          const saved = localStorage.getItem('turnar_client_info');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (!resolvedFirst && parsed.first_name) resolvedFirst = parsed.first_name;
            if (!resolvedLast && parsed.last_name) resolvedLast = parsed.last_name;
            if (!resolvedEmail && parsed.email) resolvedEmail = parsed.email;
            if (!resolvedPhone && parsed.phone) resolvedPhone = parsed.phone;
          }
        } catch {
          // ignore
        }
      }

      // Consultar si el usuario tiene un horario habitual guardado
      try {
        const savedHabitual = localStorage.getItem('turnar_habitual_schedule');
        if (savedHabitual) {
          const parsedH = JSON.parse(savedHabitual);
          if (parsedH.dayName && parsedH.time) {
            setHabitualSchedule(parsedH);
          }
        }
      } catch {
        // ignore
      }

      // Completar efectivamente los campos del formulario
      const hasFirst = Boolean(resolvedFirst.trim());
      const hasLast = Boolean(resolvedLast.trim());
      const hasEmail = Boolean(resolvedEmail.trim());

      setForm((prev) => ({
        ...prev,
        first_name: prev.first_name || resolvedFirst,
        last_name: prev.last_name || resolvedLast,
        email: prev.email || resolvedEmail,
        phone: prev.phone || resolvedPhone,
      }));

      // ÚNICAMENTE mostramos autocompletado si nombre, apellido y email están REALMENTE cargados en los inputs
      if (hasFirst && hasLast && hasEmail) {
        setIsAutoFilled(true);
        setEmailOnlyFilled(false);
      } else if (hasEmail) {
        setIsAutoFilled(false);
        setEmailOnlyFilled(true);
      } else {
        setIsAutoFilled(false);
        setEmailOnlyFilled(false);
      }
    };

    resolveUser();
  }, [user, profile]);

  // Confirmation result
  const [confirmedBooking, setConfirmedBooking] = useState<{
    booking_id: string;
    cancellation_token: string;
  } | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Cancel reservation modal
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelBookingId, setCancelBookingId] = useState('');
  const [cancelToken, setCancelToken] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelMsg, setCancelMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!supabase || !orgSlug) return;
    setLoading(true);

    // 1. Load organization
    const { data: orgData, error: orgErr } = await supabase
      .from('organizations')
      .select('id, name, slug, description, activity_category')
      .eq('slug', orgSlug)
      .eq('is_active', true)
      .maybeSingle();

    if (orgErr || !orgData) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setOrg(orgData as OrgData);

    // 2. Load public announcements, activities, and sessions
    // Mostrar sesiones desde 2 horas atrás para cubrir sesiones que ya empezaron hoy
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const [annRes, actRes, sessRes] = await Promise.all([
      supabase
        .from('public_announcements')
        .select('id, title, content, published_at')
        .eq('organization_id', orgData.id)
        .order('published_at', { ascending: false })
        .limit(3),
      supabase
        .from('public_activities')
        .select('id, name, description, duration_minutes, default_capacity, price_cents')
        .eq('organization_id', orgData.id)
        .order('name'),
      supabase
        .from('public_activity_sessions')
        .select('id, activity_id, start_time, end_time, capacity, booked_count')
        .eq('organization_id', orgData.id)
        .gte('start_time', twoHoursAgo)
        .order('start_time'),
    ]);

    setAnnouncements((annRes.data as AnnouncementView[]) || []);
    setActivities((actRes.data as ActivityView[]) || []);
    // Calcular available_spots en cliente porque la vista no lo expone como columna
    const rawSessions = (sessRes.data ?? []) as Omit<SessionView, 'available_spots'>[];
    setSessions(
      rawSessions.map((s) => ({
        ...s,
        available_spots: Math.max(0, s.capacity - s.booked_count),
      }))
    );

    // 3. Cargar reglas aplicables (globales de TURNAR + particulares de la organización)
    try {
      const { data: rulesData } = await supabase
        .from('organization_rules')
        .select('id, organization_id, title, content, category, requires_acceptance, version')
        .or(`organization_id.eq.${orgData.id},organization_id.is.null`)
        .eq('is_active', true)
        .order('sort_order');
      if (rulesData && rulesData.length > 0) {
        setRules(rulesData as RuleItem[]);
      }
    } catch {
      // Conservar DEFAULT_GLOBAL_RULES si no está disponible la tabla remota
    }

    setLoading(false);
  }, [orgSlug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Helper de fecha local para agrupar por día
  const getLocalDateKey = (iso: string) => {
    const d = new Date(iso);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Sesiones de la actividad seleccionada con disponibilidad
  const activitySessions = selectedActivity
    ? sessions.filter((s) => s.activity_id === selectedActivity.id && s.available_spots > 0)
    : [];

  // Agrupación por día local
  const dateGroups: Record<string, SessionView[]> = {};
  activitySessions.forEach((sess) => {
    const k = getLocalDateKey(sess.start_time);
    if (!dateGroups[k]) dateGroups[k] = [];
    dateGroups[k].push(sess);
  });

  const availableDateKeys = Object.keys(dateGroups).sort();

  // Sesiones correspondientes al día seleccionado
  const daySessions = selectedDateKey && dateGroups[selectedDateKey] ? dateGroups[selectedDateKey] : [];

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !org || !selectedSession) return;

    // Verificar aceptación de condiciones obligatorias si existen
    const hasMandatoryRules = rules.some((r) => r.requires_acceptance);
    if (hasMandatoryRules && !rulesAccepted) {
      setBookingError('Por favor, confirmá la lectura y aceptación de las condiciones de participación antes de confirmar tu reserva.');
      return;
    }

    setSubmitting(true);
    setBookingError(null);

    const fName = form.first_name.trim();
    const lName = form.last_name.trim();
    const em = form.email.trim();
    const ph = form.phone.trim() || null;

    const { data, error } = await supabase.rpc('create_public_booking', {
      p_organization_slug: org.slug,
      p_session_id: selectedSession.id,
      p_first_name: fName,
      p_last_name: lName,
      p_email: em,
      p_phone: ph,
      p_notes: form.notes.trim() || null,
    });

    setSubmitting(false);

    if (error) {
      setBookingError(error.message);
    } else if (data && Array.isArray(data) && data.length > 0) {
      const createdBooking = data[0] as { booking_id: string; cancellation_token: string };

      // 1. Guardar datos en navegador para futuras visitas sin reescribir
      try {
        localStorage.setItem(
          'turnar_client_info',
          JSON.stringify({
            first_name: fName,
            last_name: lName,
            email: em,
            phone: ph || '',
          })
        );
      } catch {
        // ignore
      }

      // 2. Si eligió recurrencia semanal, registrar preferencia
      if (recurrenceChoice === 'weekly' && selectedActivity) {
        const startDt = new Date(selectedSession.start_time);
        const weekday = startDt.toLocaleDateString('es-AR', { weekday: 'long' });
        const timeStr = startDt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

        try {
          localStorage.setItem(
            'turnar_habitual_schedule',
            JSON.stringify({
              dayName: weekday,
              time: timeStr,
              actName: selectedActivity.name,
              orgSlug: org.slug,
            })
          );
          setHabitualSchedule({
            dayName: weekday,
            time: timeStr,
            actName: selectedActivity.name,
          });
        } catch {
          // ignore
        }

        // Registrar en BD si está disponible la tabla
        try {
          await supabase.from('client_recurring_schedules').insert({
            organization_id: org.id,
            contact_id: null,
            activity_id: selectedActivity.id,
            day_of_week: startDt.getDay(),
            start_time: startDt.toTimeString().split(' ')[0],
            duration_minutes: selectedActivity.duration_minutes,
            status: 'active',
            notes: `Horario semanal habitual solicitado por ${fName} ${lName} (${em})`,
          });
        } catch {
          // ignore si la tabla remota no está lista
        }
      }

      // 3. Registrar aceptación de reglas
      try {
        await supabase.from('rule_acceptances').insert({
          organization_id: org.id,
          user_id: user?.id || null,
          email: em,
          rule_version: 1,
          booking_id: createdBooking.booking_id,
        });
      } catch {
        // ignore
      }

      // 4. Si el usuario está autenticado y su perfil tenía nombres vacíos, actualizar perfil sin tocar contraseñas
      if (user && profile && (!profile.first_name || !profile.last_name)) {
        try {
          await supabase.from('profiles').update({
            first_name: fName,
            last_name: lName,
            phone: ph || profile.phone,
          }).eq('id', user.id);
        } catch {
          // ignore
        }
      }

      setConfirmedBooking(createdBooking);
      await loadData();
    } else {
      setBookingError('No se pudo completar la reserva.');
    }
  };

  const handleExecuteCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !org) return;

    setCancelling(true);
    setCancelMsg(null);

    const { error } = await supabase.rpc('cancel_booking_atomic', {
      p_organization_id: org.id,
      p_booking_id: cancelBookingId.trim(),
      p_cancellation_token: cancelToken.trim(),
      p_reason: cancelReason.trim() || 'Cancelación solicitada por el usuario',
    });

    setCancelling(false);

    if (error) {
      setCancelMsg({ type: 'err', text: error.message });
    } else {
      setCancelMsg({
        type: 'ok',
        text: 'Tu turno fue cancelado correctamente. El cupo ha sido liberado.',
      });
      await loadData();
    }
  };

  const copyToken = () => {
    if (!confirmedBooking) return;
    navigator.clipboard.writeText(confirmedBooking.cancellation_token);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50">
        <span className="w-6 h-6 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !org) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-brand-200 p-8 text-center shadow-xs">
          <Building2 className="w-10 h-10 text-brand-300 mx-auto mb-3" />
          <h1 className="text-base font-bold text-brand-900 mb-1">Espacio no encontrado</h1>
          <p className="text-xs text-brand-500 mb-6">
            La organización o espacio que estás buscando no existe o se encuentra inactiva.
          </p>
          <Link to="/">
            <Button variant="secondary" size="sm">
              Ir a TURNAR
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-50 flex flex-col">
      {/* Header Público */}
      <header className="bg-white border-b border-brand-200 py-6 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-brand-900 text-terracotta-400 font-bold text-xl flex items-center justify-center shrink-0">
              {org.name[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-brand-900 leading-tight">{org.name}</h1>
              {org.activity_category && (
                <span className="text-[11px] font-medium text-terracotta-600 capitalize">
                  {org.activity_category}
                </span>
              )}
              {org.description && (
                <p className="text-xs text-brand-500 mt-1 max-w-xl">{org.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setCancelMsg(null);
                setCancelModalOpen(true);
              }}
            >
              Cancelar un turno
            </Button>
            <Link to="/login">
              <Button variant="secondary" size="xs">
                Acceso staff
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:py-8 space-y-8">
        {/* Avisos Importantes */}
        {announcements.length > 0 && (
          <div className="space-y-2">
            {announcements.map((a) => (
              <div
                key={a.id}
                className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3"
              >
                <Megaphone className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs">
                  <h4 className="font-bold text-amber-950">{a.title}</h4>
                  <p className="text-amber-900 mt-0.5 whitespace-pre-line">{a.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reconocimiento contextual de Horario Habitual */}
        {habitualSchedule && !confirmedBooking && (
          <div className="bg-gradient-to-r from-brand-900 to-brand-800 text-white rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-semibold text-terracotta-300 uppercase tracking-wider block">
                Tu horario habitual reconocido
              </span>
              <h3 className="text-sm font-bold mt-0.5">
                {habitualSchedule.actName} · Todos los {habitualSchedule.dayName}s a las {habitualSchedule.time} hs
              </h3>
              <p className="text-xs text-brand-200 mt-0.5">
                Te sugerimos tu clase habitual para reservar en 1 clic, o podés elegir un horario alternativo para esta semana.
              </p>
            </div>
          </div>
        )}

        {/* Reserva Confirmada State */}
        {confirmedBooking ? (
          <div className="bg-white rounded-2xl border border-green-200 p-6 md:p-8 text-center max-w-lg mx-auto shadow-xs">
            <div className="w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-brand-900 mb-1">¡Turno reservado con éxito!</h2>
            <p className="text-xs text-brand-500 mb-6">
              Te esperamos. Guardá tu código de cancelación por si necesitás reprogramar o anular tu
              lugar.
            </p>

            <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 mb-6 text-left">
              <span className="block text-[11px] font-semibold text-brand-600 mb-1">
                Identificador de reserva (Booking ID):
              </span>
              <span className="block text-xs font-mono font-bold text-brand-900 mb-3 select-all">
                {confirmedBooking.booking_id}
              </span>

              <span className="block text-[11px] font-semibold text-brand-600 mb-1">
                Token secreto de cancelación:
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={confirmedBooking.cancellation_token}
                  className="flex-1 font-mono text-xs px-2.5 py-1.5 bg-white border border-brand-200 rounded-lg text-brand-800"
                />
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={copyToken}
                  icon={tokenCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                >
                  {tokenCopied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            </div>

            <Button
              variant="primary"
              onClick={() => {
                setConfirmedBooking(null);
                setSelectedSession(null);
                setSelectedActivity(null);
              }}
            >
              Hacer otra reserva
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {/* Paso 1: Elegir Actividad */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-brand-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-brand-900 text-white flex items-center justify-center text-[10px]">1</span>
                Actividades
              </h3>
              {activities.length === 0 ? (
                <div className="bg-white rounded-xl border border-brand-200 p-4 text-center text-xs text-brand-400">
                  No hay actividades publicadas en este momento.
                </div>
              ) : (
                <div className="space-y-2">
                  {activities.map((act) => {
                    const isSelected = selectedActivity?.id === act.id;
                    return (
                      <button
                        key={act.id}
                        onClick={() => {
                          setSelectedActivity(act);
                          setSelectedDateKey(null);
                          setSelectedSession(null);
                        }}
                        className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-brand-900 border-brand-900 text-white shadow-xs'
                            : 'bg-white border-brand-200 hover:border-brand-400 text-brand-900'
                        }`}
                      >
                        <div className="font-bold text-xs truncate">{act.name}</div>
                        <div
                          className={`text-[11px] mt-1 ${
                            isSelected ? 'text-brand-300' : 'text-brand-400'
                          }`}
                        >
                          {act.duration_minutes} min ·{' '}
                          {act.price_cents > 0
                            ? `$${(act.price_cents / 100).toLocaleString('es-AR')}`
                            : 'Gratis'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Paso 2: Seleccionar Día */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-brand-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-brand-900 text-white flex items-center justify-center text-[10px]">2</span>
                Elegí el día
              </h3>
              {!selectedActivity ? (
                <div className="bg-white rounded-xl border border-dashed border-brand-200 p-6 text-center text-xs text-brand-400">
                  <Calendar className="w-5 h-5 mx-auto mb-2 opacity-40 text-brand-500" />
                  Elegí una actividad a la izquierda para ver los días disponibles.
                </div>
              ) : availableDateKeys.length === 0 ? (
                <div className="bg-white rounded-xl border border-brand-200 p-4 text-center text-xs text-brand-400">
                  No hay fechas con turnos disponibles para esta actividad.
                </div>
              ) : (
                <div className="space-y-2">
                  {availableDateKeys.map((dateKey) => {
                    const daySessionsList = dateGroups[dateKey] || [];
                    const firstSession = daySessionsList[0];
                    const d = firstSession ? new Date(firstSession.start_time) : new Date(dateKey + 'T00:00:00');
                    const isSelected = selectedDateKey === dateKey;
                    const weekdayName = d.toLocaleDateString('es-AR', { weekday: 'long' });
                    const dayMonthName = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
                    const totalSpots = daySessionsList.reduce((acc, s) => acc + s.available_spots, 0);

                    return (
                      <button
                        key={dateKey}
                        onClick={() => {
                          setSelectedDateKey(dateKey);
                          setSelectedSession(null);
                        }}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-brand-900 border-brand-900 text-white shadow-xs'
                            : 'bg-white border-brand-200 hover:border-brand-400 text-brand-900'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${isSelected ? 'text-brand-300' : 'text-brand-400'}`}>
                            {weekdayName}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${isSelected ? 'bg-brand-800 text-brand-200' : 'bg-brand-100 text-brand-700'}`}>
                            {daySessionsList.length} {daySessionsList.length === 1 ? 'horario' : 'horarios'}
                          </span>
                        </div>
                        <div className="text-sm font-bold capitalize mt-0.5">
                          {dayMonthName}
                        </div>
                        <div className={`text-[11px] mt-1 ${isSelected ? 'text-brand-200' : 'text-brand-500'}`}>
                          {totalSpots} {totalSpots === 1 ? 'lugar libre' : 'lugares libres'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Paso 3: Seleccionar Horario */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-brand-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-brand-900 text-white flex items-center justify-center text-[10px]">3</span>
                Elegí el horario
              </h3>
              {!selectedDateKey ? (
                <div className="bg-white rounded-xl border border-dashed border-brand-200 p-6 text-center text-xs text-brand-400">
                  <Clock className="w-5 h-5 mx-auto mb-2 opacity-40 text-brand-500" />
                  Elegí un día a la izquierda para ver los horarios.
                </div>
              ) : daySessions.length === 0 ? (
                <div className="bg-white rounded-xl border border-brand-200 p-4 text-center text-xs text-brand-400">
                  No hay horarios disponibles para esta fecha.
                </div>
              ) : (
                <div className="space-y-2">
                  {daySessions.map((sess) => {
                    const isSelected = selectedSession?.id === sess.id;
                    const start = new Date(sess.start_time);
                    const end = new Date(sess.end_time);

                    const timeStr = `${start.toLocaleTimeString('es-AR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })} - ${end.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;

                    return (
                      <button
                        key={sess.id}
                        onClick={() => setSelectedSession(sess)}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-terracotta-500 border-terracotta-500 text-white shadow-xs'
                            : 'bg-white border-brand-200 hover:border-brand-400 text-brand-900'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-bold flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            {timeStr}
                          </span>
                          <Badge
                            variant={isSelected ? 'default' : 'success'}
                            className={isSelected ? 'bg-terracotta-600 text-white' : ''}
                          >
                            {sess.available_spots} {sess.available_spots === 1 ? 'lugar' : 'lugares'}
                          </Badge>
                        </div>
                        <div className={`text-[11px] mt-1.5 flex items-center justify-between ${isSelected ? 'text-terracotta-100' : 'text-brand-400'}`}>
                          <span>{selectedActivity?.duration_minutes} min</span>
                          <span className="font-semibold underline underline-offset-2">
                            {isSelected ? 'Seleccionado ✓' : 'Elegir'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Paso 4: Datos de contacto y confirmar */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-brand-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-brand-900 text-white flex items-center justify-center text-[10px]">4</span>
                Confirmá tu reserva
              </h3>

              {!selectedSession ? (
                <div className="bg-white rounded-xl border border-dashed border-brand-200 p-6 text-center text-xs text-brand-400">
                  <UserCheck className="w-5 h-5 mx-auto mb-2 opacity-40 text-brand-500" />
                  Elegí un horario para confirmar tu lugar.
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-brand-200 p-4 shadow-2xs">
                  {/* Resumen de la clase seleccionada */}
                  <div className="mb-3.5 p-2.5 rounded-xl bg-brand-50 border border-brand-200 text-xs">
                    <span className="text-[10px] font-bold text-brand-500 uppercase tracking-wider block">
                      Turno seleccionado
                    </span>
                    <span className="font-bold text-brand-900 block mt-0.5">
                      {selectedActivity?.name}
                    </span>
                    <div className="text-[11px] text-brand-600 mt-1 flex items-center justify-between">
                      <span className="capitalize">
                        {new Date(selectedSession.start_time).toLocaleDateString('es-AR', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}{' '}
                        ·{' '}
                        {new Date(selectedSession.start_time).toLocaleTimeString('es-AR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="font-bold text-brand-900">
                        {selectedActivity && selectedActivity.price_cents > 0
                          ? `$${(selectedActivity.price_cents / 100).toLocaleString('es-AR')}`
                          : 'Gratis'}
                      </span>
                    </div>
                  </div>

                  {bookingError && (
                    <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                      {bookingError}
                    </div>
                  )}

                  {/* Pregunta contextual: Horario habitual semanal vs Turno puntual */}
                  <div className="mb-3.5 p-3 rounded-xl bg-brand-50 border border-brand-200">
                    <label className="text-xs font-bold text-brand-900 block mb-1.5 flex items-center gap-1.5">
                      <Repeat className="w-3.5 h-3.5 text-brand-700" />
                      ¿Querés que te reservemos este mismo horario todas las semanas?
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRecurrenceChoice('weekly')}
                        className={`p-2 rounded-lg text-left border text-xs transition-all ${
                          recurrenceChoice === 'weekly'
                            ? 'bg-brand-900 text-white border-brand-900 font-semibold shadow-xs'
                            : 'bg-white text-brand-700 border-brand-200 hover:border-brand-400'
                        }`}
                      >
                        <span className="block font-bold">✓ Sí, semanalmente</span>
                        <span className={`text-[10px] block mt-0.5 ${recurrenceChoice === 'weekly' ? 'text-brand-300' : 'text-brand-500'}`}>
                          Horario fijo asegurado
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecurrenceChoice('single')}
                        className={`p-2 rounded-lg text-left border text-xs transition-all ${
                          recurrenceChoice === 'single'
                            ? 'bg-brand-900 text-white border-brand-900 font-semibold shadow-xs'
                            : 'bg-white text-brand-700 border-brand-200 hover:border-brand-400'
                        }`}
                      >
                        <span className="block font-bold">Solo esta fecha</span>
                        <span className={`text-[10px] block mt-0.5 ${recurrenceChoice === 'single' ? 'text-brand-300' : 'text-brand-500'}`}>
                          Turno único puntual
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Autocompletado honesto y real */}
                  {isAutoFilled && form.first_name && (
                    <div className="mb-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5">
                      <UserCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="font-bold">Datos reconocidos y cargados</span>
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          Tus datos ({form.first_name} {form.last_name}) están listos. Podés editarlos si reservás para otra persona.
                        </p>
                      </div>
                    </div>
                  )}

                  {emailOnlyFilled && !isAutoFilled && (
                    <div className="mb-3 p-2 rounded-lg bg-brand-50 border border-brand-200 text-xs text-brand-700 flex items-center gap-2">
                      <Info className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                      <span>Completamos tu correo ({form.email}). Ingresá tu nombre para confirmar.</span>
                    </div>
                  )}

                  <form onSubmit={handleBookingSubmit} className="space-y-3">
                    <Input
                      label="Nombre"
                      placeholder="Ej. Juan"
                      value={form.first_name}
                      onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                      required
                    />
                    <Input
                      label="Apellido"
                      placeholder="Ej. Pérez"
                      value={form.last_name}
                      onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                      required
                    />
                    <Input
                      label="Correo electrónico"
                      type="email"
                      placeholder="juan@ejemplo.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      required
                    />
                    <Input
                      label="Teléfono / WhatsApp"
                      placeholder="+54 9 11 ..."
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                    <Textarea
                      label="Observaciones o notas para el espacio (opcional)"
                      placeholder="Aclaraciones médicas, nivel previo o comentarios..."
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      rows={2}
                    />

                    {/* Condiciones de participación */}
                    <div className="pt-2 border-t border-brand-100">
                      <div className="p-3 bg-brand-50 rounded-xl border border-brand-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-brand-900 flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-brand-700" />
                            Condiciones de participación
                          </span>
                          <button
                            type="button"
                            onClick={() => setRulesModalOpen(true)}
                            className="text-[11px] text-brand-600 hover:text-brand-900 underline font-semibold"
                          >
                            Ver reglas ({rules.length})
                          </button>
                        </div>
                        <p className="text-[11px] text-brand-600">
                          Puntualidad, aviso previo de cancelaciones para liberar el cupo y respeto por las normas del espacio.
                        </p>
                        <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={rulesAccepted}
                            onChange={(e) => setRulesAccepted(e.target.checked)}
                            className="mt-0.5 rounded border-brand-300 text-brand-900 focus:ring-brand-900"
                          />
                          <span className="text-xs text-brand-800 font-medium leading-tight">
                            He leído y acepto las condiciones de participación.
                          </span>
                        </label>
                      </div>
                    </div>

                    <Button 
                      type="submit" 
                      loading={submitting} 
                      className="w-full"
                      disabled={rules.some(r => r.requires_acceptance) && !rulesAccepted}
                    >
                      Confirmar reserva
                    </Button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modal Cancelación */}
      <Modal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancelar un turno existente"
      >
        {cancelMsg && (
          <div
            className={`mb-3 p-2.5 rounded-lg text-xs ${
              cancelMsg.type === 'ok'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {cancelMsg.text}
          </div>
        )}

        <form onSubmit={handleExecuteCancel} className="space-y-3">
          <Input
            label="ID de la reserva (Booking ID)"
            placeholder="00000000-0000-0000-0000-000000000000"
            value={cancelBookingId}
            onChange={(e) => setCancelBookingId(e.target.value)}
            required
          />

          <Input
            label="Token secreto de cancelación"
            placeholder="Token alfanumérico que recibiste al reservar"
            value={cancelToken}
            onChange={(e) => setCancelToken(e.target.value)}
            required
          />

          <Input
            label="Motivo de la cancelación (opcional)"
            placeholder="Imprevisto de fuerza mayor..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" type="button" onClick={() => setCancelModalOpen(false)}>
              Cerrar
            </Button>
            <Button type="submit" variant="danger" loading={cancelling}>
              Confirmar cancelación
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal de Condiciones de Participación y Lineamientos */}
      <Modal
        open={rulesModalOpen}
        onClose={() => setRulesModalOpen(false)}
        title="Condiciones de Participación y Lineamientos"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Nivel 1: Lineamientos Generales de la plataforma */}
          <div>
            <div className="flex items-center gap-2 mb-2 pb-1 border-b border-brand-200">
              <ShieldCheck className="w-4 h-4 text-brand-900" />
              <h4 className="text-xs font-bold text-brand-900 uppercase tracking-wider">
                1. Lineamientos Generales de TURNAR
              </h4>
            </div>
            <div className="space-y-2">
              {rules
                .filter((r) => r.organization_id === null)
                .map((r) => (
                  <div key={r.id} className="p-3 rounded-xl bg-brand-50 border border-brand-200 text-xs">
                    <h5 className="font-bold text-brand-900 mb-1">{r.title}</h5>
                    <p className="text-brand-700 whitespace-pre-line leading-relaxed">{r.content}</p>
                  </div>
                ))}
            </div>
          </div>

          {/* Nivel 2: Reglas particulares del espacio */}
          <div>
            <div className="flex items-center gap-2 mb-2 pb-1 border-b border-brand-200">
              <FileText className="w-4 h-4 text-terracotta-600" />
              <h4 className="text-xs font-bold text-brand-900 uppercase tracking-wider">
                2. Reglas Particulares de {org?.name}
              </h4>
            </div>
            {rules.filter((r) => r.organization_id !== null).length === 0 ? (
              <div className="p-3 rounded-xl bg-brand-50/50 border border-brand-100 text-xs text-brand-500 italic">
                Este espacio aplica los lineamientos generales de convivencia y puntualidad estándar de TURNAR.
              </div>
            ) : (
              <div className="space-y-2">
                {rules
                  .filter((r) => r.organization_id !== null)
                  .map((r) => (
                    <div key={r.id} className="p-3 rounded-xl bg-white border border-brand-200 text-xs shadow-2xs">
                      <div className="flex items-center justify-between mb-1">
                        <h5 className="font-bold text-brand-900">{r.title}</h5>
                        <Badge variant="muted" className="text-[10px] capitalize">
                          {r.category}
                        </Badge>
                      </div>
                      <p className="text-brand-700 whitespace-pre-line leading-relaxed">{r.content}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-brand-100 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rulesAccepted}
                onChange={(e) => setRulesAccepted(e.target.checked)}
                className="rounded border-brand-300 text-brand-900 focus:ring-brand-900"
              />
              <span className="text-xs text-brand-800 font-semibold">
                Acepto estas condiciones
              </span>
            </label>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setRulesAccepted(true);
                setRulesModalOpen(false);
              }}
            >
              Entendido y aceptar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Footer */}
      <footer className="bg-white border-t border-brand-100 py-6 text-center text-xs text-brand-400">
        Gestión impulsada por <span className="font-bold text-brand-900">TURNAR</span> · Desarrollado por{' '}
        <span className="font-semibold text-brand-700">LUKSONARTS</span>
      </footer>
    </div>
  );
};
