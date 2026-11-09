import React, { useState } from 'react';
import { Calendar, Plus, Clock, Users } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useActivities } from '@/hooks/useActivities';
import { useSessions, type Session } from '@/hooks/useSessions';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

export const Sessions: React.FC = () => {
  const { orgId } = useOrg();
  const { activities } = useActivities(orgId);
  const [selectedActivityId, setSelectedActivityId] = useState<string>('');
  const { sessions, loading, error, createSession, updateSession } = useSessions(
    orgId,
    selectedActivityId || undefined
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    activity_id: '',
    date: new Date().toISOString().split('T')[0],
    start_time: '18:00',
    capacity: 10,
  });

  const openCreate = () => {
    const actId = selectedActivityId || activities[0]?.id || '';
    const defCap = activities.find((a) => a.id === actId)?.default_capacity || 10;
    setForm({
      activity_id: actId,
      date: new Date().toISOString().split('T')[0],
      start_time: '18:00',
      capacity: defCap,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleActivityChange = (actId: string) => {
    const act = activities.find((a) => a.id === actId);
    setForm((f) => ({
      ...f,
      activity_id: actId,
      capacity: act?.default_capacity || f.capacity,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.activity_id) {
      setFormError('Seleccioná una actividad.');
      return;
    }

    setSaving(true);
    setFormError(null);

    const act = activities.find((a) => a.id === form.activity_id);
    const duration = act?.duration_minutes || 60;

    const startDateTime = new Date(`${form.date}T${form.start_time}:00`);
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    const res = await createSession({
      activity_id: form.activity_id,
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
      capacity: Number(form.capacity),
      status: 'scheduled',
    });

    setSaving(false);
    if (res.error) {
      setFormError(res.error);
    } else {
      setModalOpen(false);
    }
  };

  const handleCancelSession = async (session: Session) => {
    if (!window.confirm('¿Confirmás cancelar esta sesión?')) return;
    await updateSession(session.id, { status: 'cancelled' });
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-bold text-brand-900">Sesiones y Horarios</h1>
          <p className="text-xs text-brand-400">Programá las clases y cupos disponibles en el calendario</p>
        </div>
        <Button
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={openCreate}
          disabled={activities.length === 0}
        >
          Nueva sesión
        </Button>
      </div>

      {/* Filtro por actividad */}
      {activities.length > 0 && (
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedActivityId('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedActivityId === ''
                ? 'bg-brand-900 text-white'
                : 'bg-white text-brand-600 border border-brand-200 hover:bg-brand-50'
            }`}
          >
            Todas las actividades
          </button>
          {activities.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedActivityId(a.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedActivityId === a.id
                  ? 'bg-brand-900 text-white'
                  : 'bg-white text-brand-600 border border-brand-200 hover:bg-brand-50'
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="w-5 h-5 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activities.length === 0 ? (
        <EmptyState
          icon={<Calendar className="w-6 h-6" />}
          title="Primero creá una actividad"
          description="Para poder programar sesiones y recibir turnos, necesitás definir al menos una actividad."
        />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Calendar className="w-6 h-6" />}
          title="No hay sesiones programadas"
          description="Agregá fechas y horarios para que los alumnos puedan reservar su lugar."
          action={
            <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>
              Programar sesión
            </Button>
          }
        />
      ) : (
        <div className="bg-white border border-brand-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50/70 text-brand-600">
                  <th className="py-2.5 px-4 font-semibold">Fecha y Hora</th>
                  <th className="py-2.5 px-4 font-semibold">Actividad</th>
                  <th className="py-2.5 px-4 font-semibold text-center">Ocupación</th>
                  <th className="py-2.5 px-4 font-semibold">Estado</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100">
                {sessions.map((s) => {
                  const start = new Date(s.start_time);
                  const end = new Date(s.end_time);
                  const isCancelled = s.status === 'cancelled';

                  const dateStr = start.toLocaleDateString('es-AR', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  });
                  const timeStr = `${start.toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })} - ${end.toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`;

                  const actName = (s as any).activities?.name || 'Actividad';

                  return (
                    <tr key={s.id} className="hover:bg-brand-50/40 transition-colors">
                      <td className="py-3 px-4 font-medium text-brand-900">
                        <div className="capitalize">{dateStr}</div>
                        <div className="text-[11px] text-brand-400 font-mono flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {timeStr}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-brand-800">
                        {actName}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1 font-semibold text-brand-700">
                          <Users className="w-3 h-3 text-brand-400" />
                          {s.booked_count} / {s.capacity}
                        </div>
                        <div className="w-16 bg-brand-100 rounded-full h-1.5 mx-auto mt-1 overflow-hidden">
                          <div
                            className={`h-full ${
                              s.booked_count >= s.capacity ? 'bg-terracotta-500' : 'bg-brand-700'
                            }`}
                            style={{
                              width: `${Math.min(100, (s.booked_count / s.capacity) * 100)}%`,
                            }}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            isCancelled
                              ? 'danger'
                              : s.status === 'completed'
                              ? 'muted'
                              : s.booked_count >= s.capacity
                              ? 'warning'
                              : 'success'
                          }
                        >
                          {isCancelled
                            ? 'Cancelada'
                            : s.status === 'completed'
                            ? 'Completada'
                            : s.booked_count >= s.capacity
                            ? 'Agotada'
                            : 'Disponible'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {!isCancelled && (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleCancelSession(s)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            Cancelar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nueva Sesión */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Programar nueva sesión">
        {formError && (
          <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <Select
            label="Actividad"
            options={activities.map((a) => ({ value: a.id, label: a.name }))}
            value={form.activity_id}
            onChange={(e) => handleActivityChange(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Fecha"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
            <Input
              label="Hora de inicio"
              type="time"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              required
            />
          </div>

          <Input
            label="Cupo máximo disponible"
            type="number"
            min={1}
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
            required
          />

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Crear sesión
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
