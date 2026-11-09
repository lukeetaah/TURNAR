import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Megaphone, Calendar } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

interface Announcement {
  id: string;
  title: string;
  content: string;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

export const Communications: React.FC = () => {
  const { orgId } = useOrg();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    content: '',
    is_published: true,
  });

  const fetchAnnouncements = useCallback(async () => {
    if (!supabase || !orgId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('announcements')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setAnnouncements(data ?? []);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !orgId) return;

    setSaving(true);
    setFormError(null);

    const now = new Date().toISOString();
    const { error: err } = await supabase.from('announcements').insert({
      organization_id: orgId,
      title: form.title.trim(),
      content: form.content.trim(),
      is_published: form.is_published,
      published_at: form.is_published ? now : null,
    } as never);

    setSaving(false);
    if (err) {
      setFormError(err.message);
    } else {
      setModalOpen(false);
      setForm({ title: '', content: '', is_published: true });
      await fetchAnnouncements();
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-bold text-brand-900">Comunicaciones y Avisos</h1>
          <p className="text-xs text-brand-400">
            Publicá avisos generales, cambios de cronograma o novedades para los alumnos
          </p>
        </div>
        <Button
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => {
            setFormError(null);
            setModalOpen(true);
          }}
        >
          Nuevo comunicado
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
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="w-6 h-6" />}
          title="No hay comunicados publicados"
          description="Publicá novedades para que se muestren en el portal de alumnos y en la página pública."
          action={
            <Button
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setModalOpen(true)}
            >
              Crear primer aviso
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div
              key={a.id}
              className="bg-white border border-brand-200 rounded-xl p-4 shadow-2xs"
            >
              <div className="flex items-start justify-between gap-3 mb-1">
                <h3 className="text-sm font-bold text-brand-900">{a.title}</h3>
                <Badge variant={a.is_published ? 'success' : 'muted'}>
                  {a.is_published ? 'Publicado' : 'Borrador'}
                </Badge>
              </div>
              <p className="text-xs text-brand-600 whitespace-pre-line mb-3">
                {a.content}
              </p>
              <div className="text-[11px] text-brand-400 border-t border-brand-100 pt-2 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(a.created_at).toLocaleDateString('es-AR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Nuevo Comunicado */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo comunicado">
        {formError && (
          <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Título"
            placeholder="Ej. Feriado del lunes: se reprograman clases"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />

          <Textarea
            label="Mensaje"
            placeholder="Escribí aquí el cuerpo del aviso..."
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={4}
            required
          />

          <label className="flex items-center gap-2 cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
              className="rounded border-brand-300 text-brand-900 focus:ring-brand-900"
            />
            <span className="text-xs text-brand-700 font-medium">Publicar inmediatamente</span>
          </label>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Publicar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
