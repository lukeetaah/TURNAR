import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings as SettingsIcon,
  Users,
  ExternalLink,
  Copy,
  Check,
  Plus,
  Globe,
  Share2,
  Trash2,
  FileText,
  Edit2,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { formatRole } from '@/core/roles';

interface MemberItem {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
}

interface InvitationItem {
  id: string;
  invited_email: string | null;
  role: string;
  invitation_token: string;
  created_at: string;
  expires_at: string;
}

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { orgId, orgSlug, orgRole, refetchOrgs } = useOrg();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // General settings state
  const [generalForm, setGeneralForm] = useState({
    name: '',
    timezone: 'America/Argentina/Buenos_Aires',
    cancellation_notice_hours: 24,
    allow_waitlist: true,
    auto_confirm_bookings: true,
    is_directory_listed: false,
  });

  // Team state
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(true);

  // Invite modal
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('instructor');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const fetchSettingsAndTeam = useCallback(async () => {
    if (!supabase || !orgId) return;

    // Cargar datos de la organización
    const { data: orgData } = await supabase
      .from('organizations')
      .select('name, timezone, is_directory_listed')
      .eq('id', orgId)
      .single();

    const { data: orgSettings } = await supabase
      .from('organization_settings')
      .select('cancellation_notice_hours, allow_waitlist, auto_confirm_bookings')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (orgData) {
      setGeneralForm({
        name: orgData.name,
        timezone: orgData.timezone,
        cancellation_notice_hours: orgSettings?.cancellation_notice_hours ?? 24,
        allow_waitlist: orgSettings?.allow_waitlist ?? true,
        auto_confirm_bookings: orgSettings?.auto_confirm_bookings ?? true,
        is_directory_listed: orgData.is_directory_listed ?? false,
      });
    }

    // Cargar miembros actuales
    setLoadingTeam(true);
    const { data: memData } = await supabase
      .from('organization_members')
      .select('id, user_id, role, created_at, profiles(first_name, last_name, email)')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (memData) {
      setMembers(memData as unknown as MemberItem[]);
    }

    // Cargar invitaciones pendientes no reclamadas
    const { data: invData } = await supabase
      .from('organization_invitations')
      .select('id, invited_email, role, invitation_token, created_at, expires_at')
      .eq('organization_id', orgId)
      .eq('is_claimed', false)
      .gt('expires_at', new Date().toISOString());

    if (invData) {
      setInvitations(invData as unknown as InvitationItem[]);
    }
    setLoadingTeam(false);
  }, [orgId]);

  useEffect(() => {
    fetchSettingsAndTeam();
  }, [fetchSettingsAndTeam]);

  const copyPublicLink = () => {
    const url = `${window.location.origin}/o/${orgSlug}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const copyInviteLink = (token: string, id: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedInviteId(id);
    setTimeout(() => setCopiedInviteId(null), 2000);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !orgId) return;

    setSavingSettings(true);
    setSettingsMsg(null);

    // Actualizar nombre y visibilidad en directorio en organizaciones
    const { error: orgErr } = await supabase
      .from('organizations')
      .update({
        name: generalForm.name.trim(),
        timezone: generalForm.timezone,
        is_directory_listed: Boolean(generalForm.is_directory_listed),
      })
      .eq('id', orgId);

    // Actualizar parámetros operativos en organization_settings
    const { error: setErr } = await supabase
      .from('organization_settings')
      .upsert({
        organization_id: orgId,
        cancellation_notice_hours: Number(generalForm.cancellation_notice_hours),
        allow_waitlist: Boolean(generalForm.allow_waitlist),
        auto_confirm_bookings: Boolean(generalForm.auto_confirm_bookings),
      });

    setSavingSettings(false);
    if (orgErr || setErr) {
      setSettingsMsg({
        type: 'err',
        text: orgErr?.message || setErr?.message || 'Error al guardar cambios.',
      });
    } else {
      setSettingsMsg({ type: 'ok', text: 'Configuración guardada correctamente.' });
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !orgId) return;

    setInviting(true);
    setInviteError(null);

    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14); // 14 días de validez

    const { error: invErr } = await supabase.from('organization_invitations').insert({
      organization_id: orgId,
      invited_email: inviteEmail.trim().toLowerCase() || null,
      role: inviteRole,
      invitation_token: token,
      expires_at: expiresAt.toISOString(),
      is_claimed: false,
    });

    setInviting(false);
    if (invErr) {
      setInviteError(invErr.message);
    } else {
      setInviteModalOpen(false);
      setInviteEmail('');
      await fetchSettingsAndTeam();
    }
  };

  const handleRemoveMember = async (memberId: string, memberUserId: string, memberEmail?: string) => {
    if (!orgId || !supabase) return;

    const isSelf = memberUserId === user?.id;

    if (isSelf) {
      const owners = members.filter((m) => m.role === 'owner');
      if (orgRole === 'owner' && owners.length <= 1) {
        alert('No podés abandonar el espacio porque sos el único Dueño. Asigná otro Dueño antes de salir.');
        return;
      }
      if (!window.confirm('¿Confirmás que deseás abandonar este espacio de trabajo?')) {
        return;
      }
    } else {
      if (!window.confirm(`¿Confirmás eliminar a ${memberEmail || 'este usuario'} del equipo?`)) {
        return;
      }
    }

    try {
      const { error: rpcErr } = await supabase.rpc('admin_remove_member', {
        p_org_id: orgId,
        p_user_id: memberUserId,
      });

      if (rpcErr) {
        const { error: delErr } = await supabase
          .from('organization_members')
          .delete()
          .eq('id', memberId);

        if (delErr) throw delErr;
      }

      await refetchOrgs();

      if (isSelf) {
        navigate('/app');
      } else {
        await fetchSettingsAndTeam();
      }
    } catch (err: any) {
      alert(`Error al remover miembro: ${err?.message || err}`);
    }
  };

  const handleChangeMemberRole = async (memberId: string, memberUserId: string, newRole: string) => {
    if (!orgId || !supabase) return;

    try {
      const { error: rpcErr } = await supabase.rpc('admin_update_member_role', {
        p_org_id: orgId,
        p_user_id: memberUserId,
        p_role: newRole,
      });

      if (rpcErr) {
        const { error: upErr } = await supabase
          .from('organization_members')
          .update({ role: newRole })
          .eq('id', memberId);

        if (upErr) throw upErr;
      }

      await fetchSettingsAndTeam();
      await refetchOrgs();
    } catch (err: any) {
      alert(`Error al cambiar rol: ${err?.message || err}`);
    }
  };

  const handleCancelInvite = async (invitationId: string) => {
    if (!supabase) return;
    if (!window.confirm('¿Confirmás cancelar y eliminar esta invitación?')) return;

    try {
      const { error: delErr } = await supabase
        .from('organization_invitations')
        .delete()
        .eq('id', invitationId);

      if (delErr) throw delErr;
      await fetchSettingsAndTeam();
    } catch (err: any) {
      alert(`Error al cancelar invitación: ${err?.message || err}`);
    }
  };

  const isOwnerOrAdmin = orgRole === 'owner' || orgRole === 'admin' || profile?.is_platform_admin || user?.email === 'lucascorrea@outlook.com.ar';

  // ── Estado: Reglas de la organización ────────────────────────────────────────
  interface OrgRule {
    id: string;
    organization_id: string | null;
    title: string;
    content: string;
    category: string;
    is_active: boolean;
    requires_acceptance: boolean;
    version: number;
  }

  const RULE_CATEGORIES = [
    { value: 'cancellation', label: 'Cancelaciones' },
    { value: 'punctuality', label: 'Puntualidad' },
    { value: 'community', label: 'Convivencia' },
    { value: 'recovery', label: 'Recuperación de clases' },
    { value: 'facilities', label: 'Instalaciones' },
    { value: 'general', label: 'General' },
  ];

  const [orgRules, setOrgRules] = useState<OrgRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<OrgRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    title: '',
    content: '',
    category: 'general',
    requires_acceptance: true,
  });
  const [savingRule, setSavingRule] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);

  const fetchOrgRules = useCallback(async () => {
    if (!supabase || !orgId) return;
    setLoadingRules(true);
    try {
      const { data } = await supabase
        .from('organization_rules')
        .select('*')
        .or(`organization_id.eq.${orgId},organization_id.is.null`)
        .order('category')
        .order('version', { ascending: false });
      if (data) setOrgRules(data as OrgRule[]);
    } catch {
      // tabla aún no migrada
    }
    setLoadingRules(false);
  }, [orgId]);

  useEffect(() => { fetchOrgRules(); }, [fetchOrgRules]);

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !orgId) return;
    setSavingRule(true);
    setRuleError(null);

    if (editingRule && editingRule.organization_id === orgId) {
      // Editar regla propia de esta org
      const { error: err } = await supabase
        .from('organization_rules')
        .update({
          title: ruleForm.title.trim(),
          content: ruleForm.content.trim(),
          category: ruleForm.category,
          requires_acceptance: ruleForm.requires_acceptance,
          version: (editingRule.version ?? 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingRule.id);
      if (err) { setRuleError(err.message); setSavingRule(false); return; }
    } else {
      // Crear nueva regla para esta org
      const { error: err } = await supabase
        .from('organization_rules')
        .insert({
          organization_id: orgId,
          title: ruleForm.title.trim(),
          content: ruleForm.content.trim(),
          category: ruleForm.category,
          requires_acceptance: ruleForm.requires_acceptance,
          is_active: true,
          version: 1,
        });
      if (err) { setRuleError(err.message); setSavingRule(false); return; }
    }

    setSavingRule(false);
    setRuleModalOpen(false);
    setEditingRule(null);
    await fetchOrgRules();
  };

  const handleToggleRule = async (rule: OrgRule) => {
    if (!supabase || rule.organization_id !== orgId) return; // no tocar reglas globales
    await supabase
      .from('organization_rules')
      .update({ is_active: !rule.is_active })
      .eq('id', rule.id);
    await fetchOrgRules();
  };

  const handleDeleteRule = async (rule: OrgRule) => {
    if (!supabase || rule.organization_id !== orgId) return;
    if (!window.confirm('¿Eliminar esta regla de tu espacio?')) return;
    await supabase.from('organization_rules').delete().eq('id', rule.id);
    await fetchOrgRules();
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-bold text-brand-900">Configuración del espacio</h1>
        <p className="text-xs text-brand-400">
          Dirección pública, políticas de reserva y gestión del equipo de trabajo
        </p>
      </div>

      {/* Tarjeta de Dirección Pública del Espacio */}
      <div className="bg-white border border-brand-200 rounded-xl p-5 shadow-2xs">
        <h2 className="text-xs font-bold text-brand-900 mb-1 flex items-center gap-1.5">
          <Globe className="w-4 h-4 text-brand-700" />
          <span>Dirección del espacio y reservas públicas</span>
        </h2>
        <p className="text-xs text-brand-500 mb-4 leading-relaxed">
          Esta dirección se utiliza para crear el enlace público de tu espacio. Tus clientes podrán
          ingresar desde este enlace para consultar actividades y reservar sus turnos sin crear una cuenta.
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-xl">
          <div className="flex-1 px-3 py-2 text-xs font-mono bg-brand-50 border border-brand-200 rounded-lg text-brand-800 truncate select-all">
            {`${window.location.origin}/o/${orgSlug}`}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={copyPublicLink}
            icon={copiedLink ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          >
            {copiedLink ? 'Copiado' : 'Copiar'}
          </Button>
          <a
            href={`/o/${orgSlug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-brand-200 text-brand-700 text-xs font-semibold hover:bg-brand-50 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir</span>
          </a>
        </div>
      </div>

      {/* Configuración Operativa y Directorio */}
      <div className="bg-white border border-brand-200 rounded-xl p-5 shadow-2xs">
        <h2 className="text-xs font-bold text-brand-900 mb-4 flex items-center gap-1.5">
          <SettingsIcon className="w-4 h-4 text-brand-700" />
          <span>Políticas y Visibilidad</span>
        </h2>

        {settingsMsg && (
          <div
            className={`mb-4 p-3 rounded-lg text-xs leading-relaxed ${
              settingsMsg.type === 'ok'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {settingsMsg.text}
          </div>
        )}

        <form onSubmit={handleSaveSettings} className="space-y-4 max-w-lg">
          <Input
            label="Nombre del espacio"
            value={generalForm.name}
            onChange={(e) => setGeneralForm({ ...generalForm, name: e.target.value })}
            disabled={!isOwnerOrAdmin}
            required
          />

          <Input
            label="Anticipación mínima para cancelaciones (horas)"
            type="number"
            min={0}
            value={generalForm.cancellation_notice_hours}
            onChange={(e) =>
              setGeneralForm({ ...generalForm, cancellation_notice_hours: Number(e.target.value) })
            }
            hint="Los alumnos no podrán cancelar si falta menos tiempo del estipulado."
            disabled={!isOwnerOrAdmin}
            required
          />

          <div className="pt-3 border-t border-brand-100 space-y-3">
            {/* Toggle de visibilidad en directorio público */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={generalForm.is_directory_listed}
                onChange={(e) =>
                  setGeneralForm({ ...generalForm, is_directory_listed: e.target.checked })
                }
                disabled={!isOwnerOrAdmin}
                className="rounded border-brand-300 text-brand-900 focus:ring-brand-900 mt-0.5"
              />
              <div>
                <span className="text-xs text-brand-800 font-bold block">
                  Publicar este espacio en el directorio público de TURNAR
                </span>
                <span className="text-[11px] text-brand-400 block leading-normal mt-0.5">
                  Permite que cualquier persona pueda descubrir tu espacio, consultar tus disciplinas y acceder a tus horarios desde la portada principal.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={generalForm.allow_waitlist}
                onChange={(e) =>
                  setGeneralForm({ ...generalForm, allow_waitlist: e.target.checked })
                }
                disabled={!isOwnerOrAdmin}
                className="rounded border-brand-300 text-brand-900 focus:ring-brand-900 mt-0.5"
              />
              <div>
                <span className="text-xs text-brand-800 font-semibold block">
                  Habilitar lista de espera
                </span>
                <span className="text-[11px] text-brand-400 block leading-normal mt-0.5">
                  Permite que los alumnos se anoten en espera cuando se agote el cupo de un turno.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={generalForm.auto_confirm_bookings}
                onChange={(e) =>
                  setGeneralForm({ ...generalForm, auto_confirm_bookings: e.target.checked })
                }
                disabled={!isOwnerOrAdmin}
                className="rounded border-brand-300 text-brand-900 focus:ring-brand-900 mt-0.5"
              />
              <div>
                <span className="text-xs text-brand-800 font-semibold block">
                  Confirmación automática de reservas
                </span>
                <span className="text-[11px] text-brand-400 block leading-normal mt-0.5">
                  Los turnos quedan confirmados de inmediato al solicitarse mientras haya cupo.
                </span>
              </div>
            </label>
          </div>

          {isOwnerOrAdmin && (
            <div className="pt-3">
              <Button type="submit" loading={savingSettings}>
                Guardar cambios
              </Button>
            </div>
          )}
        </form>
      </div>

      {/* Gestión de Equipo y Miembros Autorizados */}
      <div className="bg-white border border-brand-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xs font-bold text-brand-900 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-brand-700" />
              <span>Equipo y Miembros Autorizados</span>
            </h2>
            <p className="text-[11px] text-brand-400 mt-0.5">
              Administradores y profesores con permisos para gestionar sesiones, agenda y asistencia
            </p>
          </div>
          {isOwnerOrAdmin && (
            <Button
              size="xs"
              icon={<Plus className="w-3 h-3" />}
              onClick={() => {
                setInviteError(null);
                setInviteModalOpen(true);
              }}
            >
              Invitar miembro
            </Button>
          )}
        </div>

        {loadingTeam ? (
          <div className="py-8 text-center">
            <span className="w-4 h-4 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Miembros activos */}
            <div className="divide-y divide-brand-100 border border-brand-200 rounded-xl overflow-hidden text-xs">
              {members.map((m) => {
                const fullName = m.profiles
                  ? `${m.profiles.first_name || ''} ${m.profiles.last_name || ''}`.trim()
                  : 'Miembro';

                return (
                  <div key={m.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white">
                    <div>
                      <div className="font-bold text-brand-900 flex items-center gap-1.5">
                        <span>{fullName || 'Usuario'}</span>
                        {m.user_id === user?.id && (
                          <Badge variant="warning" className="text-[9px]">Vos</Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-brand-400 font-mono">
                        {m.profiles?.email}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {isOwnerOrAdmin ? (
                        <select
                          value={m.role}
                          disabled={m.user_id === user?.id && m.role === 'owner' && members.filter(x => x.role === 'owner').length <= 1}
                          onChange={(e) => handleChangeMemberRole(m.id, m.user_id, e.target.value)}
                          className="text-xs bg-brand-50 border border-brand-200 rounded-lg px-2 py-1 font-semibold text-brand-800 focus:ring-1 focus:ring-brand-900"
                        >
                          <option value="owner">Dueño</option>
                          <option value="admin">Administrador</option>
                          <option value="instructor">Profesor</option>
                          <option value="client">Alumno</option>
                        </select>
                      ) : (
                        <Badge
                          variant={
                            m.role === 'owner'
                              ? 'danger'
                              : m.role === 'admin'
                              ? 'warning'
                              : m.role === 'instructor'
                              ? 'info'
                              : 'default'
                          }
                        >
                          {formatRole(m.role)}
                        </Badge>
                      )}

                      {(isOwnerOrAdmin || m.user_id === user?.id) && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleRemoveMember(m.id, m.user_id, m.profiles?.email)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          icon={<Trash2 className="w-3.5 h-3.5" />}
                        >
                          {m.user_id === user?.id ? 'Abandonar' : 'Quitar'}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Invitaciones pendientes de aceptación */}
            {invitations.length > 0 && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block mb-2">
                  Invitaciones pendientes de aceptación ({invitations.length})
                </span>
                <div className="divide-y divide-amber-200/60 border border-amber-200 rounded-xl overflow-hidden text-xs bg-amber-50/50">
                  {invitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-semibold text-brand-900">
                          {inv.invited_email || 'Enlace de invitación abierto'}
                        </div>
                        <div className="text-[10px] text-amber-700">
                          Rol asignado: <strong>{formatRole(inv.role)}</strong> · Vence:{' '}
                          {new Date(inv.expires_at).toLocaleDateString('es-AR')}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => copyInviteLink(inv.invitation_token, inv.id)}
                          icon={
                            copiedInviteId === inv.id ? (
                              <Check className="w-3 h-3 text-green-600" />
                            ) : (
                              <Share2 className="w-3 h-3" />
                            )
                          }
                        >
                          {copiedInviteId === inv.id ? 'Enlace copiado' : 'Copiar enlace'}
                        </Button>

                        {isOwnerOrAdmin && (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleCancelInvite(inv.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            icon={<Trash2 className="w-3.5 h-3.5" />}
                          >
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Invitar Miembro */}
      <Modal open={inviteModalOpen} onClose={() => setInviteModalOpen(false)} title="Generar invitación de equipo">
        {inviteError && (
          <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {inviteError}
          </div>
        )}

        <form onSubmit={handleSendInvite} className="space-y-3.5">
          <Input
            label="Correo electrónico del invitado (opcional)"
            type="email"
            placeholder="profesional@ejemplo.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            hint="Si ingresás un correo, únicamente esa cuenta podrá aceptar la invitación."
          />

          <Select
            label="Rol a asignar en este espacio"
            options={[
              { value: 'owner', label: 'Dueño (control total y titularidad del espacio)' },
              { value: 'admin', label: 'Administrador (gestión total de actividades, pagos y equipo)' },
              { value: 'instructor', label: 'Profesor (gestiona sesiones, alumnos y asistencia)' },
            ]}
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" type="button" onClick={() => setInviteModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={inviting}>
              Generar invitación
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Sección: Reglas y Condiciones de Participación ── */}
      <div className="bg-white border border-brand-200 rounded-xl p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xs font-bold text-brand-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-brand-700" />
              Reglas y condiciones de participación
            </h2>
            <p className="text-xs text-brand-400 mt-0.5 leading-relaxed">
              Configurá las reglas que tus alumnos deben aceptar al reservar un turno.
              Las reglas globales de TURNAR se muestran en gris y no pueden modificarse.
            </p>
          </div>
          {isOwnerOrAdmin && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => {
                setEditingRule(null);
                setRuleForm({ title: '', content: '', category: 'general', requires_acceptance: true });
                setRuleModalOpen(true);
              }}
            >
              Nueva regla
            </Button>
          )}
        </div>

        {loadingRules ? (
          <div className="flex justify-center py-8">
            <span className="w-5 h-5 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orgRules.length === 0 ? (
          <div className="text-center py-8 text-xs text-brand-400">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Sin reglas configuradas todavía. Las reglas globales de TURNAR aparecerán automáticamente una vez que corras la migración de base de datos.
          </div>
        ) : (
          <div className="space-y-2">
            {RULE_CATEGORIES.map((cat) => {
              const catRules = orgRules.filter((r) => r.category === cat.value);
              if (catRules.length === 0) return null;
              return (
                <div key={cat.value}>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-brand-500 mb-1.5 mt-3">
                    {cat.label}
                  </div>
                  <div className="space-y-1.5">
                    {catRules.map((rule) => {
                      const isGlobal = rule.organization_id === null;
                      return (
                        <div
                          key={rule.id}
                          className={`flex items-start gap-3 p-3 rounded-xl border text-xs ${
                            isGlobal
                              ? 'bg-brand-50 border-brand-200 opacity-80'
                              : rule.is_active
                              ? 'bg-white border-brand-200'
                              : 'bg-brand-50/40 border-brand-100 opacity-60'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-semibold text-brand-900">{rule.title}</span>
                              {isGlobal && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-brand-200 text-brand-600 font-bold">
                                  TURNAR global
                                </span>
                              )}
                              {rule.requires_acceptance && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-700 font-bold">
                                  Obligatoria
                                </span>
                              )}
                            </div>
                            <p className="text-brand-500 leading-relaxed line-clamp-2">{rule.content}</p>
                          </div>
                          {!isGlobal && isOwnerOrAdmin && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleToggleRule(rule)}
                                className="p-1 rounded hover:bg-brand-100 transition-colors"
                                title={rule.is_active ? 'Desactivar regla' : 'Activar regla'}
                              >
                                {rule.is_active
                                  ? <ToggleRight className="w-4 h-4 text-emerald-600" />
                                  : <ToggleLeft className="w-4 h-4 text-brand-400" />
                                }
                              </button>
                              <button
                                onClick={() => {
                                  setEditingRule(rule);
                                  setRuleForm({
                                    title: rule.title,
                                    content: rule.content,
                                    category: rule.category,
                                    requires_acceptance: rule.requires_acceptance,
                                  });
                                  setRuleModalOpen(true);
                                }}
                                className="p-1 rounded hover:bg-brand-100 transition-colors"
                                title="Editar regla"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-brand-500" />
                              </button>
                              <button
                                onClick={() => handleDeleteRule(rule)}
                                className="p-1 rounded hover:bg-red-50 transition-colors"
                                title="Eliminar regla"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Crear/Editar Regla */}
      <Modal
        open={ruleModalOpen}
        onClose={() => { setRuleModalOpen(false); setEditingRule(null); setRuleError(null); }}
        title={editingRule ? 'Editar regla' : 'Nueva regla de participación'}
      >
        <form onSubmit={handleSaveRule} className="space-y-4">
          {ruleError && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {ruleError}
            </div>
          )}

          <Input
            label="Título"
            placeholder="Ej: Política de cancelaciones"
            value={ruleForm.title}
            onChange={(e) => setRuleForm((f) => ({ ...f, title: e.target.value }))}
            required
          />

          <div>
            <label className="block text-xs font-semibold text-brand-700 mb-1">Descripción</label>
            <textarea
              rows={4}
              placeholder="Redactá la regla de forma clara y concisa para tus alumnos..."
              value={ruleForm.content}
              onChange={(e) => setRuleForm((f) => ({ ...f, content: e.target.value }))}
              className="w-full text-sm rounded-lg border border-brand-300 px-3 py-2 resize-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-700 mb-1">Categoría</label>
            <select
              className="w-full text-sm rounded-lg border border-brand-300 px-3 py-2 bg-white"
              value={ruleForm.category}
              onChange={(e) => setRuleForm((f) => ({ ...f, category: e.target.value }))}
            >
              {RULE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={ruleForm.requires_acceptance}
              onChange={(e) => setRuleForm((f) => ({ ...f, requires_acceptance: e.target.checked }))}
              className="rounded border-brand-300 text-brand-900"
            />
            <div>
              <span className="text-xs font-semibold text-brand-800 block">Aceptación obligatoria</span>
              <span className="text-[11px] text-brand-400">El alumno debe aceptarla explícitamente para poder reservar.</span>
            </div>
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t border-brand-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setRuleModalOpen(false); setEditingRule(null); setRuleError(null); }}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={savingRule} icon={<Check className="w-3.5 h-3.5" />}>
              {editingRule ? 'Guardar cambios' : 'Crear regla'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
