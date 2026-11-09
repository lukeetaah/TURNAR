import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50">
        <div className="max-w-sm w-full mx-4 p-6 bg-white rounded-2xl border border-amber-200 shadow-sm text-center">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-amber-700 text-lg">⚙️</span>
          </div>
          <h2 className="text-sm font-bold text-brand-900 mb-1">
            Supabase no configurado
          </h2>
          <p className="text-xs text-brand-500 leading-relaxed">
            Configurá las variables de entorno{' '}
            <code className="bg-brand-100 px-1 py-0.5 rounded text-brand-700 font-mono">
              VITE_SUPABASE_URL
            </code>{' '}
            y{' '}
            <code className="bg-brand-100 px-1 py-0.5 rounded text-brand-700 font-mono">
              VITE_SUPABASE_ANON_KEY
            </code>{' '}
            para continuar.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50">
        <span className="w-6 h-6 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
