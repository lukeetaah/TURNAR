import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  MapPin,
  Calendar,
  Sparkles,
  ArrowRight,
  Building2,
  Dumbbell,
  Filter,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import {
  DIRECTORY_CATEGORIES,
  formatCategoryLabel,
  isCategoryMatched,
} from '@/core/categories';

interface DirectorySpace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  activity_category: string | null;
  logo_url: string | null;
  address: string | null;
  activities?: Array<{
    name: string;
    duration_minutes: number;
    price_cents: number;
  }>;
}

export const Home: React.FC = () => {
  const [spaces, setSpaces] = useState<DirectorySpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    const fetchDirectory = async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      setLoading(true);

      let spacesList: DirectorySpace[] = [];

      // 1. Intentar consultar la vista segura del directorio público
      const { data: viewData, error: viewErr } = await supabase
        .from('public_directory_organizations')
        .select('*')
        .order('name');

      if (!viewErr && viewData && viewData.length > 0) {
        spacesList = viewData as DirectorySpace[];
      }

      // 2. Consultar organizaciones activas para asegurar que espacios nuevos (ej. LABURANTE)
      //    que aún no tengan la migración de listado no queden afuera del directorio
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, name, slug, description, activity_category, logo_url, address, is_directory_listed')
        .eq('is_active', true)
        .order('name');

      if (orgData) {
        const existingIds = new Set(spacesList.map((s) => s.id));
        const missingSpaces = orgData
          .filter((o: any) => !existingIds.has(o.id) && o.is_directory_listed !== false)
          .map((o: any) => ({
            id: o.id,
            name: o.name,
            slug: o.slug,
            description: o.description,
            activity_category: o.activity_category,
            logo_url: o.logo_url,
            address: o.address,
            activities: [],
          }));

        spacesList = [...spacesList, ...missingSpaces];
      }

      setSpaces(spacesList);
      setLoading(false);
    };

    fetchDirectory();
  }, []);

  // Filtrado reactivo en memoria por nombre, descripción, rubro o dirección
  const filteredSpaces = spaces.filter((space) => {
    const term = search.toLowerCase().trim();
    const matchesSearch =
      !term ||
      space.name.toLowerCase().includes(term) ||
      (space.description || '').toLowerCase().includes(term) ||
      (space.activity_category || '').toLowerCase().includes(term) ||
      (space.address || '').toLowerCase().includes(term) ||
      (space.activities || []).some((a) => a.name.toLowerCase().includes(term));

    const matchesCat = isCategoryMatched(space.activity_category, selectedCategory);

    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-12 py-8 md:py-14">
      {/* Hero & Directorio Header */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-100/80 border border-brand-200 text-brand-700 text-xs font-medium mb-4">
          <Sparkles className="w-3.5 h-3.5 text-terracotta-500" />
          <span>Directorio público de espacios</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-brand-900 tracking-tight leading-tight mb-4">
          Descubrí talleres y reservá tu lugar en un clic.
        </h1>

        <p className="text-sm sm:text-base text-brand-600 max-w-2xl mx-auto mb-8 leading-relaxed">
          Explorá las actividades de los espacios que eligen TURNAR. Consultá cronogramas, precios y anotate a clases sin necesidad de crear una cuenta previa.
        </p>

        {/* Buscador interactivo de ancho completo y generoso */}
        <div className="max-w-3xl sm:max-w-4xl mx-auto mt-6">
          <div className="relative shadow-md rounded-2xl bg-white border-2 border-brand-200/90 focus-within:border-brand-900 focus-within:ring-4 focus-within:ring-brand-900/10 transition-all">
            <Search className="w-5 h-5 text-brand-400 absolute left-4.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por taller, cerámica, yoga, disciplina o dirección..."
              className="w-full pl-12 pr-24 py-4 text-sm sm:text-base bg-transparent rounded-2xl focus:outline-none placeholder:text-brand-400 text-brand-900 font-medium"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-brand-400 hover:text-brand-800 bg-brand-100/70 hover:bg-brand-200 px-2.5 py-1 rounded-lg transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Filtros de Categoría con scroll suave y botones legibles */}
          <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-2 justify-start sm:justify-center">
            {DIRECTORY_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-2xs ${
                  selectedCategory === cat.value
                    ? 'bg-brand-900 text-white shadow-xs scale-[1.02]'
                    : 'bg-white text-brand-700 border border-brand-200/90 hover:bg-brand-50 hover:border-brand-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Grid de Espacios del Directorio */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6 pb-2 border-b border-brand-200">
          <div className="flex items-center gap-2 text-xs font-bold text-brand-900">
            <Building2 className="w-4 h-4 text-brand-600" />
            <span>
              Espacios verificados ({filteredSpaces.length})
            </span>
          </div>

          <Link
            to="/app/create-org"
            className="text-xs text-terracotta-600 font-semibold hover:text-terracotta-800 transition-colors inline-flex items-center gap-1"
          >
            <span>¿Tenés un taller? Publicá tu espacio</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <span className="w-6 h-6 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredSpaces.length === 0 ? (
          <div className="bg-white rounded-2xl border border-brand-200 p-8 sm:p-12 text-center max-w-lg mx-auto shadow-xs">
            <Filter className="w-10 h-10 text-brand-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-brand-900 mb-1">
              No se encontraron espacios con esos filtros
            </h3>
            <p className="text-xs text-brand-500 mb-6 leading-relaxed">
              {search
                ? `No hay resultados para "${search}". Probá con otro término o seleccioná otra disciplina.`
                : 'Actualmente no hay espacios publicados en esta categoría.'}
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="xs"
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('all');
                }}
              >
                Ver todos los espacios
              </Button>
              <Link to="/app/create-org">
                <Button size="xs">Crear el primero</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredSpaces.map((space) => (
              <div
                key={space.id}
                className="bg-white rounded-2xl border border-brand-200 p-5 shadow-2xs hover:border-brand-400 hover:shadow-xs transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Header de la tarjeta */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl bg-brand-900 text-terracotta-400 font-bold text-base flex items-center justify-center shrink-0">
                      {space.logo_url ? (
                        <img
                          src={space.logo_url}
                          alt={space.name}
                          className="w-full h-full object-cover rounded-xl"
                        />
                      ) : (
                        space.name[0].toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-brand-900 truncate">
                        {space.name}
                      </h3>
                      {space.activity_category && (
                        <span className="text-[11px] font-semibold text-terracotta-600 block">
                          {formatCategoryLabel(space.activity_category)}
                        </span>
                      )}
                      {space.address && (
                        <span className="text-[11px] text-brand-400 flex items-center gap-1 mt-0.5 truncate">
                          <MapPin className="w-3 h-3 text-brand-400 shrink-0" />
                          <span>{space.address}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Descripción */}
                  <p className="text-xs text-brand-600 line-clamp-3 mb-4 leading-relaxed">
                    {space.description || 'Espacio dedicado al dictado de clases y talleres formativos.'}
                  </p>

                  {/* Actividades destacadas */}
                  {space.activities && space.activities.length > 0 && (
                    <div className="mb-4 pt-3 border-t border-brand-100">
                      <span className="text-[10px] uppercase font-bold text-brand-400 tracking-wider block mb-2">
                        Actividades programadas
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {space.activities.slice(0, 3).map((act, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-[11px] font-medium text-brand-700 border border-brand-100"
                          >
                            <Dumbbell className="w-2.5 h-2.5 text-brand-400" />
                            <span>{act.name}</span>
                          </span>
                        ))}
                        {space.activities.length > 3 && (
                          <span className="text-[10px] text-brand-400 self-center">
                            +{space.activities.length - 3} más
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer de la tarjeta */}
                <div className="pt-3 border-t border-brand-100">
                  <Link to={`/o/${space.slug}`} className="block">
                    <Button variant="primary" size="sm" className="w-full justify-between">
                      <span>Ver turnos y reservar</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CTA para Organizaciones */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="bg-brand-900 text-white rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs text-terracotta-300 font-medium mb-2">
              <Calendar className="w-4 h-4 text-terracotta-400" />
              <span>Gestión simplificada para docentes y emprendedores</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-1.5">
              ¿Dictás clases o tenés un espacio propio?
            </h3>
            <p className="text-xs text-brand-300 max-w-md leading-relaxed">
              Creá tu espacio en TURNAR para organizar tus turnos, automatizar cupos, controlar pagos y compartir tu página pública con tus alumnos.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link to="/login">
              <Button variant="secondary" size="sm">
                Iniciar sesión
              </Button>
            </Link>
            <Link to="/app/create-org">
              <button className="px-4 py-2 rounded-lg bg-terracotta-500 hover:bg-terracotta-600 text-white font-semibold text-xs transition-colors shadow-xs">
                Crear mi espacio
              </button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
