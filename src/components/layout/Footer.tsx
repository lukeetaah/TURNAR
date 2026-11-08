import React from 'react';
import { MessageCircle, Heart, ExternalLink } from 'lucide-react';
import { APP_CONFIG } from '@/core/config';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-brand-200 bg-white mt-auto">
      {/* Sección discreta de personalizaciones a medida */}
      <div className="bg-brand-50/60 border-b border-brand-200/60 py-8 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-left">
          <div className="max-w-xl">
            <h4 className="text-sm font-semibold text-brand-900 mb-1">
              {APP_CONFIG.customDev.title}
            </h4>
            <p className="text-xs text-brand-600 leading-relaxed">
              {APP_CONFIG.customDev.description}
            </p>
          </div>
          <a
            href={APP_CONFIG.customDevWhatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-4 py-2 rounded-lg transition-colors shadow-sm shrink-0"
          >
            <MessageCircle className="w-4 h-4 text-emerald-600" />
            {APP_CONFIG.customDev.buttonText}
          </a>
        </div>
      </div>

      {/* Contenido principal del footer */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
              <span className="font-bold text-brand-900 text-sm tracking-tight">
                {APP_CONFIG.name}
              </span>
              <span className="text-brand-300">•</span>
              <span className="text-xs text-brand-500">
                Una creación de{' '}
                <span className="font-semibold text-brand-700">
                  {APP_CONFIG.creator}
                </span>
              </span>
            </div>
            <p className="text-xs text-brand-500 max-w-md">
              {APP_CONFIG.tagline}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            {/* Apoyo voluntario */}
            <a
              href={APP_CONFIG.supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-terracotta-700 hover:text-terracotta-800 bg-terracotta-50/80 hover:bg-terracotta-100 border border-terracotta-200/80 px-3 py-1.5 rounded-md transition-colors"
              title={APP_CONFIG.voluntarySupport.title}
            >
              <Heart className="w-3.5 h-3.5 text-terracotta-500 fill-terracotta-400" />
              <span>{APP_CONFIG.voluntarySupport.buttonText}</span>
              <ExternalLink className="w-3 h-3 text-terracotta-400" />
            </a>

            <a
              href={APP_CONFIG.repositoryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand-600 hover:text-brand-900 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-brand-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-brand-400">
          <p>© {new Date().getFullYear()} {APP_CONFIG.name} — {APP_CONFIG.creator}. Todos los derechos reservados.</p>
          <p>Diseño y arquitectura modular multi-tenant.</p>
        </div>
      </div>
    </footer>
  );
};
