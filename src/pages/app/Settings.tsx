import React, { useState, useEffect, useCallback } from 'react';
import { Settings as SettingsIcon, Users, ExternalLink, Copy, Check, Plus } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';

interface MemberItem {
  id: string;
  role: string;
  created_at: string;
  profiles: {
    full_name: string | null;
    email: string;
  } | null;
}

interface InvitationItem {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
}

export const Settings: React.FC = () => {
  const { orgId, orgSlug, orgRole } = useOrg();
  const [copied, setCopied] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // General settings state
  const [generalForm, setGeneralForm] = useState({
    name: '',
    timezone: 'America/Argentina/Buenos_Aires',
    cancellation_notice_hours: 24,
    allow_waitlist: true,
    auto_confirm_bookings: true,
  });

  // Team state
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(true);

  // Invite modal
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const fetchSettingsAndTeam = useCallback(async () => {
    if (!supabase || !orgId) return;

    // Load org info
    const { data: orgData } = await supabase
      .from('organizations')
      .select('name, timezone')
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
      });
    }

    // Load members
    setLoadingTeam(true);
    const { data: memData } = await supabase
      .from('organization_members')
      .select('id, role, created_at, profiles(full_name, email)')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (memData) {
      setMembers(memData as unknown as MemberItem[]);
    }

    // Load pending invitations
    const { data: invData } = await supabase
      .from('organization_invitations')
      .select('id, email, role, created_at, expires_at')
      .eq('organization_id', orgId)
      .is('claimed_at', null)
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !orgId) return;

    setSavingSettings(true);
    setSettingsMsg(null);

    // Update org
    const { error: orgErr } = await supabase
      .from('organizations')
      .update({
        name: generalForm.name,
        timezone: generalForm.timezone,
      })
      .eq('id', orgId);

    // Upsert org settings
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
        text: orgErr?.message || setErr?.message || 'Error al guardar.',
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
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error: invErr } = await supabase.from('organization_invitations').insert({
      organization_id: orgId,
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
      token,
      expires_at: expiresAt.toISOString(),
    } as never);

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
        <h1 className="text-lg font-bold text-brand-900">Configuración</h1>
        <p className="text-xs text-brand-400">Parámetros del espacio, página pública y equipo</p>
      </div>

      {/* Tarjeta de Enlace Público */}
      <div className="bg-white border border-brand-200 rounded-xl p-4 shadow-2xs">
        <h2 className="text-xs font-bold text-brand-800 mb-1 flex items-center gap-1.5">
          <ExternalLink className="w-3.5 h-3.5 text-brand-600" />
          Página Pública de Reservas
        </h2>
        <p className="text-xs text-brand-400 mb-3">
          Compartí este link con tus alumnos para que reserven turnos en tus talleres y actividades.
        </p>
        <div className="flex items-center gap-2 max-w-lg">
          <input
            type="text"
            readOnly
            value={`${window.location.origin}/o/${orgSlug}`}
            className="flex-1 px-3 py-2 text-xs font-mono bg-brand-50 border border-brand-200 rounded-lg text-brand-700 select-all"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={copyPublicLink}
            icon={copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          >
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
          <a
            href={`/o/${orgSlug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center p-2 rounded-lg border border-brand-200 text-brand-600 hover:bg-brand-50"
            title="Abrir página pública"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Configuración General */}
      <div className="bg-white border border-brand-200 rounded-xl p-4 shadow-2xs">
        <h2 className="text-xs font-bold text-brand-800 mb-4 flex items-center gap-1.5">
          <SettingsIcon className="w-3.5 h-3.5 text-brand-600" />
          Políticas y Horarios
        </h2>

        {settingsMsg && (
          <div
            className={`mb-4 p-2.5 rounded-lg text-xs ${
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
            label="Nombre de la organización"
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

          <div className="pt-2 border-t border-brand-100 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={generalForm.allow_waitlist}
                onChange={(e) =>
                  setGeneralForm({ ...generalForm, allow_waitlist: e.target.checked })
                }
                disabled={!isOwnerOrAdmin}
                className="rounded border-brand-300 text-brand-900 focus:ring-brand-900"
              />
              <span className="text-xs text-brand-700 font-medium">
                Habilitar lista de espera cuando se agote el cupo
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={generalForm.auto_confirm_bookings}
                onChange={(e) =>
                  setGeneralForm({ ...generalForm, auto_confirm_bookings: e.target.checked })
                }
                disabled={!isOwnerOrAdmin}
                className="rounded border-brand-300 text-brand-900 focus:ring-brand-900"
              />
              <span className="text-xs text-brand-700 font-medium">
                Confirmar reservas automáticamente al solicitarse
              </span>
            </label>
          </div>

          {isOwnerOrAdmin && (
            <div className="pt-2">
              <Button type="submit" loading={savingSettings}>
                Guardar cambios
              </Button>
            </div>
          )}
        </form>
      </div>

      {/* Equipo y Profesionales */}
      <div className="bg-white border border-brand-200 rounded-xl p-4 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xs font-bold text-brand-800 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-brand-600" />
              Equipo y Miembros
            </h2>
            <p className="text-[11px] text-brand-400">
              Administradores y profesionales con acceso a la gestión de este espacio
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
          <div className="py-6 text-center">
            <span className="w-4 h-4 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="divide-y divide-brand-100 border border-brand-100 rounded-xl overflow-hidden text-xs">
            {members.map((m) => (
              <div key={m.id} className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-brand-900">
                    {m.profiles?.full_name || 'Usuario'}
                  </div>
                  <div className="text-[11px] text-brand-400">{m.profiles?.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      m.role === 'owner'
                        ? 'danger'
                        : m.role === 'admin'
                        ? 'warning'
                        : 'default'
                    }
                  >
                    {m.role}
                  </Badge>
                </div>
              </div>
            ))}

            {invitations.map((inv) => (
              <div key={inv.id} className="p-3 flex items-center justify-between bg-amber-50/50">
                <div>
                  <div className="font-medium text-brand-800">{inv.email}</div>
                  <div className="text-[10px] text-amber-700 font-medium">Invitación pendiente</div>
                </div>
                <Badge variant="warning">{inv.role}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Invitar Miembro */}
      <Modal open={inviteModalOpen} onClose={() => setInviteModalOpen(false)} title="Invitar miembro al equipo">
        {inviteError && (
          <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {inviteError}
          </div>
        )}

        <form onSubmit={handleSendInvite} className="space-y-3">
          <Input
            label="Correo electrónico del invitado"
            type="email"
            placeholder="profesional@ejemplo.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />

          <Select
            label="Rol a asignar"
            options={[
              { value: 'staff', label: 'Staff / Profesor (gestiona sesiones y reservas)' },
              { value: 'admin', label: 'Administrador (gestión completa de actividades y equipo)' },
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
