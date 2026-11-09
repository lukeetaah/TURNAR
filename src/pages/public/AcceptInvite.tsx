import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { KeyRound, CheckCircle2, AlertTriangle, ArrowRight, LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizations } from '@/hooks/useOrganizations';
import { Button } from '@/components/ui/Button';

export const AcceptInvite: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session, user } = useAuth();
  const { claimInvite, refetch } = useOrganizations();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleClaim = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    const res = await claimInvite(token);
    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccess(true);
      await refetch();
    }
  };

  return (
    <div className="min-h-screen bg-brand-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-brand-200 p-6 sm:p-8 shadow-xs text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200">
          <KeyRound className="w-6 h-6" />
        </div>

        <h1 className="text-lg font-bold text-brand-900 mb-1">
          Invitación a equipo de trabajo
        </h1>
        <p className="text-xs text-brand-500 mb-6 leading-relaxed">
          Has recibido un enlace oficial para incorporarte como miembro autorizado a un espacio de TURNAR.
        </p>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 text-left flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        {success ? (
          <div className="py-2">
            <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-bold text-brand-900 mb-1">
              ¡Invitación aceptada con éxito!
            </h2>
            <p className="text-xs text-brand-500 mb-6">
              Tu cuenta ha quedado vinculada formalmente a la organización. Ya podés acceder a tu panel de control.
            </p>
            <Button
              variant="primary"
              onClick={() => navigate('/app')}
              className="w-full"
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Ir a mis espacios
            </Button>
          </div>
        ) : !session ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-brand-50 text-xs text-brand-700 text-left border border-brand-100">
              <p className="font-semibold text-brand-900 mb-1">Paso requerido:</p>
              Iniciá sesión o registrate con tu correo electrónico para asociar la invitación a tu cuenta.
            </div>

            <Link
              to="/login"
              state={{ from: { pathname: `/invite/${token}` } }}
              className="block"
            >
              <Button
                variant="primary"
                size="md"
                className="w-full"
                icon={<LogIn className="w-4 h-4" />}
              >
                Iniciar sesión para aceptar
              </Button>
            </Link>

            <Link to="/" className="text-xs text-brand-400 hover:text-brand-700 block mt-2">
              Volver al inicio
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-brand-50 text-xs text-brand-700 text-left border border-brand-100">
              <span className="text-[11px] text-brand-400 block">Autenticado como:</span>
              <span className="font-semibold text-brand-900">{user?.email}</span>
            </div>

            <Button
              variant="primary"
              size="md"
              loading={loading}
              onClick={handleClaim}
              className="w-full"
            >
              Aceptar invitación y vincularme
            </Button>

            <Link to="/app" className="text-xs text-brand-400 hover:text-brand-700 block mt-2">
              Ir a mi panel principal
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
