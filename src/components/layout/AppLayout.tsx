import React, { useState } from 'react';
import { NavLink, Outlet, useParams, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Dumbbell,
  Calendar,
  Users,
  CreditCard,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  ChevronDown,
  Building2,
  ExternalLink,
  Check,
  Plus,
  KeyRound,
  Compass,
  User as UserIcon,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';
import { formatRole } from '@/core/roles';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

interface NavItem {
  to: string;
  label: string;
  icon: any;
  allowedRoles?: string[];
}

const allNavItems: NavItem[] = [
  { to: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
  { to: 'activities', label: 'Actividades', icon: Dumbbell, allowedRoles: ['owner', 'admin', 'instructor'] },
  { to: 'sessions', label: 'Sesiones y Horarios', icon: Calendar, allowedRoles: ['owner', 'admin', 'instructor'] },
  { to: 'agenda', label: 'Agenda', icon: Calendar },
  { to: 'contacts', label: 'Alumnos', icon: Users, allowedRoles: ['owner', 'admin', 'instructor'] },
  { to: 'payments', label: 'Pagos', icon: CreditCard, allowedRoles: ['owner', 'admin'] },
  { to: 'communications', label: 'Comunicaciones', icon: MessageSquare },
  { to: 'settings', label: 'Configuración', icon: Settings, allowedRoles: ['owner', 'admin'] },
];

export const AppLayout: React.FC = () => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const { profile, user, signOut } = useAuth();
  const { orgName, orgRole, orgs, claimInvite } = useOrg();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orgDropdown, setOrgDropdown] = useState(false);
  const [userDropdown, setUserDropdown] = useState(false);

  // Modal Mi Cuenta
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // Modal Aceptar Invitación
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const switchOrg = (slug: string) => {
    setOrgDropdown(false);
    navigate(`/app/${slug}/dashboard`);
  };

  const handleClaimInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim()) return;

    setClaiming(true);
    setClaimMsg(null);

    const res = await claimInvite(inviteToken.trim());
    setClaiming(false);

    if (res.error) {
      setClaimMsg({ type: 'err', text: res.error });
    } else {
      setClaimMsg({ type: 'ok', text: '¡Invitación aceptada con éxito! Espacio vinculado.' });
      setTimeout(() => {
        setInviteModalOpen(false);
        setInviteToken('');
        setClaimMsg(null);
      }, 1200);
    }
  };

  // Filtrado de navegación según el rol del usuario en la organización
  const visibleNavItems = allNavItems.filter((item) => {
    if (!item.allowedRoles) return true;
    if (!orgRole) return false;
    return item.allowedRoles.includes(orgRole);
  });

  const sidebar = (
    <aside className="flex flex-col h-full bg-brand-950 text-white w-60">
      {/* 1. Header con Logo */}
      <div className="px-4 py-3.5 border-b border-brand-800 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-lg bg-terracotta-500 text-white font-bold text-sm flex items-center justify-center">
            T
          </div>
          <span className="text-sm font-bold tracking-tight text-white group-hover:text-terracotta-300 transition-colors">
            TURNAR
          </span>
        </Link>
        <span className="text-[10px] font-mono text-brand-400 bg-brand-900 px-1.5 py-0.5 rounded">
          app
        </span>
      </div>

      {/* 2. Selector de Organización */}
      <div className="px-3 py-3 border-b border-brand-800 relative">
        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-400 px-2 block mb-1">
          Espacio actual
        </span>
        <button
          onClick={() => {
            setOrgDropdown((v) => !v);
            setUserDropdown(false);
          }}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 transition-colors text-left border border-brand-800/80"
        >
          <Building2 className="w-4 h-4 text-terracotta-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-white block truncate">
              {orgName || 'Sin espacio'}
            </span>
            {orgRole && (
              <span className="text-[10px] text-brand-400 block">
                Rol: {formatRole(orgRole)}
              </span>
            )}
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-brand-400 transition-transform ${
              orgDropdown ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Desplegable de organizaciones */}
        {orgDropdown && (
          <div className="absolute left-3 right-3 top-full mt-1 bg-brand-900 rounded-xl border border-brand-700 shadow-xl overflow-hidden z-30">
            <div className="p-2 border-b border-brand-800">
              <span className="text-[10px] font-semibold text-brand-400 px-2 block mb-1">
                Tus espacios vinculados
              </span>
              <div className="max-h-44 overflow-y-auto space-y-0.5">
                {orgs.map((o) => {
                  const isCurrent = o.slug === orgSlug;
                  return (
                    <button
                      key={o.id}
                      onClick={() => switchOrg(o.slug)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors text-left ${
                        isCurrent
                          ? 'bg-brand-800 text-white font-semibold'
                          : 'text-brand-300 hover:bg-brand-800/60 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{o.name}</span>
                      {isCurrent && <Check className="w-3.5 h-3.5 text-terracotta-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-1.5 bg-brand-950/60 space-y-0.5 text-xs">
              <Link
                to={`/o/${orgSlug}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOrgDropdown(false)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-brand-300 hover:bg-brand-800 hover:text-white transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-brand-400" />
                <span>Ver página pública</span>
              </Link>

              <button
                onClick={() => {
                  setOrgDropdown(false);
                  navigate('/app/create-org');
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-brand-300 hover:bg-brand-800 hover:text-white transition-colors text-left"
              >
                <Plus className="w-3.5 h-3.5 text-terracotta-400" />
                <span>Crear nuevo espacio</span>
              </button>

              <button
                onClick={() => {
                  setOrgDropdown(false);
                  navigate('/app?select=true');
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-brand-400 hover:bg-brand-800 hover:text-white transition-colors text-left"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Ver todos mis espacios</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Navegación Principal */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-400 px-3 block mb-1">
          Módulos
        </span>
        {visibleNavItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={`/app/${orgSlug}/${to}`}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-brand-800 text-white shadow-2xs'
                  : 'text-brand-300 hover:bg-brand-800/50 hover:text-white'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0 text-brand-400" />
            <span>{label}</span>
          </NavLink>
        ))}

        {(profile?.is_platform_admin || user?.email === 'lucascorrea@outlook.com.ar') && (
          <NavLink
            to="/app/admin"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 mt-3 border border-amber-500/30"
          >
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Panel Superadmin</span>
          </NavLink>
        )}
      </nav>

      {/* 4. Menú de Usuario (Separado al pie) */}
      <div className="p-3 border-t border-brand-800 relative bg-brand-950/80">
        <button
          onClick={() => {
            setUserDropdown((v) => !v);
            setOrgDropdown(false);
          }}
          className="w-full flex items-center gap-2.5 p-2 rounded-xl bg-brand-900/60 hover:bg-brand-800 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-terracotta-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {profile?.first_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">
              {profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'Mi cuenta'}
            </p>
            <p className="text-[10px] text-brand-400 truncate">{user?.email}</p>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-brand-400 transition-transform ${
              userDropdown ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Desplegable de usuario */}
        {userDropdown && (
          <div className="absolute left-3 right-3 bottom-full mb-2 bg-brand-900 rounded-xl border border-brand-700 shadow-xl overflow-hidden z-30 text-xs">
            <div className="p-3 border-b border-brand-800 bg-brand-950/40">
              <span className="text-[10px] uppercase font-bold text-brand-400 block mb-0.5">
                Usuario activo
              </span>
              <p className="font-bold text-white truncate">
                {profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'Usuario'}
              </p>
              <p className="text-[11px] text-brand-400 truncate font-mono">{user?.email}</p>
            </div>

            <div className="p-1.5 space-y-0.5">
              <button
                onClick={() => {
                  setUserDropdown(false);
                  setProfileModalOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-brand-200 hover:bg-brand-800 transition-colors text-left"
              >
                <UserIcon className="w-3.5 h-3.5 text-brand-400" />
                <span>Datos de mi cuenta</span>
              </button>

              <button
                onClick={() => {
                  setUserDropdown(false);
                  setClaimMsg(null);
                  setInviteModalOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-brand-200 hover:bg-brand-800 transition-colors text-left"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                <span>Aceptar invitación</span>
              </button>

              <button
                onClick={() => {
                  setUserDropdown(false);
                  navigate('/app?select=true');
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-brand-200 hover:bg-brand-800 transition-colors text-left"
              >
                <Building2 className="w-3.5 h-3.5 text-brand-400" />
                <span>Cambiar de espacio</span>
              </button>

              <Link
                to="/"
                onClick={() => setUserDropdown(false)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-brand-200 hover:bg-brand-800 transition-colors text-left"
              >
                <Compass className="w-3.5 h-3.5 text-blue-400" />
                <span>Directorio de espacios</span>
              </Link>

              {(profile?.is_platform_admin || user?.email === 'lucascorrea@outlook.com.ar') && (
                <Link
                  to="/app/admin"
                  onClick={() => setUserDropdown(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors text-left font-semibold"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span>Panel Superadmin</span>
                </Link>
              )}

              <div className="pt-1 border-t border-brand-800">
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-400 hover:bg-red-950/50 hover:text-red-300 transition-colors text-left font-semibold"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-brand-50 overflow-hidden">
      {/* Sidebar Escritorio */}
      <div className="hidden md:flex shrink-0">{sidebar}</div>

      {/* Sidebar Móvil */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 z-50">{sidebar}</div>
        </div>
      )}

      {/* Contenido Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar móvil */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-brand-200">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-brand-600 hover:text-brand-900 p-1"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-xs font-bold text-brand-900 truncate max-w-[180px]">
              {orgName || 'TURNAR'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setProfileModalOpen(true)}
              className="w-7 h-7 rounded-lg bg-terracotta-500 text-white font-bold text-xs flex items-center justify-center"
            >
              {profile?.first_name?.[0]?.toUpperCase() || 'U'}
            </button>
          </div>
        </div>

        {/* Área de trabajo de la página actual */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Modal Mi Cuenta */}
      <Modal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title="Datos de mi cuenta"
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 rounded-xl bg-brand-50 border border-brand-200 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-brand-900 text-terracotta-400 font-bold text-lg flex items-center justify-center shrink-0">
              {profile?.first_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <p className="font-bold text-sm text-brand-900">
                {profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'Usuario'}
              </p>
              <p className="text-brand-500 font-mono text-[11px]">{user?.email}</p>
              <div className="mt-1">
                <Badge variant={orgRole === 'owner' ? 'danger' : 'default'} className="text-[10px]">
                  Rol en este espacio: {formatRole(orgRole)}
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-brand-100">
            <div className="flex justify-between py-1.5 border-b border-brand-100">
              <span className="text-brand-400">ID de usuario</span>
              <span className="font-mono text-brand-700 select-all">{user?.id}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-brand-100">
              <span className="text-brand-400">Espacios asociados</span>
              <span className="font-bold text-brand-900">{orgs.length}</span>
            </div>
          </div>

          <div className="flex justify-between pt-3">
            <Button variant="danger" size="xs" onClick={handleSignOut} icon={<LogOut className="w-3.5 h-3.5" />}>
              Cerrar sesión
            </Button>
            <Button variant="secondary" size="xs" onClick={() => setProfileModalOpen(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Aceptar Invitación */}
      <Modal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Aceptar invitación a un espacio"
      >
        {claimMsg && (
          <div
            className={`mb-3 p-2.5 rounded-lg text-xs ${
              claimMsg.type === 'ok'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {claimMsg.text}
          </div>
        )}

        <form onSubmit={handleClaimInvite} className="space-y-3.5">
          <p className="text-xs text-brand-500 leading-relaxed">
            Ingresá el código o token de invitación que te proporcionó el administrador para vincular tu cuenta con su espacio de trabajo.
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
              Vincular espacio
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
