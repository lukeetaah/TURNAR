import React from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { APP_CONFIG } from '@/core/config';
import { MODULE_REGISTRY } from '@/core/modules';
import { FREE_PLAN_LIMITS } from '@/core/plans';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export const Home: React.FC = () => {
  return (
    <div className="space-y-16 py-12 md:py-20">
      {/* Hero Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-100/80 border border-brand-200 text-brand-700 text-xs font-medium mb-6">
          <Sparkles className="w-3.5 h-3.5 text-terracotta-500" />
          <span>Una creación de {APP_CONFIG.creator}</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-brand-900 tracking-tight leading-tight sm:leading-tight mb-6">
          Plataforma modular de gestión para personas, talleres y emprendimientos.
        </h1>

        <p className="text-base sm:text-lg text-brand-600 max-w-2xl mx-auto mb-8 leading-relaxed">
          Organizá tus actividades, clientes, horarios, reservas, pagos y comunicaciones desde un único lugar. Simple, intuitivo y sin barreras técnicas.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/plans"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-brand-900 text-white font-medium text-sm hover:bg-brand-800 transition-colors shadow-sm"
          >
            <span>Ver Plan Gratuito</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href={APP_CONFIG.customDevWhatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-white border border-brand-200 text-brand-800 font-medium text-sm hover:bg-brand-50 transition-colors"
          >
            <span>Desarrollo a medida</span>
          </a>
        </div>

        {/* Estado del Backend de Supabase */}
        <div className="mt-8 inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border bg-white shadow-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isSupabaseConfigured ? 'bg-emerald-500' : 'bg-amber-400'
            }`}
          />
          <span className="text-brand-600">
            {isSupabaseConfigured
              ? 'Conexión a Supabase configurada'
              : 'Supabase en modo desacoplado (pendiente configuración de proyecto independiente)'}
          </span>
        </div>
      </section>

      {/* Regla de Oro / Simplicidad */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="bg-white border border-brand-200 rounded-2xl p-6 sm:p-10 shadow-xs">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold tracking-wider text-terracotta-600 uppercase block mb-2">
              Principio fundamental
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-brand-900 mb-3">
              TURNAR se adapta a tu actividad. No tenés que aprender un sistema complejo.
            </h2>
            <p className="text-sm text-brand-600 leading-relaxed mb-6">
              Sin paneles administrativos sobrecargados de botones que nunca vas a usar. Cada persona o taller activa únicamente los módulos que necesita para su día a día.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-brand-700">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Configuración inicial en pocos minutos</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Diseño mobile-first y en español argentino</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Página pública lista para compartir por WhatsApp</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Tus datos son siempre tuyos y exportables</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Módulos previstos */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-xl mx-auto mb-10">
          <h2 className="text-2xl font-bold text-brand-900 mb-2">
            Arquitectura Modular
          </h2>
          <p className="text-sm text-brand-600">
            Un núcleo común sólido y módulos independientes con dependencias controladas.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.values(MODULE_REGISTRY).map((mod) => (
            <div
              key={mod.key}
              className="bg-white border border-brand-200/90 rounded-xl p-5 hover:border-brand-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-sm text-brand-900">
                  {mod.name}
                </h3>
                {mod.futurePhase ? (
                  <span className="text-[10px] font-medium bg-brand-100 text-brand-600 px-2 py-0.5 rounded">
                    Fase futura
                  </span>
                ) : mod.isCore ? (
                  <span className="text-[10px] font-medium bg-terracotta-50 text-terracotta-700 border border-terracotta-200 px-2 py-0.5 rounded">
                    Núcleo
                  </span>
                ) : (
                  <span className="text-[10px] font-medium bg-brand-50 text-brand-500 px-2 py-0.5 rounded">
                    Opcional
                  </span>
                )}
              </div>
              <p className="text-xs text-brand-600 leading-relaxed">
                {mod.description}
              </p>
              {mod.dependencies.length > 0 && (
                <div className="mt-3 pt-3 border-t border-brand-100 text-[11px] text-brand-400">
                  Requiere: {mod.dependencies.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Resumen del Plan Gratuito */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="bg-brand-900 text-white rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs text-terracotta-300 font-medium mb-2">
                <ShieldCheck className="w-4 h-4 text-terracotta-400" />
                <span>Modelo transparente y sustentable</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                {FREE_PLAN_LIMITS.name}
              </h3>
              <p className="text-xs text-brand-300 max-w-md leading-relaxed">
                {FREE_PLAN_LIMITS.description} Límites definidos en backend que protegen la estabilidad de la plataforma sin bloquear funciones esenciales.
              </p>
            </div>
            <Link
              to="/plans"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-terracotta-500 hover:bg-terracotta-600 text-white font-medium text-xs transition-colors shrink-0"
            >
              Consultar detalles del plan
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
