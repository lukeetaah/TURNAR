import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShieldAlert,
  Building2,
  Users,
  ExternalLink,
  Check,
  Share2,
  Plus,
  Search,
  ArrowRight,
  Shield,
  AlertTriangle,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { formatRole } from '@/core/roles';

interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  activity_category: string | null;
  is_active: boolean;
  is_directory_listed: boolean;
  created_at: string;
  members: Array<{
    user_id: string;
    role: string;
    profiles?: {
      first_name: string | null;
      last_name: string | null;
      email: string;
    } | null;
  }>;
}

interface AdminProfile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_platform_admin: boolean;
  created_at: string;
}

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const { setOrg, refetchOrgs } = useOrg();

  const isSuperAdmin = profile?.is_platform_admin || user?.email === 'lucascorrea@outlook.com.ar';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [search, setSearch] = useState('');

  // Estados para asignación en LAVA CERÁMICA
  const [sebaEmail, setSebaEmail] = useState('');
  const [sebaRole, setSebaRole] = useState('owner');
  const [sebaLoading, setSebaLoading] = useState(false);
  const [sebaMsg, setSebaMsg] = useState<{ type: 'ok' | 'err'; text: string; inviteUrl?: string } | null>(null);

  // Modal para asignar miembros a cualquier organización
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [targetOrg, setTargetOrg] = useState<AdminOrg | null>(null);
  const [assignEmail, setAssignEmail] = useState('');
  const [assignRole, setAssignRole] = useState('owner');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignMsg, setAssignMsg] = useState<{ type: 'ok' | 'err'; text: string; inviteUrl?: string } | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);

  const fetchData = useCallback(async () => {
    if (!supabase || !isSuperAdmin) {
      setLoading(false);
      return;
    }

    setRefreshing(true);
    setError(null);

    try {
      // 1. Consultar organizaciones
      const { data: orgData, error: orgErr } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (orgErr) throw orgErr;

      // 2. Consultar miembros con perfiles
      const { data: memData } = await supabase
        .from('organization_members')
        .select(`
          organization_id,
          user_id,
          role,
          profiles (
            first_name,
            last_name,
            email
          )
        `)
        .eq('is_active', true);

      // 3. Consultar perfiles de usuarios registrados
      const { data: profData } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, is_platform_admin, created_at')
        .order('created_at', { ascending: false });

      // Agrupar miembros por organización
      const memByOrg = new Map<string, any[]>();
      (memData || []).forEach((m: any) => {
        const arr = memByOrg.get(m.organization_id) || [];
        arr.push(m);
        memByOrg.set(m.organization_id, arr);
      });

      const parsedOrgs: AdminOrg[] = (orgData || []).map((o: any) => ({
        ...o,
        is_directory_listed: o.is_directory_listed ?? false,
        members: memByOrg.get(o.id) || [],
      }));

      setOrgs(parsedOrgs);
      setProfiles((profData as AdminProfile[]) || []);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar datos del panel de administración');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Asignar al propio Lucas como Dueño de LAVA CERÁMICA
  const handleClaimLavaSelf = async () => {
    if (!supabase || !user) return;
    setSebaLoading(true);
    setSebaMsg(null);

    try {
      const lava = orgs.find((o) => o.slug === 'lava-ceramica');
      if (!lava) throw new Error('No se encontró la organización LAVA CERÁMICA en la base de datos.');

      const { error: insErr } = await supabase
        .from('organization_members')
        .upsert(
          {
            organization_id: lava.id,
            user_id: user.id,
            role: 'owner',
            is_active: true,
          },
          { onConflict: 'organization_id,user_id' }
        );

      if (insErr) throw insErr;

      await refetchOrgs();
      await fetchData();

      setSebaMsg({
        type: 'ok',
        text: `¡Listo! Tu cuenta (${user.email}) quedó asignada formalmente como Dueño de LAVA CERÁMICA.`,
      });
    } catch (err: any) {
      setSebaMsg({ type: 'err', text: err.message || 'Error al asignarte como dueño.' });
    } finally {
      setSebaLoading(false);
    }
  };

  // Asignar a Seba (o cualquier email) en LAVA CERÁMICA
  const handleAssignSeba = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sebaEmail.trim() || !supabase) return;

    setSebaLoading(true);
    setSebaMsg(null);

    try {
      const lava = orgs.find((o) => o.slug === 'lava-ceramica');
      if (!lava) throw new Error('No se encontró la organización LAVA CERÁMICA.');

      const cleanEmail = sebaEmail.trim().toLowerCase();

      // Verificar si el usuario ya existe en profiles
      const matchedProfile = profiles.find((p) => p.email.toLowerCase() === cleanEmail);

      if (matchedProfile) {
        // Asignación directa
        const { error: memErr } = await supabase
          .from('organization_members')
          .upsert(
            {
              organization_id: lava.id,
              user_id: matchedProfile.id,
              role: sebaRole,
              is_active: true,
            },
            { onConflict: 'organization_id,user_id' }
          );

        if (memErr) throw memErr;

        setSebaMsg({
          type: 'ok',
          text: `El usuario ${cleanEmail} ya estaba registrado y fue vinculado inmediatamente como ${formatRole(
            sebaRole
          )} de LAVA CERÁMICA.`,
        });
      } else {
        // Generar invitación
        const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

        const { error: invErr } = await supabase.from('organization_invitations').insert({
          organization_id: lava.id,
          role: sebaRole,
          invited_email: cleanEmail,
          invitation_token: token,
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        });

        if (invErr) throw invErr;

        const inviteUrl = `${window.location.origin}/invite/${token}`;

        setSebaMsg({
          type: 'ok',
          text: `Se generó la invitación oficial para ${cleanEmail} como ${formatRole(sebaRole)}.`,
          inviteUrl,
        });
      }

      setSebaEmail('');
      await fetchData();
    } catch (err: any) {
      setSebaMsg({ type: 'err', text: err.message || 'Error al procesar asignación.' });
    } finally {
      setSebaLoading(false);
    }
  };

  // Asignar miembro a cualquier espacio
  const handleAssignMemberModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetOrg || !assignEmail.trim() || !supabase) return;

    setAssignLoading(true);
    setAssignMsg(null);

    try {
      const cleanEmail = assignEmail.trim().toLowerCase();
      const matchedProfile = profiles.find((p) => p.email.toLowerCase() === cleanEmail);

      if (matchedProfile) {
        const { error: memErr } = await supabase.from('organization_members').upsert(
          {
            organization_id: targetOrg.id,
            user_id: matchedProfile.id,
            role: assignRole,
            is_active: true,
          },
          { onConflict: 'organization_id,user_id' }
        );

        if (memErr) throw memErr;

        setAssignMsg({
          type: 'ok',
          text: `Usuario ${cleanEmail} vinculado exitosamente como ${formatRole(assignRole)}.`,
        });
      } else {
        const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

        const { error: invErr } = await supabase.from('organization_invitations').insert({
          organization_id: targetOrg.id,
          role: assignRole,
          invited_email: cleanEmail,
          invitation_token: token,
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        });

        if (invErr) throw invErr;

        const inviteUrl = `${window.location.origin}/invite/${token}`;

        setAssignMsg({
          type: 'ok',
          text: `Invitación generada para ${cleanEmail}. Copiá el enlace a continuación:`,
          inviteUrl,
        });
      }

      setAssignEmail('');
      await fetchData();
    } catch (err: any) {
      setAssignMsg({ type: 'err', text: err.message || 'Error al asignar miembro.' });
    } finally {
      setAssignLoading(false);
    }
  };

  // Toggle de visibilidad en directorio
  const handleToggleDirectory = async (org: AdminOrg) => {
    if (!supabase) return;
    const newVal = !org.is_directory_listed;

    // Actualización optimista
    setOrgs((prev) =>
      prev.map((o) => (o.id === org.id ? { ...o, is_directory_listed: newVal } : o))
    );

    const { error: err } = await supabase
      .from('organizations')
      .update({ is_directory_listed: newVal })
      .eq('id', org.id);

    if (err) {
      alert(`Error al actualizar directorio: ${err.message}`);
      await fetchData();
    }
  };

  // Toggle de espacio activo
  const handleToggleActive = async (org: AdminOrg) => {
    if (!supabase) return;
    const newVal = !org.is_active;

    setOrgs((prev) =>
      prev.map((o) => (o.id === org.id ? { ...o, is_active: newVal } : o))
    );

    const { error: err } = await supabase
      .from('organizations')
      .update({ is_active: newVal })
      .eq('id', org.id);

    if (err) {
      alert(`Error al cambiar estado: ${err.message}`);
      await fetchData();
    }
  };

  // Entrar directamente como admin a una organización
  const handleEnterOrg = (org: AdminOrg) => {
    setOrg({
      id: org.id,
      slug: org.slug,
      name: org.name,
      role: 'owner',
    });
    navigate(`/app/${org.slug}/dashboard`);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-50 flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-brand-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 p-6 text-center shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-base font-bold text-brand-900 mb-1">Acceso restringido</h1>
          <p className="text-xs text-brand-500 mb-6 leading-relaxed">
            Esta sección está reservada exclusivamente para el administrador global de la plataforma TURNAR.
          </p>
          <Button variant="primary" onClick={() => navigate('/app')} className="w-full">
            Volver a mis espacios
          </Button>
        </div>
      </div>
    );
  }

  const lavaOrg = orgs.find((o) => o.slug === 'lava-ceramica');
  const filteredOrgs = orgs.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-brand-50/60 pb-16">
      {/* Barra superior del Superadmin */}
      <header className="bg-brand-950 text-white border-b border-brand-800 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/app" className="flex items-center gap-2 text-white hover:text-amber-400 transition-colors">
              <span className="font-serif font-black tracking-wider text-base text-terracotta-400">TURNAR</span>
            </Link>
            <span className="text-brand-600">/</span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Panel Superadmin</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              disabled={refreshing}
              className="text-xs text-brand-300 hover:text-white flex items-center gap-1 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualizar datos</span>
            </button>
            <Button variant="secondary" size="xs" onClick={() => navigate('/app')}>
              Salir a mis espacios
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Banner de bienvenida y métricas rápidas */}
        <div className="bg-white rounded-2xl border border-brand-200 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-brand-100">
            <div>
              <h1 className="text-lg font-bold text-brand-900 flex items-center gap-2">
                <span>Panel de Control Global</span>
                <Badge variant="warning" className="text-[10px]">Superadmin</Badge>
              </h1>
              <p className="text-xs text-brand-500 mt-0.5">
                Conectado como <strong className="text-brand-800">{user?.email}</strong>. Gestión total de espacios, asignación de dueños y visibilidad.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link to="/app/create-org">
                <Button variant="secondary" size="xs" icon={<Plus className="w-3.5 h-3.5" />}>
                  Crear nuevo espacio
                </Button>
              </Link>
              <Link to="/" target="_blank">
                <Button variant="ghost" size="xs" icon={<ExternalLink className="w-3.5 h-3.5" />}>
                  Ver directorio público
                </Button>
              </Link>
            </div>
          </div>

          {/* Tarjetas de métricas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5">
            <div className="p-3.5 rounded-xl bg-brand-50 border border-brand-100">
              <span className="text-[11px] font-semibold text-brand-500 block">Espacios registrados</span>
              <span className="text-2xl font-bold text-brand-900 mt-1 block">{orgs.length}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-brand-50 border border-brand-100">
              <span className="text-[11px] font-semibold text-brand-500 block">En directorio público</span>
              <span className="text-2xl font-bold text-green-700 mt-1 block">
                {orgs.filter((o) => o.is_directory_listed).length}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-brand-50 border border-brand-100">
              <span className="text-[11px] font-semibold text-brand-500 block">Usuarios registrados</span>
              <span className="text-2xl font-bold text-brand-900 mt-1 block">{profiles.length}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-brand-50 border border-brand-100">
              <span className="text-[11px] font-semibold text-brand-500 block">Estado del sistema</span>
              <span className="text-xs font-bold text-green-700 mt-2.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Operativo 100%
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* SECCIÓN DESTACADA: LAVA CERÁMICA */}
        {/* ------------------------------------------------------------- */}
        <div className="bg-gradient-to-br from-terracotta-50/50 via-white to-amber-50/40 rounded-2xl border-2 border-terracotta-200 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-terracotta-100">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-terracotta-600 text-white font-bold text-lg flex items-center justify-center shrink-0 shadow-2xs">
                L
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-brand-900">LAVA CERÁMICA</h2>
                  <Badge variant="danger" className="text-[10px]">Taller Piloto</Badge>
                </div>
                <p className="text-xs text-brand-500">
                  Dirección: <code className="text-terracotta-700 font-bold">lava-ceramica</code> · Gestión de acceso y asignación de titular
                </p>
              </div>
            </div>

            {lavaOrg && (
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleEnterOrg(lavaOrg)}
                  icon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Ingresar a LAVA CERÁMICA
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5">
            {/* Estado actual de miembros de LAVA */}
            <div>
              <h3 className="text-xs font-bold text-brand-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-brand-500" />
                <span>Equipo y Dueños actuales ({lavaOrg?.members.length || 0})</span>
              </h3>

              {lavaOrg && lavaOrg.members.length > 0 ? (
                <div className="space-y-2">
                  {lavaOrg.members.map((m) => (
                    <div
                      key={m.user_id}
                      className="p-3 rounded-xl bg-white border border-brand-200 flex items-center justify-between gap-3 text-xs shadow-2xs"
                    >
                      <div>
                        <p className="font-bold text-brand-900">
                          {m.profiles ? `${m.profiles.first_name || ''} ${m.profiles.last_name || ''}`.trim() : 'Usuario'}
                        </p>
                        <p className="text-[11px] text-brand-500 font-mono">{m.profiles?.email || 'Sin correo'}</p>
                      </div>
                      <Badge variant={m.role === 'owner' ? 'danger' : 'default'} className="text-[10px]">
                        {formatRole(m.role)}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed">
                  <p className="font-semibold mb-1">LAVA CERÁMICA todavía no tiene ningún dueño asignado formalmente.</p>
                  Podés asignarte vos mismo con un solo clic o asignárselo a Seba a continuación.
                </div>
              )}

              {/* Botón rápido para que Lucas se asigne como dueño */}
              <div className="mt-3">
                <Button
                  variant="secondary"
                  size="xs"
                  loading={sebaLoading}
                  onClick={handleClaimLavaSelf}
                  icon={<UserCheck className="w-3.5 h-3.5 text-terracotta-600" />}
                >
                  Asignarme a mí ({user?.email}) como Dueño de LAVA
                </Button>
              </div>
            </div>

            {/* Asignar a Seba */}
            <div className="bg-white p-4 rounded-xl border border-brand-200 shadow-2xs flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-brand-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-terracotta-600" />
                  <span>Asignar a Seba (Dueño de LAVA CERÁMICA)</span>
                </h3>
                <p className="text-[11px] text-brand-400 mb-3">
                  Ingresá el correo electrónico de Seba. Si ya tiene cuenta, se le asigna de inmediato. Si todavía no se registró, se genera un enlace oficial para enviarle por WhatsApp.
                </p>

                {sebaMsg && (
                  <div
                    className={`mb-3 p-3 rounded-lg text-xs ${
                      sebaMsg.type === 'ok'
                        ? 'bg-green-50 border border-green-200 text-green-800'
                        : 'bg-red-50 border border-red-200 text-red-700'
                    }`}
                  >
                    <p className="font-medium">{sebaMsg.text}</p>
                    {sebaMsg.inviteUrl && (
                      <div className="mt-2 pt-2 border-t border-green-200/60">
                        <span className="text-[10px] text-green-700 block mb-1 font-semibold">
                          Enlace de invitación generado para Seba:
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={sebaMsg.inviteUrl}
                            className="text-[11px] font-mono bg-white border border-green-300 rounded p-1.5 flex-1"
                          />
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => copyToClipboard(sebaMsg.inviteUrl!)}
                            icon={copiedLink ? <Check className="w-3 h-3 text-green-600" /> : <Share2 className="w-3 h-3" />}
                          >
                            {copiedLink ? 'Copiado' : 'Copiar'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <form onSubmit={handleAssignSeba} className="space-y-3">
                  <Input
                    label="Correo electrónico de Seba"
                    type="email"
                    placeholder="seba@lavaceramica.com"
                    value={sebaEmail}
                    onChange={(e) => setSebaEmail(e.target.value)}
                    required
                  />

                  <Select
                    label="Rol asignado"
                    options={[
                      { value: 'owner', label: 'Dueño (titularidad absoluta del espacio)' },
                      { value: 'admin', label: 'Administrador (gestión completa)' },
                    ]}
                    value={sebaRole}
                    onChange={(e) => setSebaRole(e.target.value)}
                  />

                  <Button type="submit" variant="primary" size="sm" loading={sebaLoading} className="w-full">
                    Asignar o Generar Invitación para Seba
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* LISTADO DE TODOS LOS ESPACIOS (ORGANIZACIONES) */}
        {/* ------------------------------------------------------------- */}
        <div className="bg-white rounded-2xl border border-brand-200 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-bold text-brand-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-brand-500" />
                <span>Todos los Espacios ({orgs.length})</span>
              </h2>
              <p className="text-xs text-brand-400">
                Control de visibilidad en el directorio público y asignación de equipos
              </p>
            </div>

            <div className="w-full sm:w-64">
              <Input
                placeholder="Buscar por nombre o dirección..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search className="w-3.5 h-3.5 text-brand-400" />}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50/70 text-brand-600">
                  <th className="py-2.5 px-4 font-semibold">Espacio / Nombre</th>
                  <th className="py-2.5 px-4 font-semibold">Dirección pública</th>
                  <th className="py-2.5 px-4 font-semibold">Miembros / Dueños</th>
                  <th className="py-2.5 px-4 font-semibold text-center">En Directorio</th>
                  <th className="py-2.5 px-4 font-semibold text-center">Estado</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100">
                {filteredOrgs.map((org) => {
                  const owners = org.members.filter((m) => m.role === 'owner');

                  return (
                    <tr key={org.id} className="hover:bg-brand-50/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-brand-900">{org.name}</div>
                        {org.activity_category && (
                          <div className="text-[10px] text-brand-400 capitalize">{org.activity_category}</div>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-brand-600">
                        <a
                          href={`/o/${org.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline text-terracotta-600 font-semibold inline-flex items-center gap-1"
                        >
                          <span>/o/{org.slug}</span>
                          <ExternalLink className="w-3 h-3 text-brand-400" />
                        </a>
                      </td>

                      <td className="py-3 px-4">
                        {owners.length > 0 ? (
                          <div className="space-y-0.5">
                            {owners.map((ow) => (
                              <div key={ow.user_id} className="text-[11px]">
                                <span className="font-semibold text-brand-900">
                                  {ow.profiles?.email || 'ID: ' + ow.user_id.slice(0, 8)}
                                </span>{' '}
                                <span className="text-[10px] text-terracotta-600 font-bold">(Dueño)</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-amber-700 italic">Sin dueño asignado</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleDirectory(org)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                            org.is_directory_listed
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-brand-100 text-brand-500 hover:bg-brand-200'
                          }`}
                        >
                          {org.is_directory_listed ? 'Visible' : 'Oculto'}
                        </button>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleActive(org)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            org.is_active ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'
                          }`}
                        >
                          {org.is_active ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => {
                              setTargetOrg(org);
                              setAssignEmail('');
                              setAssignMsg(null);
                              setAssignModalOpen(true);
                            }}
                          >
                            Asignar
                          </Button>
                          <Button
                            variant="primary"
                            size="xs"
                            onClick={() => handleEnterOrg(org)}
                            icon={<ArrowRight className="w-3 h-3" />}
                          >
                            Ingresar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* LISTADO DE USUARIOS REGISTRADOS */}
        {/* ------------------------------------------------------------- */}
        <div className="bg-white rounded-2xl border border-brand-200 p-5 sm:p-6 shadow-xs">
          <div className="mb-4 pb-2 border-b border-brand-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-brand-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-500" />
                <span>Usuarios Registrados en TURNAR ({profiles.length})</span>
              </h2>
              <p className="text-xs text-brand-400">Cuentas creadas que pueden ser asignadas a cualquier espacio</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50/70 text-brand-600">
                  <th className="py-2.5 px-4 font-semibold">Correo electrónico</th>
                  <th className="py-2.5 px-4 font-semibold">Nombre y Apellido</th>
                  <th className="py-2.5 px-4 font-semibold">Rol Plataforma</th>
                  <th className="py-2.5 px-4 font-semibold">Fecha de Registro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100">
                {profiles.map((p) => (
                  <tr key={p.id} className="hover:bg-brand-50/40 transition-colors">
                    <td className="py-2.5 px-4 font-semibold text-brand-900 font-mono text-[11px]">{p.email}</td>
                    <td className="py-2.5 px-4 text-brand-700">
                      {p.first_name || p.last_name ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      {p.is_platform_admin || p.email === 'lucascorrea@outlook.com.ar' ? (
                        <Badge variant="warning" className="text-[10px]">Superadmin</Badge>
                      ) : (
                        <span className="text-brand-400 text-[11px]">Usuario estándar</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-brand-400 text-[11px]">
                      {new Date(p.created_at).toLocaleDateString('es-AR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal para asignar miembro a cualquier organización */}
      <Modal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={`Asignar miembro a ${targetOrg?.name || 'Espacio'}`}
      >
        {assignMsg && (
          <div
            className={`mb-3 p-3 rounded-lg text-xs ${
              assignMsg.type === 'ok'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            <p className="font-medium">{assignMsg.text}</p>
            {assignMsg.inviteUrl && (
              <div className="mt-2 pt-2 border-t border-green-200/60">
                <span className="text-[10px] text-green-700 block mb-1 font-semibold">
                  Enlace para enviar al usuario:
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={assignMsg.inviteUrl}
                    className="text-[11px] font-mono bg-white border border-green-300 rounded p-1.5 flex-1"
                  />
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => copyToClipboard(assignMsg.inviteUrl!)}
                    icon={copiedLink ? <Check className="w-3 h-3 text-green-600" /> : <Share2 className="w-3 h-3" />}
                  >
                    {copiedLink ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleAssignMemberModal} className="space-y-3.5">
          <Input
            label="Correo electrónico"
            type="email"
            placeholder="usuario@ejemplo.com"
            value={assignEmail}
            onChange={(e) => setAssignEmail(e.target.value)}
            required
            hint="Si el usuario ya tiene cuenta en TURNAR, se le asigna de inmediato. Si no, se genera un enlace de invitación."
          />

          <Select
            label="Rol a asignar"
            options={[
              { value: 'owner', label: 'Dueño (titularidad total)' },
              { value: 'admin', label: 'Administrador (gestión total)' },
              { value: 'instructor', label: 'Profesor (gestiona sesiones y alumnos)' },
              { value: 'client', label: 'Alumno / Cliente' },
            ]}
            value={assignRole}
            onChange={(e) => setAssignRole(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" type="button" onClick={() => setAssignModalOpen(false)}>
              Cerrar
            </Button>
            <Button type="submit" variant="primary" loading={assignLoading}>
              Asignar o Generar Enlace
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
