import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogIn, Mail, Lock, User, ArrowLeft, KeyRound, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { APP_CONFIG } from '@/core/config';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

type AuthMode = 'magic-link' | 'password-login' | 'password-signup';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    session,
    authError,
    clearAuthError,
    signInWithOtp,
    signInWithPassword,
    signUp,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('magic-link');

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // If already logged in, redirect to intended page or /app
  useEffect(() => {
    if (session) {
      const from = (location.state as any)?.from?.pathname || '/app';
      navigate(from, { replace: true });
    }
  }, [session, navigate, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);
    clearAuthError();

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setFormError('Ingresá tu correo electrónico.');
      return;
    }

    setLoading(true);

    if (mode === 'magic-link') {
      const { error } = await signInWithOtp(cleanEmail);
      setLoading(false);
      if (error) {
        setFormError(error.message);
      } else {
        setSuccessMsg(
          `Enviamos un enlace mágico a ${cleanEmail}. Revisá tu bandeja de entrada o spam y hacé clic para entrar directamente.`
        );
      }
    } else if (mode === 'password-login') {
      if (!password) {
        setLoading(false);
        setFormError('Ingresá tu contraseña.');
        return;
      }
      const { error } = await signInWithPassword(cleanEmail, password);
      setLoading(false);
      if (error) {
        setFormError(error.message);
      }
    } else if (mode === 'password-signup') {
      if (!password || password.length < 6) {
        setLoading(false);
        setFormError('La contraseña debe tener al menos 6 caracteres.');
        return;
      }
      const { error, user } = await signUp(cleanEmail, password, fullName);
      setLoading(false);
      if (error) {
        setFormError(error.message);
      } else {
        if (user && user.identities && user.identities.length === 0) {
          setFormError('Este correo electrónico ya está registrado. Probá iniciar sesión.');
        } else {
          setSuccessMsg(
            `¡Cuenta creada! Enviamos un correo de confirmación a ${cleanEmail}. Hacé clic en el enlace del correo para verificar tu cuenta y entrar a tu espacio de trabajo.`
          );
        }
      }
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 md:py-16">
      <div className="bg-white border border-brand-200 rounded-2xl p-6 sm:p-8 shadow-xs">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-900 text-terracotta-400 font-bold text-lg flex items-center justify-center mx-auto mb-3 shadow-2xs">
            T
          </div>
          <h1 className="text-xl font-bold text-brand-900">
            {mode === 'password-signup' ? 'Crear cuenta en TURNAR' : `Ingresar a ${APP_CONFIG.name}`}
          </h1>
          <p className="text-xs text-brand-500 mt-1">
            {mode === 'password-signup'
              ? 'Registrá tu cuenta para gestionar tu espacio y turnos'
              : 'Accedé a tu panel de control o administrá tus reservas'}
          </p>
        </div>

        {/* Warning if Supabase is not configured */}
        {!isSupabaseConfigured && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
            <div className="flex items-center gap-1.5 font-semibold text-amber-950 mb-1">
              <KeyRound className="w-3.5 h-3.5 text-amber-700" />
              <span>Supabase no conectado</span>
            </div>
            Configurá las variables <code className="font-mono bg-amber-100 px-1 rounded">VITE_SUPABASE_URL</code> y{' '}
            <code className="font-mono bg-amber-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> en tu entorno.
          </div>
        )}

        {/* Display URL Auth Error (e.g. expired link) */}
        {authError && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span className="font-semibold block mb-0.5">Aviso de autenticación:</span>
              {authError}
            </div>
          </div>
        )}

        {/* Success confirmation message */}
        {successMsg ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-brand-900 mb-1">¡Revisá tu correo!</h3>
            <p className="text-xs text-brand-500 mb-6 leading-relaxed">{successMsg}</p>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => {
                setSuccessMsg(null);
                setFormError(null);
              }}
            >
              Volver al formulario
            </Button>
          </div>
        ) : (
          <div>
            {/* Tabs selector */}
            <div className="grid grid-cols-2 p-1 bg-brand-100/70 rounded-xl mb-5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setMode('magic-link');
                  setFormError(null);
                }}
                className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'magic-link'
                    ? 'bg-white text-brand-900 shadow-2xs'
                    : 'text-brand-500 hover:text-brand-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-terracotta-500" />
                <span>Enlace mágico</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('password-login');
                  setFormError(null);
                }}
                className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  mode !== 'magic-link'
                    ? 'bg-white text-brand-900 shadow-2xs'
                    : 'text-brand-500 hover:text-brand-800'
                }`}
              >
                <Lock className="w-3.5 h-3.5 text-brand-600" />
                <span>Contraseña</span>
              </button>
            </div>

            {/* Error banner */}
            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 leading-relaxed">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {mode === 'password-signup' && (
                <Input
                  label="Nombre y apellido"
                  type="text"
                  placeholder="Tu nombre"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  icon={<User className="w-4 h-4 text-brand-400" />}
                  required
                />
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

              {mode !== 'magic-link' && (
                <Input
                  label="Contraseña"
                  type="password"
                  disabled={!isSupabaseConfigured || loading}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock className="w-4 h-4 text-brand-400" />}
                  required
                />
              )}

              <Button
                type="submit"
                disabled={!isSupabaseConfigured}
                loading={loading}
                className="w-full mt-2"
                size="md"
                icon={<LogIn className="w-3.5 h-3.5" />}
              >
                {mode === 'magic-link' && 'Continuar con enlace mágico'}
                {mode === 'password-login' && 'Iniciar sesión'}
                {mode === 'password-signup' && 'Registrarse'}
              </Button>
            </form>

            {/* Toggle between password login and signup */}
            {mode !== 'magic-link' && (
              <div className="mt-4 text-center">
                {mode === 'password-login' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('password-signup');
                      setFormError(null);
                    }}
                    className="text-xs text-brand-500 hover:text-brand-900 font-medium transition-colors"
                  >
                    ¿No tenés cuenta todavía? <span className="text-terracotta-600 font-semibold underline">Registrate acá</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('password-login');
                      setFormError(null);
                    }}
                    className="text-xs text-brand-500 hover:text-brand-900 font-medium transition-colors"
                  >
                    ¿Ya tenés una cuenta? <span className="text-terracotta-600 font-semibold underline">Iniciá sesión</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Back link */}
        <div className="mt-6 pt-4 border-t border-brand-100 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver al inicio</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
