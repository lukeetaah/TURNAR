import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft, Globe, HelpCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useOrg } from '@/contexts/OrgContext';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';

const CATEGORIES = [
  { value: 'ceramics', label: 'Cerámica y Alfarería' },
  { value: 'yoga', label: 'Yoga y Meditación' },
  { value: 'pilates', label: 'Pilates' },
  { value: 'dance', label: 'Danza y Expresión Corporal' },
  { value: 'fitness', label: 'Entrenamiento y Fitness' },
  { value: 'martial_arts', label: 'Artes Marciales' },
  { value: 'music', label: 'Música y Canto' },
  { value: 'painting', label: 'Pintura y Dibujo' },
  { value: 'cooking', label: 'Gastronomía y Cocina' },
  { value: 'crafts', label: 'Oficios y Manualidades' },
  { value: 'other', label: 'Otra actividad' },
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
  const { refetchOrgs } = useOrg();
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

    const cleanSlug = form.slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '');

    if (!cleanSlug) {
      setError('Ingresá una dirección válida para tu espacio.');
      return;
    }

    setLoading(true);
    setError(null);

    const { error: err } = await supabase.rpc(
      'create_organization_with_owner',
      {
        p_name: form.name.trim(),
        p_slug: cleanSlug,
        p_description: form.description.trim() || null,
        p_activity_category: form.activity_category || null,
        p_timezone: form.timezone,
      }
    );

    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }

    // Asegurar que el nuevo espacio figure en el directorio público por defecto
    await supabase
      .from('organizations')
      .update({ is_directory_listed: true })
      .eq('slug', cleanSlug);

    // Actualizar inmediatamente la lista de organizaciones en memoria
    await refetchOrgs();
    setLoading(false);

    // Navegar al dashboard del espacio recién creado
    navigate(`/app/${cleanSlug}/dashboard`);
  };

  const publicUrlPreview = `${window.location.origin}/o/${form.slug || 'tu-espacio'}`;

  return (
    <div className="min-h-screen bg-brand-50 flex items-start justify-center pt-10 pb-16 px-4">
      <div className="w-full max-w-md">
        <button
          onClick={() => navigate('/app')}
          className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-800 mb-5 transition-colors font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a mis espacios
        </button>

        <div className="bg-white rounded-2xl border border-brand-200 p-6 sm:p-8 shadow-xs">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-brand-100">
            <div className="w-10 h-10 rounded-xl bg-brand-900 text-terracotta-400 font-bold flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-brand-900">Crear nuevo espacio</h1>
              <p className="text-xs text-brand-400">Configurá tu taller, estudio o centro de actividades</p>
            </div>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 leading-relaxed">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Nombre del espacio"
              placeholder="Ej. Lava Cerámica"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
            />

            <div>
              <Input
                label="Dirección del espacio"
                placeholder="ejemplo: lava-ceramica"
                value={form.slug}
                onChange={(e) =>
                  set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                }
                required
              />
              <p className="mt-1 text-[11px] text-brand-400 flex items-start gap-1 leading-normal">
                <HelpCircle className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
                <span>
                  Esta dirección se utiliza para crear el enlace público de tu espacio. Tus clientes
                  podrán ingresar desde este enlace para consultar actividades y reservar.
                </span>
              </p>

              {form.slug && (
                <div className="mt-2 p-2.5 rounded-lg bg-brand-50 border border-brand-100 flex items-center gap-2 text-xs font-mono text-brand-700 overflow-hidden">
                  <Globe className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                  <span className="truncate">{publicUrlPreview}</span>
                </div>
              )}
            </div>

            <Select
              label="Rubro o categoría principal"
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
              label="Descripción pública (opcional)"
              placeholder="Contanos brevemente qué hacés, qué clases ofrecés o dónde estás ubicado..."
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
            />

            <div className="pt-2">
              <Button type="submit" loading={loading} className="w-full" size="md">
                Crear y abrir espacio
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
