import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Building2,
  ArrowRight,
  Plus,
  KeyRound,
  Compass,
  CheckCircle2,
  Shield,
  UserCheck,
  GraduationCap,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizations } from '@/hooks/useOrganizations';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';

const roleLabels: Record<string, { label: string; variant: 'danger' | 'warning' | 'info' | 'default'; icon: any }> = {
  owner: { label: 'Propietario', variant: 'danger', icon: Shield },
  admin: { label: 'Administrador', variant: 'warning', icon: Shield },
  instructor: { label: 'Profesor / Staff', variant: 'info', icon: GraduationCap },
  client: { label: 'Alumno / Cliente', variant: 'default', icon: UserCheck },
};

export const SelectOrg: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const forceSelect = searchParams.get('select') === 'true';

  const { profile } = useAuth();
  const { orgs, loading, claimInvite } = useOrganizations();

  // Modal para aceptar invitación
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  // Escenario A: Usuario con una sola organización (acceso directo automático)
  useEffect(() => {
    if (!loading && orgs.length === 1 && !forceSelect) {
      navigate(`/app/${orgs[0].slug}/dashboard`, { replace: true });
    }
  }, [loading, orgs, forceSelect, navigate]);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim()) return;

    setClaiming(true);
    setClaimError(null);
    setClaimSuccess(null);

    const { error } = await claimInvite(inviteToken.trim());
    setClaiming(false);

    if (error) {
      setClaimError(error);
    } else {
      setClaimSuccess('¡Invitación aceptada con éxito! Vinculando tu espacio...');
      setTimeout(() => {
        setInviteModalOpen(false);
        setInviteToken('');
        // Si conocemos el orgId podemos navegar, o el effect detectará la nueva org
      }, 1200);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50">
        <span className="w-6 h-6 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Si tiene exactamente 1 org y no forzó selección, está redirigiendo
  if (orgs.length === 1 && !forceSelect) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50">
        <span className="w-6 h-6 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-50 flex items-start justify-center pt-10 pb-16 px-4">
      <div className="w-full max-w-xl">
        {/* Header de bienvenida */}
        <div className="text-center mb-8">
          <div className="w-11 h-11 rounded-xl bg-brand-900 text-terracotta-400 font-bold text-lg flex items-center justify-center mx-auto mb-3 shadow-2xs">
            T
          </div>
          <h1 className="text-xl font-bold text-brand-900">
            Hola, {profile?.first_name || 'bienvenido/a'} 👋
          </h1>
          <p className="text-xs text-brand-500 mt-1">
            {orgs.length > 0
              ? 'Seleccioná el espacio de trabajo con el que deseás operar'
              : 'Elegí cómo querés continuar en TURNAR'}
          </p>
        </div>

        {/* Escenario D: Usuario sin organizaciones */}
        {orgs.length === 0 ? (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-brand-200 p-6 sm:p-8 text-center shadow-xs">
              <Building2 className="w-10 h-10 text-brand-300 mx-auto mb-3" />
              <h2 className="text-base font-bold text-brand-900 mb-1">
                Todavía no tenés espacios vinculados
              </h2>
              <p className="text-xs text-brand-500 max-w-md mx-auto leading-relaxed mb-6">
                En TURNAR podés administrar tu propio espacio de actividades o participar como profesor o alumno en espacios existentes.
              </p>

              {/* Tres acciones principales */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                {/* 1. Explorar espacios */}
                <Link
                  to="/"
                  className="p-4 rounded-xl border border-brand-200 hover:border-brand-400 hover:bg-brand-50/50 transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2.5">
                      <Compass className="w-4 h-4" />
                    </div>
                    <h3 className="text-xs font-bold text-brand-900 mb-1 group-hover:text-blue-700 transition-colors">
                      Explorar espacios
                    </h3>
                    <p className="text-[11px] text-brand-400 leading-normal">
                      Buscá talleres y actividades en nuestro directorio público para reservar turnos.
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-blue-600 mt-3 inline-flex items-center gap-1">
                    Directorio →
                  </span>
                </Link>

                {/* 2. Aceptar invitación */}
                <button
                  onClick={() => {
                    setClaimError(null);
                    setClaimSuccess(null);
                    setInviteModalOpen(true);
                  }}
                  className="p-4 rounded-xl border border-brand-200 hover:border-brand-400 hover:bg-brand-50/50 transition-all flex flex-col justify-between text-left group"
                >
                  <div>
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-2.5">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <h3 className="text-xs font-bold text-brand-900 mb-1 group-hover:text-amber-700 transition-colors">
                      Tengo una invitación
                    </h3>
                    <p className="text-[11px] text-brand-400 leading-normal">
                      Si te invitaron a un equipo, ingresá tu token acá para vincularte.
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-amber-600 mt-3 inline-flex items-center gap-1">
                    Canjear código →
                  </span>
                </button>

                {/* 3. Crear espacio propio */}
                <Link
                  to="/app/create-org"
                  className="p-4 rounded-xl border border-brand-200 hover:border-brand-400 hover:bg-brand-50/50 transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="w-8 h-8 rounded-lg bg-terracotta-50 text-terracotta-600 flex items-center justify-center mb-2.5">
                      <Plus className="w-4 h-4" />
                    </div>
                    <h3 className="text-xs font-bold text-brand-900 mb-1 group-hover:text-terracotta-700 transition-colors">
                      Crear mi espacio
                    </h3>
                    <p className="text-[11px] text-brand-400 leading-normal">
                      Creá tu taller o centro de actividades y comenzá a publicar turnos.
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-terracotta-600 mt-3 inline-flex items-center gap-1">
                    Comenzar →
                  </span>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          /* Escenario B: Usuario con múltiples organizaciones */
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-brand-200 p-5 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-brand-100">
                <h2 className="text-xs font-bold text-brand-800 uppercase tracking-wider">
                  Tus espacios ({orgs.length})
                </h2>
                <button
                  onClick={() => {
                    setClaimError(null);
                    setClaimSuccess(null);
                    setInviteModalOpen(true);
                  }}
                  className="text-xs text-brand-500 hover:text-brand-900 font-semibold inline-flex items-center gap-1"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                  <span>Aceptar invitación</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {orgs.map((org) => {
                  const roleConfig = roleLabels[org.role] || roleLabels.client;

                  return (
                    <button
                      key={org.id}
                      onClick={() => navigate(`/app/${org.slug}/dashboard`)}
                      className="w-full flex items-center gap-3.5 p-3.5 bg-brand-50/50 rounded-xl border border-brand-200 hover:border-brand-400 hover:bg-white hover:shadow-xs transition-all group text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-brand-900 flex items-center justify-center text-terracotta-400 font-bold text-sm shrink-0">
                        {org.logo_url ? (
                          <img
                            src={org.logo_url}
                            alt={org.name}
                            className="w-full h-full object-cover rounded-xl"
                          />
                        ) : (
                          org.name[0].toUpperCase()
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-brand-900 truncate">
                            {org.name}
                          </p>
                          <Badge variant={roleConfig.variant} className="text-[10px]">
                            {roleConfig.label}
                          </Badge>
                        </div>
                        {org.activity_category && (
                          <p className="text-[11px] text-brand-400 capitalize mt-0.5">
                            {org.activity_category}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-xs font-semibold text-brand-500 group-hover:text-brand-900 transition-colors">
                        <span>Abrir</span>
                        <ArrowRight className="w-4 h-4 text-brand-400 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Botón para crear nueva organización */}
              <div className="mt-4 pt-4 border-t border-brand-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <Link to="/" className="text-xs text-brand-400 hover:text-brand-700">
                  ← Ir al directorio público
                </Link>
                <Link to="/app/create-org">
                  <Button
                    variant="secondary"
                    size="xs"
                    icon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Crear nuevo espacio
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Aceptar Invitación (Escenario C) */}
      <Modal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Vincular espacio por invitación"
      >
        {claimError && (
          <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {claimError}
          </div>
        )}

        {claimSuccess ? (
          <div className="text-center py-4">
            <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <p className="text-xs font-bold text-green-800">{claimSuccess}</p>
          </div>
        ) : (
          <form onSubmit={handleClaim} className="space-y-3.5">
            <p className="text-xs text-brand-500 leading-relaxed">
              Si el administrador de una organización te invitó a sumarte a su equipo, pegá acá el token o código alfanumérico que recibiste.
            </p>

            <Input
              label="Token de invitación"
              placeholder="Ej. e7b52479e0a149..."
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value)}
              required
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setInviteModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={claiming}>
                Aceptar invitación
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
