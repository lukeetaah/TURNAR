import React from 'react';
import { Link } from 'react-router-dom';
import { LogIn, Mail, ArrowLeft, KeyRound } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { APP_CONFIG } from '@/core/config';

export const Login: React.FC = () => {
  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white border border-brand-200 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded-lg bg-brand-900 text-terracotta-400 font-bold text-lg flex items-center justify-center mx-auto mb-3">
            T
          </div>
          <h1 className="text-xl font-bold text-brand-900">Ingresar a {APP_CONFIG.name}</h1>
          <p className="text-xs text-brand-500 mt-1">
            Accedé a tu espacio de trabajo o reclamá tu invitación
          </p>
        </div>

        {!isSupabaseConfigured && (
          <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
            <div className="flex items-center gap-1.5 font-semibold text-amber-950 mb-1">
              <KeyRound className="w-3.5 h-3.5 text-amber-700" />
              <span>Fase 1: Backend desacoplado</span>
            </div>
            La autenticación mediante Supabase se activará en la siguiente fase una vez revisada la estructura y creadas las credenciales del proyecto independiente.
          </div>
        )}

        <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-brand-700 mb-1">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-brand-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                disabled={!isSupabaseConfigured}
                placeholder="tu@correo.com"
                className="w-full pl-9 pr-3 py-2 text-xs border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-900/20 disabled:bg-brand-50 disabled:text-brand-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!isSupabaseConfigured}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-900 text-white text-xs font-semibold hover:bg-brand-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Continuar con correo</span>
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-brand-100 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-brand-800 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Volver al inicio</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
