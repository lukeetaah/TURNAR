import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogIn, Mail, ArrowLeft, KeyRound, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { APP_CONFIG } from '@/core/config';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signInWithOtp } = useAuth();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already logged in, redirect
  React.useEffect(() => {
    if (session) {
      const from = (location.state as any)?.from?.pathname || '/app';
      navigate(from, { replace: true });
    }
  }, [session, navigate, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError(null);

    const { error: err } = await signInWithOtp(email.trim());
    setLoading(false);

    if (err) {
      setError(err.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white border border-brand-200 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded-lg bg-brand-900 text-terracotta-400 font-bold text-lg flex items-center justify-center mx-auto mb-3">
            T
          </div>
          <h1 className="text-xl font-bold text-brand-900">Ingresar a {APP_CONFIG.name}</h1>
          <p className="text-xs text-brand-500 mt-1">
            Accedé a tu espacio de trabajo o administrá tus turnos
          </p>
        </div>

        {!isSupabaseConfigured && (
          <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
            <div className="flex items-center gap-1.5 font-semibold text-amber-950 mb-1">
              <KeyRound className="w-3.5 h-3.5 text-amber-700" />
              <span>Supabase no conectado</span>
            </div>
            Para habilitar el inicio de sesión real, configurá las credenciales{' '}
            <code className="font-mono bg-amber-100 px-1 rounded">VITE_SUPABASE_URL</code> y{' '}
            <code className="font-mono bg-amber-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code>.
          </div>
        )}

        {sent ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-brand-900 mb-1">¡Enlace mágico enviado!</h3>
            <p className="text-xs text-brand-500 mb-4 leading-relaxed">
              Enviamos un enlace de acceso seguro a <strong className="text-brand-800">{email}</strong>.
              Revisá tu bandeja de entrada o spam y hacé clic para ingresar.
            </p>
            <Button variant="ghost" size="xs" onClick={() => setSent(false)}>
              Intentar con otro correo
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}

            <Input
              label="Correo electrónico"
              type="email"
              disabled={!isSupabaseConfigured || loading}
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="w-4 h-4 text-brand-400" />}
              required
            />

            <Button
              type="submit"
              disabled={!isSupabaseConfigured}
              loading={loading}
              className="w-full"
              size="md"
              icon={<LogIn className="w-3.5 h-3.5" />}
            >
              Continuar con enlace mágico
            </Button>
          </form>
        )}

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
