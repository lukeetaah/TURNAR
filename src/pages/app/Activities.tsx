import React, { useState } from 'react';
import {
  Dumbbell,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  Trash2,
  Archive,
  AlertTriangle,
  Info,
  RotateCcw,
} from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useActivities, type Activity, type ActivityDependencies } from '@/hooks/useActivities';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

export const Activities: React.FC = () => {
  const { orgId } = useOrg();
  const {
    activities,
    loading,
    error,
    createActivity,
    updateActivityWithScope,
    analyzeActivityDependencies,
    archiveActivity,
    unarchiveActivity,
    deleteActivityIntelligent,
  } = useActivities(orgId, true);

  // Filtro de lista: Activas vs Archivadas
  const [tabFilter, setTabFilter] = useState<'active' | 'archived'>('active');

  // Modal Crear / Editar
  const [modalOpen, setModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Formulario
  const [form, setForm] = useState({
    name: '',
    description: '',
    duration_minutes: 60,
    default_capacity: 10,
    price_cents: 0,
    is_public: true,
    is_active: true,
  });

  // Alcance de la modificación (Section 3)
  const [editScope, setEditScope] = useState<'only_activity' | 'future_unbooked' | 'future_all'>('only_activity');

  // Modal de Ciclo de Vida y Análisis de Dependencias (Section 2)
  const [lifecycleModalOpen, setLifecycleModalOpen] = useState(false);
  const [targetActivity, setTargetActivity] = useState<Activity | null>(null);
  const [depLoading, setDepLoading] = useState(false);
  const [dependencies, setDependencies] = useState<ActivityDependencies | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const openCreate = () => {
    setEditingActivity(null);
    setEditScope('only_activity');
    setForm({
      name: '',
      description: '',
      duration_minutes: 60,
      default_capacity: 10,
      price_cents: 0,
      is_public: true,
      is_active: true,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (act: Activity) => {
    setEditingActivity(act);
    setEditScope('only_activity');
    setForm({
      name: act.name,
      description: act.description || '',
      duration_minutes: act.duration_minutes,
      default_capacity: act.default_capacity,
      price_cents: act.price_cents,
      is_public: act.is_public,
      is_active: act.is_active,
    });
    setFormError(null);
    setModalOpen(true);
  };

  // Abrir análisis de ciclo de vida (eliminar / archivar)
  const openLifecycle = async (act: Activity) => {
    setTargetActivity(act);
    setDependencies(null);
    setActionMsg(null);
    setDepLoading(true);
    setLifecycleModalOpen(true);

    const deps = await analyzeActivityDependencies(act.id);
    setDependencies(deps);
    setDepLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      duration_minutes: Number(form.duration_minutes),
      default_capacity: Number(form.default_capacity),
      price_cents: Number(form.price_cents),
      is_public: Boolean(form.is_public),
      is_active: Boolean(form.is_active),
    };

    let res;
    if (editingActivity) {
      res = await updateActivityWithScope(editingActivity.id, payload, editScope);
    } else {
      res = await createActivity(payload);
    }

    setSaving(false);
    if (res.error) {
      setFormError(res.error);
    } else {
      setModalOpen(false);
    }
  };

  // Ejecutar archivo seguro
  const handleArchive = async () => {
    if (!targetActivity) return;
    setActionLoading(true);
    setActionMsg(null);

    const res = await archiveActivity(targetActivity.id);
    setActionLoading(false);

    if (res.error) {
      setActionMsg({ type: 'err', text: res.error });
    } else {
      setActionMsg({
        type: 'ok',
        text: '¡Actividad archivada exitosamente! Se retiró de las reservas públicas pero se preservaron todas las reservas y el historial.',
      });
      setTimeout(() => {
        setLifecycleModalOpen(false);
      }, 1500);
    }
  };

  // Reactivar rápido desde la tarjeta
  const handleQuickUnarchive = async (act: Activity) => {
    if (!window.confirm(`¿Reactivar "${act.name}"? Volverá a estar visible en tu listado activo y disponible para reservas públicas.`)) {
      return;
    }
    const res = await unarchiveActivity(act.id);
    if (res.error) {
      alert(`Error al reactivar: ${res.error}`);
    }
  };

  // Reactivar desde el modal
  const handleModalUnarchive = async () => {
    if (!targetActivity) return;
    setActionLoading(true);
    setActionMsg(null);

    const res = await unarchiveActivity(targetActivity.id);
    setActionLoading(false);

    if (res.error) {
      setActionMsg({ type: 'err', text: res.error });
    } else {
      setActionMsg({
        type: 'ok',
        text: '¡Actividad reactivada con éxito! Ya se encuentra en tu listado activo.',
      });
      setTimeout(() => {
        setLifecycleModalOpen(false);
      }, 1500);
    }
  };

  // Ejecutar eliminación según el modo
  const handleDelete = async (mode: 'delete_pure' | 'clean_unbooked_future_and_archive') => {
    if (!targetActivity) return;
    setActionLoading(true);
    setActionMsg(null);

    const res = await deleteActivityIntelligent(targetActivity.id, mode);
    setActionLoading(false);

    if (res.error) {
      setActionMsg({ type: 'err', text: res.error });
    } else {
      setActionMsg({
        type: 'ok',
        text: res.message || 'Operación realizada correctamente.',
      });
      setTimeout(() => {
        setLifecycleModalOpen(false);
      }, 1500);
    }
  };

  // Filtrado de actividades
  const filteredActivities = activities.filter((act) => {
    if (tabFilter === 'archived') return act.is_archived === true;
    return !act.is_archived;
  });

  const archivedCount = activities.filter((a) => a.is_archived).length;
  const activeCount = activities.filter((a) => !a.is_archived).length;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* ── Encabezado ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-brand-900">Actividades</h1>
          <p className="text-xs text-brand-400">
            Gestioná los talleres, clases y servicios que ofrecés con control de ciclo de vida
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Selector de pestañas */}
          <div className="flex bg-brand-100/80 p-1 rounded-xl border border-brand-200/60 text-xs font-semibold">
            <button
              onClick={() => setTabFilter('active')}
              className={`px-3 py-1 rounded-lg transition-all ${
                tabFilter === 'active'
                  ? 'bg-white text-brand-900 shadow-xs'
                  : 'text-brand-600 hover:text-brand-900'
              }`}
            >
              Activas ({activeCount})
            </button>
            <button
              onClick={() => setTabFilter('archived')}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                tabFilter === 'archived'
                  ? 'bg-white text-brand-900 shadow-xs'
                  : 'text-brand-600 hover:text-brand-900'
              }`}
            >
              <Archive className="w-3.5 h-3.5 text-brand-600" />
              <span>Archivadas ({archivedCount})</span>
            </button>
          </div>

          <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>
            Nueva actividad
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="w-5 h-5 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredActivities.length === 0 ? (
        <EmptyState
          icon={<Dumbbell className="w-6 h-6" />}
          title={tabFilter === 'archived' ? 'No tenés actividades archivadas' : 'No tenés actividades registradas'}
          description={
            tabFilter === 'archived'
              ? 'Las actividades que archives para retirar de la oferta pública sin perder su historial aparecerán acá.'
              : 'Creá una actividad (ej. Taller de Cerámica, Torno, Esmaltado) para comenzar a publicar horarios y recibir reservas.'
          }
          action={
            tabFilter === 'active' ? (
              <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>
                Crear primera actividad
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredActivities.map((act) => (
            <div
              key={act.id}
              className={`bg-white rounded-xl border p-4 shadow-2xs transition-all flex flex-col justify-between ${
                act.is_archived
                  ? 'border-brand-200 bg-brand-50/40 opacity-85'
                  : 'border-brand-200 hover:border-brand-300'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-bold text-brand-900 truncate">{act.name}</h3>
                  <Badge
                    variant={
                      act.is_archived
                        ? 'default'
                        : act.is_active
                        ? 'success'
                        : 'muted'
                    }
                  >
                    {act.is_archived ? 'Archivada' : act.is_active ? 'Activa' : 'Inactiva'}
                  </Badge>
                </div>
                <p className="text-xs text-brand-500 line-clamp-2 mb-3">
                  {act.description || 'Sin descripción detallada.'}
                </p>
                <div className="grid grid-cols-3 gap-2 py-2 border-t border-brand-100 text-center">
                  <div>
                    <span className="block text-[10px] text-brand-400">Duración</span>
                    <span className="text-xs font-semibold text-brand-800">{act.duration_minutes}m</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-brand-400">Cupo</span>
                    <span className="text-xs font-semibold text-brand-800">{act.default_capacity} lug.</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-brand-400">Precio</span>
                    <span className="text-xs font-semibold text-brand-800">
                      {act.price_cents > 0 ? `$${(act.price_cents / 100).toLocaleString('es-AR')}` : 'Gratis'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-brand-100 mt-2">
                <span className="text-[11px] text-brand-400 flex items-center gap-1">
                  {act.is_archived ? (
                    <span className="text-brand-500 font-medium">Fuera de reservas</span>
                  ) : act.is_public ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-green-600" /> Visible en web
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3 text-brand-400" /> Privada
                    </>
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  {act.is_archived ? (
                    <>
                      <Button
                        variant="secondary"
                        size="xs"
                        icon={<RotateCcw className="w-3 h-3 text-emerald-600" />}
                        onClick={() => handleQuickUnarchive(act)}
                        title="Reactivar actividad para volver a publicarla"
                      >
                        Reactivar
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={<Trash2 className="w-3 h-3 text-red-500" />}
                        onClick={() => openLifecycle(act)}
                        title="Opciones de eliminación"
                      >
                        Eliminar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={<Edit2 className="w-3 h-3" />}
                        onClick={() => openEdit(act)}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={<Trash2 className="w-3 h-3 text-red-500" />}
                        onClick={() => openLifecycle(act)}
                        title="Eliminar o archivar actividad con evaluación de dependencias"
                      >
                        Eliminar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal Crear / Editar Actividad con Alcance ── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingActivity ? 'Editar actividad' : 'Nueva actividad'}
      >
        {formError && (
          <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <Input
            label="Nombre de la actividad"
            placeholder="Ej. Taller Inicial de Torno"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />

          <Textarea
            label="Descripción"
            placeholder="Detalles sobre qué incluye, materiales, nivel requerido..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Duración (minutos)"
              type="number"
              min={15}
              step={15}
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
              required
            />
            <Input
              label="Cupo predeterminado"
              type="number"
              min={1}
              value={form.default_capacity}
              onChange={(e) => setForm({ ...form, default_capacity: Number(e.target.value) })}
              required
            />
          </div>

          <Input
            label="Precio (en centavos, ej. 2500000 = $25.000)"
            type="number"
            min={0}
            value={form.price_cents}
            onChange={(e) => setForm({ ...form, price_cents: Number(e.target.value) })}
            hint={
              form.price_cents > 0
                ? `Equivale a $${(form.price_cents / 100).toLocaleString('es-AR')}`
                : 'Dejá en 0 si es libre o coordinado externamente'
            }
          />

          {/* Selector de Alcance de Modificación (Section 3) */}
          {editingActivity && (
            <div className="p-3 bg-brand-50 border border-brand-200 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-brand-900">
                Alcance de la modificación:
              </label>
              <div className="space-y-1.5 text-xs">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    value="only_activity"
                    checked={editScope === 'only_activity'}
                    onChange={() => setEditScope('only_activity')}
                    className="mt-0.5 text-brand-900 focus:ring-brand-900"
                  />
                  <div>
                    <span className="font-semibold text-brand-800">Solo nuevas programaciones</span>
                    <span className="block text-[11px] text-brand-500">
                      No altera las sesiones ya creadas en el calendario.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    value="future_unbooked"
                    checked={editScope === 'future_unbooked'}
                    onChange={() => setEditScope('future_unbooked')}
                    className="mt-0.5 text-brand-900 focus:ring-brand-900"
                  />
                  <div>
                    <span className="font-semibold text-brand-800">
                      Próximas sesiones sin reservas (Recomendado)
                    </span>
                    <span className="block text-[11px] text-brand-500">
                      Actualiza el cupo de las sesiones futuras que no tienen alumnos inscriptos.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    value="future_all"
                    checked={editScope === 'future_all'}
                    onChange={() => setEditScope('future_all')}
                    className="mt-0.5 text-brand-900 focus:ring-brand-900"
                  />
                  <div>
                    <span className="font-semibold text-brand-800">Todas las sesiones futuras</span>
                    <span className="block text-[11px] text-amber-700">
                      Afectará también las sesiones con alumnos inscriptos.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-brand-100 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_public}
                onChange={(e) => setForm({ ...form, is_public: e.target.checked })}
                className="rounded border-brand-300 text-brand-900 focus:ring-brand-900"
              />
              <span className="text-xs text-brand-700 font-medium">Publicar en la página de reservas</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="rounded border-brand-300 text-brand-900 focus:ring-brand-900"
              />
              <span className="text-xs text-brand-700 font-medium">Actividad activa</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              {editingActivity ? 'Guardar cambios' : 'Crear actividad'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Modal de Ciclo de Vida y Análisis de Dependencias (Section 2) ── */}
      <Modal
        open={lifecycleModalOpen}
        onClose={() => setLifecycleModalOpen(false)}
        title={
          targetActivity
            ? targetActivity.is_archived
              ? `Actividad Archivada: ${targetActivity.name}`
              : `Eliminar o Archivar: ${targetActivity.name}`
            : 'Gestión de actividad'
        }
      >
        <div className="space-y-4">
          {actionMsg && (
            <div
              className={`p-3 rounded-xl text-xs leading-relaxed ${
                actionMsg.type === 'ok'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}
            >
              {actionMsg.text}
            </div>
          )}

          {depLoading ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-2">
              <span className="w-6 h-6 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-brand-500">Evaluando dependencias en TURNAR...</p>
            </div>
          ) : dependencies ? (
            <div className="space-y-4">
              {/* Diagnóstico rápido y visual en 4 números */}
              <div className="bg-brand-50 border border-brand-200 rounded-xl p-3.5 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-brand-900 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-brand-700" />
                    <span>Estado en el sistema:</span>
                  </span>
                  <Badge variant={targetActivity?.is_archived ? 'default' : 'success'}>
                    {targetActivity?.is_archived ? 'Archivada' : 'Activa'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div className="p-2 bg-white rounded-lg border border-brand-200">
                    <span className="text-brand-400 block">Horarios habituales:</span>
                    <strong className="text-brand-900 text-xs">
                      {dependencies.schedules_count} {dependencies.schedules_count === 1 ? 'horario' : 'horarios'}
                    </strong>
                  </div>

                  <div className="p-2 bg-white rounded-lg border border-brand-200">
                    <span className="text-brand-400 block">Clases históricas pasadas:</span>
                    <strong className="text-brand-900 text-xs">
                      {dependencies.past_sessions_count} {dependencies.past_sessions_count === 1 ? 'clase' : 'clases'}
                    </strong>
                  </div>

                  <div className="p-2 bg-white rounded-lg border border-brand-200">
                    <span className="text-brand-400 block">Turnos futuros:</span>
                    <strong className="text-brand-900 text-xs">
                      {dependencies.future_sessions_count} turnos
                    </strong>
                    <span className="text-[10px] text-brand-500 block">
                      ({dependencies.future_sessions_with_bookings} con inscriptos · {dependencies.future_sessions_without_bookings} vacíos)
                    </span>
                  </div>

                  <div className="p-2 bg-white rounded-lg border border-brand-200">
                    <span className="text-brand-400 block">Alumnos recurrentes:</span>
                    <strong className="text-brand-900 text-xs">
                      {dependencies.active_recurring_count} {dependencies.active_recurring_count === 1 ? 'alumno' : 'alumnos'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* OPCIONES SI YA ESTÁ ARCHIVADA */}
              {targetActivity?.is_archived ? (
                <div className="space-y-3">
                  <div className="p-3.5 bg-white border border-brand-300 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                    <div>
                      <div className="font-bold text-brand-900 text-xs flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Reactivar actividad</span>
                      </div>
                      <p className="text-[11px] text-brand-500 mt-0.5 leading-relaxed">
                        Vuelve a colocar la actividad en tu lista de actividades activas y en la página pública de reservas.
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleModalUnarchive}
                      loading={actionLoading}
                      icon={<RotateCcw className="w-3 h-3" />}
                    >
                      Reactivar
                    </Button>
                  </div>

                  {/* Si tiene turnos futuros vacíos para limpiar */}
                  {dependencies.future_sessions_without_bookings > 0 && (
                    <div className="p-3.5 bg-white border border-brand-200 rounded-xl flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-brand-900 text-xs flex items-center gap-1.5">
                          <Trash2 className="w-3.5 h-3.5 text-amber-600" />
                          <span>Limpiar turnos futuros vacíos</span>
                        </div>
                        <p className="text-[11px] text-brand-500 mt-0.5 leading-relaxed">
                          Elimina los {dependencies.future_sessions_without_bookings} turnos futuros sin alumnos de esta actividad que quedaron en el calendario.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDelete('clean_unbooked_future_and_archive')}
                        loading={actionLoading}
                      >
                        Limpiar {dependencies.future_sessions_without_bookings} turnos
                      </Button>
                    </div>
                  )}

                  {/* Si no tiene reservas ni historial y se puede eliminar del todo */}
                  {!dependencies.has_bookings_or_history && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-red-900 text-xs">Eliminar definitivamente</div>
                        <p className="text-[11px] text-red-700 mt-0.5">
                          No tiene alumnos inscriptos ni historial. Podés borrarla del todo de la base de datos.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-100"
                        onClick={() => handleDelete('delete_pure')}
                        loading={actionLoading}
                        icon={<Trash2 className="w-3 h-3" />}
                      >
                        Eliminar del todo
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                /* OPCIONES SI ESTÁ ACTIVA (NO ARCHIVADA) */
                dependencies.has_bookings_or_history ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Protección de alumnos activa:</strong> Esta actividad cuenta con {dependencies.confirmed_bookings_count} reservas o historial. Para no destruir los turnos de tus alumnos, el sistema la archiva preservando todas las inscripciones.
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="p-3.5 bg-white border border-brand-300 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                        <div>
                          <div className="font-bold text-brand-900 text-xs flex items-center gap-1.5">
                            <Archive className="w-3.5 h-3.5 text-brand-700" />
                            <span>Archivar actividad (Recomendado)</span>
                          </div>
                          <p className="text-[11px] text-brand-500 mt-0.5 leading-relaxed">
                            La retira de las reservas públicas, pero <strong>conserva intactas todas las reservas</strong> e historial de los alumnos.
                          </p>
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleArchive}
                          loading={actionLoading}
                        >
                          Archivar
                        </Button>
                      </div>

                      {dependencies.future_sessions_without_bookings > 0 && (
                        <div className="p-3.5 bg-white border border-brand-300 rounded-xl flex items-center justify-between gap-3">
                          <div>
                            <div className="font-bold text-brand-900 text-xs flex items-center gap-1.5">
                              <Trash2 className="w-3.5 h-3.5 text-amber-600" />
                              <span>Limpiar turnos vacíos y archivar</span>
                            </div>
                            <p className="text-[11px] text-brand-500 mt-0.5 leading-relaxed">
                              Borra los {dependencies.future_sessions_without_bookings} turnos futuros sin alumnos y archiva la actividad, conservando las {dependencies.future_sessions_with_bookings} sesiones con alumnos.
                            </p>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDelete('clean_unbooked_future_and_archive')}
                            loading={actionLoading}
                          >
                            Limpiar y archivar
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : dependencies.future_sessions_count > 0 ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                      Esta actividad no tiene alumnos inscriptos ni historial, pero tiene <strong>{dependencies.future_sessions_count} turnos futuros vacíos</strong> en el calendario.
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        variant="primary"
                        onClick={() => handleDelete('delete_pure')}
                        loading={actionLoading}
                        icon={<Trash2 className="w-3.5 h-3.5" />}
                      >
                        Eliminar actividad y sus {dependencies.future_sessions_count} turnos vacíos
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={handleArchive}
                        loading={actionLoading}
                        icon={<Archive className="w-3.5 h-3.5" />}
                      >
                        Solo archivarla
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-800">
                      Esta actividad no tiene horarios, sesiones ni alumnos inscriptos. Podés eliminarla definitivamente de forma segura.
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="primary"
                        onClick={() => handleDelete('delete_pure')}
                        loading={actionLoading}
                        icon={<Trash2 className="w-3.5 h-3.5" />}
                      >
                        Confirmar eliminación definitiva
                      </Button>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : null}

          <div className="flex justify-end pt-2 border-t border-brand-100">
            <Button variant="secondary" onClick={() => setLifecycleModalOpen(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
