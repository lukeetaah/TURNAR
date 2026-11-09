import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';

const CATEGORIES = [
  { value: 'ceramics', label: 'Cerámica' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'pilates', label: 'Pilates' },
  { value: 'dance', label: 'Danza' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'martial_arts', label: 'Artes marciales' },
  { value: 'music', label: 'Música' },
  { value: 'painting', label: 'Pintura' },
  { value: 'cooking', label: 'Cocina' },
  { value: 'other', label: 'Otra' },
];

const TIMEZONES = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (GMT-3)' },
  { value: 'America/Montevideo', label: 'Montevideo (GMT-3)' },
  { value: 'America/Santiago', label: 'Santiago (GMT-4)' },
  { value: 'America/Bogota', label: 'Bogotá (GMT-5)' },
  { value: 'America/Lima', label: 'Lima (GMT-5)' },
  { value: 'America/Mexico_City', label: 'Ciudad de México (GMT-6)' },
  { value: 'Europe/Madrid', label: 'Madrid (GMT+1)' },
];

export const CreateOrg: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    activity_category: '',
    timezone: 'America/Argentina/Buenos_Aires',
  });

  const set = (k: string, v: string) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'name' && !f.slug) {
        next.slug = v
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc(
      'create_organization_with_owner',
      {
        p_name: form.name,
        p_slug: form.slug,
        p_description: form.description || null,
        p_activity_category: form.activity_category || null,
        p_timezone: form.timezone,
      }
    );
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    // data is the org slug returned by the RPC
    const slug = typeof data === 'string' ? data : form.slug;
    navigate(`/app/${slug}/dashboard`);
  };

  return (
    <div className="min-h-screen bg-brand-50 flex items-start justify-center pt-12 px-4">
      <div className="w-full max-w-sm">
        <button
          onClick={() => navigate('/app')}
          className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-700 mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver
        </button>
        <div className="bg-white rounded-2xl border border-brand-200 p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-brand-600" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-brand-900">Nueva organización</h1>
              <p className="text-xs text-brand-400">Configurá tu espacio de trabajo</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Nombre de la organización"
              placeholder="Lava Cerámica"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
            />
            <Input
              label="Slug (URL)"
              placeholder="lava-ceramica"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value)}
              hint={`turnar.app/o/${form.slug || 'tu-org'}`}
              required
            />
            <Select
              label="Categoría"
              options={CATEGORIES}
              placeholder="Seleccioná una categoría"
              value={form.activity_category}
              onChange={(e) => set('activity_category', e.target.value)}
            />
            <Select
              label="Zona horaria"
              options={TIMEZONES}
              value={form.timezone}
              onChange={(e) => set('timezone', e.target.value)}
            />
            <Textarea
              label="Descripción (opcional)"
              placeholder="Breve descripción de tu espacio..."
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
            />
            <Button type="submit" loading={loading} className="w-full">
              Crear organización
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
