import React, { useState } from 'react';
import { NavLink, Outlet, useParams, useNavigate } from 'react-router-dom';
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
  X,
  ChevronDown,
  Building2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';
import { useOrganizations } from '@/hooks/useOrganizations';

const navItems = [
  { to: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: 'activities', label: 'Actividades', icon: Dumbbell },
  { to: 'sessions', label: 'Sesiones', icon: Calendar },
  { to: 'agenda', label: 'Agenda', icon: Calendar },
  { to: 'contacts', label: 'Alumnos', icon: Users },
  { to: 'payments', label: 'Pagos', icon: CreditCard },
  { to: 'communications', label: 'Comunicaciones', icon: MessageSquare },
  { to: 'settings', label: 'Configuración', icon: Settings },
];

export const AppLayout: React.FC = () => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { orgName, orgRole } = useOrg();
  const { orgs } = useOrganizations();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orgDropdown, setOrgDropdown] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const switchOrg = (slug: string) => {
    setOrgDropdown(false);
    navigate(`/app/${slug}/dashboard`);
  };

  const sidebar = (
    <aside className="flex flex-col h-full bg-brand-950 text-white w-56">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-brand-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-terracotta-500 text-white font-bold text-sm flex items-center justify-center">
            T
          </div>
          <span className="text-sm font-bold tracking-tight">TURNAR</span>
        </div>
      </div>

      {/* Org Switcher */}
      <div className="px-3 py-3 border-b border-brand-800">
        <button
          onClick={() => setOrgDropdown((v) => !v)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-brand-800 transition-colors text-left"
        >
          <Building2 className="w-4 h-4 text-brand-400 shrink-0" />
          <span className="flex-1 text-xs font-medium text-brand-100 truncate">
            {orgName ?? 'Sin organización'}
          </span>
          <ChevronDown className="w-3 h-3 text-brand-400" />
        </button>
        {orgDropdown && (
          <div className="mt-1 bg-brand-900 rounded-lg border border-brand-700 overflow-hidden">
            {orgs.map((o) => (
              <button
                key={o.id}
                onClick={() => switchOrg(o.slug)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-brand-700 transition-colors text-left ${
                  o.slug === orgSlug ? 'text-terracotta-300 font-semibold' : 'text-brand-200'
                }`}
              >
                {o.name}
              </button>
            ))}
            <button
              onClick={() => { setOrgDropdown(false); navigate('/app'); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-brand-400 hover:bg-brand-700 hover:text-brand-200 transition-colors border-t border-brand-700"
            >
              + Cambiar / crear organización
            </button>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={`/app/${orgSlug}/${to}`}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-brand-800 text-white'
                  : 'text-brand-400 hover:bg-brand-800 hover:text-brand-100'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-brand-800">
        <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
          <div className="w-6 h-6 rounded-full bg-terracotta-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {profile?.first_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-brand-100 truncate">
              {profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'Usuario'}
            </p>
            <p className="text-[10px] text-brand-500 truncate">{orgRole}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-brand-400 hover:bg-brand-800 hover:text-brand-100 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Salir
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-brand-50 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">{sidebar}</div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 z-50">{sidebar}</div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-brand-100">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-brand-500 hover:text-brand-800"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-brand-900">
            {orgName ?? 'TURNAR'}
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto text-brand-400"
          >
            {sidebarOpen && <X className="w-4 h-4" />}
          </button>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
