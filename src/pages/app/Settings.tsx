import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings as SettingsIcon,
  Users,
  ExternalLink,
  Copy,
  Check,
  Plus,
  Globe,
  Share2,
} from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { formatRole } from '@/core/roles';

interface MemberItem {
  id: string;
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
  const { orgId, orgSlug, orgRole } = useOrg();
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
      .select('id, role, created_at, profiles(first_name, last_name, email)')
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

  const isOwnerOrAdmin = orgRole === 'owner' || orgRole === 'admin';

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
                  <div key={m.id} className="p-3 flex items-center justify-between bg-white">
                    <div>
                      <div className="font-bold text-brand-900">
                        {fullName || 'Usuario'}
                      </div>
                      <div className="text-[11px] text-brand-400 font-mono">
                        {m.profiles?.email}
                      </div>
                    </div>
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
    </div>
  );
};
