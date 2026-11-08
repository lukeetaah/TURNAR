import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Sparkles } from 'lucide-react';
import { APP_CONFIG } from '@/core/config';

export const Header: React.FC = () => {
  return (
    <header className="border-b border-brand-200/80 bg-white/95 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-lg bg-brand-900 text-terracotta-400 flex items-center justify-center font-bold text-lg shadow-sm group-hover:bg-brand-800 transition-colors">
            T
          </div>
          <div>
            <span className="font-bold tracking-tight text-brand-900 text-lg leading-tight block">
              {APP_CONFIG.name}
            </span>
            <span className="text-[10px] text-brand-500 font-medium tracking-wider uppercase block">
              por {APP_CONFIG.creator}
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-3">
          <Link
            to="/about"
            className="text-sm font-medium text-brand-600 hover:text-brand-900 px-3 py-1.5 rounded-md hover:bg-brand-100 transition-colors"
          >
            Acerca de
          </Link>
          <Link
            to="/plans"
            className="text-sm font-medium text-brand-600 hover:text-brand-900 px-3 py-1.5 rounded-md hover:bg-brand-100 transition-colors"
          >
            Planes
          </Link>
          <a
            href={APP_CONFIG.customDevWhatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-terracotta-700 bg-terracotta-50 hover:bg-terracotta-100 border border-terracotta-200 px-3 py-1.5 rounded-md transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-terracotta-500" />
            A medida
          </a>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-brand-900 hover:bg-brand-800 px-3.5 py-2 rounded-md shadow-sm transition-colors"
          >
            <Calendar className="w-3.5 h-3.5" />
            Ingresar
          </Link>
        </nav>
      </div>
    </header>
  );
};
