import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  Megaphone,
  Copy,
  Check,
  Building2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
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
  available_spots: number;
}

interface AnnouncementView {
  id: string;
  title: string;
  content: string;
  published_at: string;
}

export const PublicBooking: React.FC = () => {
  const { orgSlug } = useParams<{ orgSlug: string }>();

  const [org, setOrg] = useState<OrgData | null>(null);
  const [activities, setActivities] = useState<ActivityView[]>([]);
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementView[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Booking selection
  const [selectedActivity, setSelectedActivity] = useState<ActivityView | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionView | null>(null);

  // Booking form
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

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
    const nowIso = new Date().toISOString();

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
        .select('id, activity_id, start_time, end_time, capacity, booked_count, available_spots')
        .eq('organization_id', orgData.id)
        .gte('start_time', nowIso)
        .order('start_time'),
    ]);

    setAnnouncements((annRes.data as AnnouncementView[]) || []);
    setActivities((actRes.data as ActivityView[]) || []);
    setSessions((sessRes.data as SessionView[]) || []);
    setLoading(false);
  }, [orgSlug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !org || !selectedSession) return;

    setSubmitting(true);
    setBookingError(null);

    const { data, error } = await supabase.rpc('create_public_booking', {
      p_organization_slug: org.slug,
      p_session_id: selectedSession.id,
      p_first_name: form.first_name.trim(),
      p_last_name: form.last_name.trim(),
      p_email: form.email.trim(),
      p_phone: form.phone.trim() || null,
      p_notes: form.notes.trim() || null,
    });

    setSubmitting(false);

    if (error) {
      setBookingError(error.message);
    } else if (data && Array.isArray(data) && data.length > 0) {
      setConfirmedBooking(data[0] as { booking_id: string; cancellation_token: string });
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
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:py-8 space-y-8">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Paso 1: Elegir Actividad */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-brand-800 uppercase tracking-wider">
                1. Actividades disponibles
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

            {/* Paso 2: Horarios de la actividad */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-brand-800 uppercase tracking-wider">
                2. Seleccioná día y horario
              </h3>
              {!selectedActivity ? (
                <div className="bg-white rounded-xl border border-dashed border-brand-200 p-6 text-center text-xs text-brand-400">
                  Seleccioná una actividad a la izquierda para ver los cupos.
                </div>
              ) : (
                (() => {
                  const availableSessions = sessions.filter(
                    (s) => s.activity_id === selectedActivity.id && s.available_spots > 0
                  );

                  if (availableSessions.length === 0) {
                    return (
                      <div className="bg-white rounded-xl border border-brand-200 p-4 text-center text-xs text-brand-400">
                        No hay turnos con cupo disponible para esta actividad.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {availableSessions.map((sess) => {
                        const isSelected = selectedSession?.id === sess.id;
                        const start = new Date(sess.start_time);
                        const end = new Date(sess.end_time);

                        const dateStr = start.toLocaleDateString('es-AR', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        });
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
                              <span className="font-bold capitalize">{dateStr}</span>
                              <Badge
                                variant={isSelected ? 'default' : 'success'}
                                className={isSelected ? 'bg-terracotta-600 text-white' : ''}
                              >
                                {sess.available_spots} lugares
                              </Badge>
                            </div>
                            <div
                              className={`text-[11px] font-mono mt-0.5 flex items-center gap-1 ${
                                isSelected ? 'text-terracotta-100' : 'text-brand-500'
                              }`}
                            >
                              <Clock className="w-3 h-3" />
                              {timeStr}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>

            {/* Paso 3: Datos de contacto y confirmar */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-brand-800 uppercase tracking-wider">
                3. Completá tus datos
              </h3>

              {!selectedSession ? (
                <div className="bg-white rounded-xl border border-dashed border-brand-200 p-6 text-center text-xs text-brand-400">
                  Elegí una fecha y horario para ingresar tus datos.
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-brand-200 p-4 shadow-2xs">
                  {bookingError && (
                    <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                      {bookingError}
                    </div>
                  )}

                  <form onSubmit={handleBookingSubmit} className="space-y-3">
                    <Input
                      label="Nombre"
                      placeholder="Juan"
                      value={form.first_name}
                      onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                      required
                    />
                    <Input
                      label="Apellido"
                      placeholder="Pérez"
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
                      label="Comentarios (opcional)"
                      placeholder="¿Venís con alguien? ¿Tenés experiencia previa?"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      rows={2}
                    />

                    <Button type="submit" loading={submitting} className="w-full">
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

      {/* Footer */}
      <footer className="bg-white border-t border-brand-100 py-6 text-center text-xs text-brand-400">
        Gestión impulsada por <span className="font-bold text-brand-900">TURNAR</span> · Desarrollado por{' '}
        <span className="font-semibold text-brand-700">LUKSONARTS</span>
      </footer>
    </div>
  );
};
