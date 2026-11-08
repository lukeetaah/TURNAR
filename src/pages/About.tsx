import React from 'react';
import { MessageCircle, Heart, ExternalLink, Sparkles, Palette } from 'lucide-react';
import { APP_CONFIG } from '@/core/config';

export const About: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 md:py-16 space-y-12">
      <div>
        <span className="text-xs font-semibold tracking-wider text-terracotta-600 uppercase block mb-1">
          Identidad y Propósito
        </span>
        <h1 className="text-3xl font-extrabold text-brand-900 tracking-tight mb-4">
          Acerca de TURNAR
        </h1>
        <p className="text-base text-brand-600 leading-relaxed">
          TURNAR es una plataforma web de gestión modular creada por{' '}
          <strong className="text-brand-800">{APP_CONFIG.creator}</strong> para personas, profesionales, talleres, academias y pequeños emprendimientos.
        </p>
      </div>

      {/* Filosofía */}
      <div className="bg-white border border-brand-200 rounded-xl p-6 sm:p-8 space-y-4">
        <h2 className="text-lg font-bold text-brand-900">
          Nuestra Filosofía
        </h2>
        <p className="text-sm text-brand-600 leading-relaxed">
          TURNAR nace con un objetivo claro: facilitar el trabajo diario de quienes gestionan actividades y talleres, sin imponer barreras económicas innecesarias ni obligar a aprender herramientas corporativas pesadas.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-brand-100">
          <div>
            <h4 className="text-xs font-semibold text-brand-800 mb-1">Sin publicidad</h4>
            <p className="text-xs text-brand-500">No mostramos anuncios invasivos ni comercializamos datos.</p>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-brand-800 mb-1">Plan gratuito real</h4>
            <p className="text-xs text-brand-500">Límites claros y transparentes sin bloquear funciones esenciales.</p>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-brand-800 mb-1">Simplicidad extrema</h4>
            <p className="text-xs text-brand-500">Formularios breves, acciones visibles y mobile-first.</p>
          </div>
        </div>
      </div>

      {/* Caso piloto: Lava Cerámica */}
      <div className="bg-terracotta-50/60 border border-terracotta-200/80 rounded-xl p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <Palette className="w-5 h-5 text-terracotta-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-bold text-terracotta-900 mb-1">
              LAVA CERÁMICA: Nuestro primer caso real
            </h3>
            <p className="text-xs text-terracotta-800 leading-relaxed mb-3">
              LAVA CERÁMICA es el primer espacio de trabajo real y el piloto de implementación personalizada. Demuestra cómo una organización real configura sus clases para adultos y niños, turnos de mañana y tarde, y cupos sin duplicar código ni crear una aplicación aislada.
            </p>
            <span className="text-[11px] font-medium text-terracotta-700 bg-terracotta-100/80 px-2 py-0.5 rounded">
              Slug oficial reservado: lava-ceramica
            </span>
          </div>
        </div>
      </div>

      {/* Personalizaciones a medida (WhatsApp LUKSONARTS) */}
      <div className="bg-white border border-brand-200 rounded-xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="max-w-lg">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-brand-900">
              {APP_CONFIG.customDev.title}
            </h3>
          </div>
          <p className="text-xs text-brand-600 leading-relaxed">
            {APP_CONFIG.customDev.description}
          </p>
        </div>
        <a
          href={APP_CONFIG.customDevWhatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-4 py-2.5 rounded-lg transition-colors shadow-xs shrink-0"
        >
          <MessageCircle className="w-4 h-4 text-emerald-600" />
          {APP_CONFIG.customDev.buttonText}
        </a>
      </div>

      {/* Apoyo voluntario a LUKSONARTS */}
      <div className="bg-white border border-brand-200 rounded-xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="max-w-lg">
          <div className="flex items-center gap-2 mb-1">
            <Heart className="w-4 h-4 text-terracotta-500 fill-terracotta-400" />
            <h3 className="text-sm font-semibold text-brand-900">
              {APP_CONFIG.voluntarySupport.title}
            </h3>
          </div>
          <p className="text-xs text-brand-600 leading-relaxed">
            TURNAR es un desarrollo independiente. Si la herramienta te resulta de utilidad y querés colaborar voluntariamente para sostener el proyecto, podés hacer un aporte.
          </p>
        </div>
        <a
          href={APP_CONFIG.supportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs font-semibold text-terracotta-800 bg-terracotta-50 hover:bg-terracotta-100 border border-terracotta-300 px-4 py-2.5 rounded-lg transition-colors shadow-xs shrink-0"
        >
          <Heart className="w-4 h-4 text-terracotta-500 fill-terracotta-400" />
          {APP_CONFIG.voluntarySupport.buttonText}
          <ExternalLink className="w-3.5 h-3.5 text-terracotta-400" />
        </a>
      </div>
    </div>
  );
};
