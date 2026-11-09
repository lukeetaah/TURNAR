import React, { useState } from 'react';
import { Dumbbell, Plus, Edit2, CheckCircle2, XCircle } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useActivities, type Activity } from '@/hooks/useActivities';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

export const Activities: React.FC = () => {
  const { orgId } = useOrg();
  const { activities, loading, error, createActivity, updateActivity } = useActivities(orgId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    duration_minutes: 60,
    default_capacity: 10,
    price_cents: 0,
    is_public: true,
    is_active: true,
  });

  const openCreate = () => {
    setEditingActivity(null);
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
      res = await updateActivity(editingActivity.id, payload);
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

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-bold text-brand-900">Actividades</h1>
          <p className="text-xs text-brand-400">Gestioná los talleres, clases y servicios que ofrecés</p>
        </div>
        <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>
          Nueva actividad
        </Button>
      </div>

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
          icon={<Dumbbell className="w-6 h-6" />}
          title="No tenés actividades registradas"
          description="Creá una actividad (ej. Taller de Cerámica, Torno, Esmaltado) para comenzar a publicar horarios y recibir reservas."
          action={
            <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>
              Crear primera actividad
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activities.map((act) => (
            <div
              key={act.id}
              className="bg-white rounded-xl border border-brand-200 p-4 shadow-2xs hover:border-brand-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-bold text-brand-900 truncate">{act.name}</h3>
                  <Badge variant={act.is_active ? 'success' : 'muted'}>
                    {act.is_active ? 'Activa' : 'Inactiva'}
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
                  {act.is_public ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-green-600" /> Visible en web
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3 text-brand-400" /> Privada
                    </>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  icon={<Edit2 className="w-3 h-3" />}
                  onClick={() => openEdit(act)}
                >
                  Editar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear / Editar */}
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

        <form onSubmit={handleSubmit} className="space-y-3">
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
    </div>
  );
};
