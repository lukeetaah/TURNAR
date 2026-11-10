import React, { useState } from 'react';
import {
  CreditCard,
  Plus,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Clock,
  TrendingUp,
  AlertCircle,
  Search,
  ChevronDown,
  Filter,
} from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { usePayments } from '@/hooks/usePayments';
import type { PaymentWithContact } from '@/hooks/usePayments';
import { useContacts } from '@/hooks/useContacts';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ARS = (cents: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(cents / 100);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  mercadopago: 'Mercado Pago',
  other: 'Otro',
};

const PAYMENT_METHODS = Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }));

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger'> = {
  verified: 'success',
  pending: 'warning',
  rejected: 'danger',
};

const STATUS_LABEL: Record<string, string> = {
  verified: 'Verificado',
  pending: 'Pendiente',
  rejected: 'Rechazado',
};

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, sub, icon, variant = 'default' }) => {
  const colors = {
    default: 'bg-white border-brand-200',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-amber-50 border-amber-200',
    danger: 'bg-red-50 border-red-200',
  };
  const iconColors = {
    default: 'text-brand-500',
    success: 'text-green-600',
    warning: 'text-amber-600',
    danger: 'text-red-600',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[variant]} flex items-start gap-3`}>
      <div className={`mt-0.5 ${iconColors[variant]}`}>{icon}</div>
      <div>
        <p className="text-xs text-brand-500 font-medium">{label}</p>
        <p className="text-lg font-bold text-brand-900 leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-brand-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Payment row
// ---------------------------------------------------------------------------

interface PaymentRowProps {
  payment: PaymentWithContact;
  onVerify: (id: string) => void;
  onReject: (id: string) => void;
  loadingId: string | null;
}

const PaymentRow: React.FC<PaymentRowProps> = ({ payment, onVerify, onReject, loadingId }) => {
  const p = payment;
  const name = p.contact
    ? `${p.contact.first_name} ${p.contact.last_name}`
    : 'Contacto no encontrado';

  return (
    <tr className="hover:bg-brand-50/40 transition-colors">
      <td className="py-3 px-4 text-brand-700 text-xs">{fmtDate(p.created_at)}</td>
      <td className="py-3 px-4">
        <div className="font-semibold text-brand-900 text-xs">{name}</div>
        {p.contact?.email && (
          <div className="text-[11px] text-brand-400">{p.contact.email}</div>
        )}
      </td>
      <td className="py-3 px-4 text-xs">
        <div className="font-medium text-brand-700">{METHOD_LABELS[p.method] ?? p.method}</div>
        {p.reference_code && (
          <div className="text-[11px] text-brand-400">Ref: {p.reference_code}</div>
        )}
        {p.notes && (
          <div className="text-[11px] text-brand-400 truncate max-w-[180px]">{p.notes}</div>
        )}
      </td>
      <td className="py-3 px-4">
        <span className="font-bold text-brand-900 text-sm">{ARS(p.amount_cents)}</span>
        {(p.period_month != null && p.period_year != null) && (
          <div className="text-[11px] text-brand-400">
            {p.period_month}/{p.period_year}
          </div>
        )}
      </td>
      <td className="py-3 px-4">
        <Badge variant={STATUS_VARIANT[p.status] ?? 'warning'}>
          {STATUS_LABEL[p.status] ?? p.status}
        </Badge>
      </td>
      <td className="py-3 px-4 text-right">
        {p.status === 'pending' && (
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => onVerify(p.id)}
              disabled={loadingId === p.id}
              title="Verificar pago"
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-50 transition-colors"
            >
              {loadingId === p.id ? (
                <span className="w-3 h-3 border border-green-700 border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle2 className="w-3 h-3" />
              )}
              Aprobar
            </button>
            <button
              onClick={() => onReject(p.id)}
              disabled={loadingId === p.id}
              title="Rechazar pago"
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              <XCircle className="w-3 h-3" />
              Rechazar
            </button>
          </div>
        )}
        {p.status === 'verified' && (
          <span className="text-[11px] text-green-700 font-medium inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Aprobado
          </span>
        )}
        {p.status === 'rejected' && (
          <span className="text-[11px] text-red-500 font-medium inline-flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" /> Rechazado
          </span>
        )}
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// Modal: Registrar cobro
// ---------------------------------------------------------------------------

interface RegisterPaymentModalProps {
  open: boolean;
  onClose: () => void;
  contacts: { id: string; first_name: string; last_name: string; email: string | null }[];
  onCreate: (payload: {
    contact_id: string;
    amount_cents: number;
    method: string;
    notes?: string | null;
    reference_code?: string | null;
    period_month?: number | null;
    period_year?: number | null;
  }) => Promise<{ error: string | null }>;
}

const MONTHS = [
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 1, currentYear, currentYear + 1].map((y) => ({
  value: String(y),
  label: String(y),
}));

const RegisterPaymentModal: React.FC<RegisterPaymentModalProps> = ({
  open,
  onClose,
  contacts,
  onCreate,
}) => {
  const now = new Date();
  const [form, setForm] = useState({
    contact_id: contacts[0]?.id ?? '',
    amount_input: '',
    method: 'transfer',
    reference_code: '',
    notes: '',
    period_month: String(now.getMonth() + 1),
    period_year: String(now.getFullYear()),
    has_period: false,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setForm({
      contact_id: contacts[0]?.id ?? '',
      amount_input: '',
      method: 'transfer',
      reference_code: '',
      notes: '',
      period_month: String(now.getMonth() + 1),
      period_year: String(now.getFullYear()),
      has_period: false,
    });
    setFormError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  // Parse amount: accepts both "25000" (pesos) and correctly validates
  const parsedAmountCents = (() => {
    const raw = form.amount_input.replace(/[.,\s]/g, '').trim();
    const n = Number(raw);
    return isNaN(n) || n <= 0 ? 0 : n * 100; // input is in pesos → convert to cents
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contact_id) { setFormError('Seleccioná un alumno o pagador.'); return; }
    if (parsedAmountCents <= 0) { setFormError('Ingresá un monto válido en pesos (ej. 25000).'); return; }

    setSaving(true);
    setFormError(null);

    const res = await onCreate({
      contact_id: form.contact_id,
      amount_cents: parsedAmountCents,
      method: form.method,
      notes: form.notes.trim() || null,
      reference_code: form.reference_code.trim() || null,
      period_month: form.has_period ? Number(form.period_month) : null,
      period_year: form.has_period ? Number(form.period_year) : null,
    });

    setSaving(false);
    if (res.error) {
      setFormError(res.error);
    } else {
      handleClose();
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Registrar cobro manual">
      {formError && (
        <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <Select
          label="Alumno / Pagador"
          options={contacts.map((c) => ({
            value: c.id,
            label: `${c.first_name} ${c.last_name}${c.email ? ` · ${c.email}` : ''}`,
          }))}
          value={form.contact_id}
          onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
          required
        />

        <Input
          label="Monto cobrado (en pesos)"
          type="text"
          inputMode="numeric"
          placeholder="Ej. 25000"
          value={form.amount_input}
          onChange={(e) => setForm({ ...form, amount_input: e.target.value })}
          hint={parsedAmountCents > 0 ? `= ${ARS(parsedAmountCents)}` : 'Ingresá el importe en pesos'}
          required
        />

        <Select
          label="Medio de pago"
          options={PAYMENT_METHODS}
          value={form.method}
          onChange={(e) => setForm({ ...form, method: e.target.value })}
        />

        <Input
          label="N° de comprobante o referencia (opcional)"
          placeholder="Ej. 83921 / Galicia"
          value={form.reference_code}
          onChange={(e) => setForm({ ...form, reference_code: e.target.value })}
        />

        {/* Period toggle */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-brand-700 font-medium mb-2">
            <input
              type="checkbox"
              className="rounded border-brand-300"
              checked={form.has_period}
              onChange={(e) => setForm({ ...form, has_period: e.target.checked })}
            />
            Corresponde a un período específico (cuota mensual)
          </label>
          {form.has_period && (
            <div className="flex gap-2">
              <div className="flex-1">
                <Select
                  label="Mes"
                  options={MONTHS}
                  value={form.period_month}
                  onChange={(e) => setForm({ ...form, period_month: e.target.value })}
                />
              </div>
              <div className="flex-1">
                <Select
                  label="Año"
                  options={YEARS}
                  value={form.period_year}
                  onChange={(e) => setForm({ ...form, period_year: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

        <Textarea
          label="Notas adicionales (opcional)"
          placeholder="Observaciones, acuerdos especiales..."
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
        />

        <div className="flex justify-end gap-2 pt-3 border-t border-brand-100">
          <Button variant="secondary" type="button" onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            Registrar pago
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Modal: Rechazar pago
// ---------------------------------------------------------------------------

interface RejectModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
  loading: boolean;
}

const RejectModal: React.FC<RejectModalProps> = ({ open, onClose, onConfirm, loading }) => {
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(notes);
  };

  return (
    <Modal open={open} onClose={onClose} title="Rechazar pago">
      <p className="text-xs text-brand-600 mb-3">
        Explicá brevemente el motivo del rechazo. Esto quedará registrado en el historial.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          label="Motivo del rechazo"
          placeholder="Ej. Comprobante ilegible, monto incorrecto..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          required
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading} className="bg-red-600 hover:bg-red-700">
            Confirmar rechazo
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Tab = 'resumen' | 'cobros';

export const Payments: React.FC = () => {
  const { orgId } = useOrg();
  const { payments, loading, error, summary, createPayment, verifyPayment, refetch } = usePayments(orgId);
  const { contacts } = useContacts(orgId);

  const [tab, setTab] = useState<Tab>('resumen');
  const [modalOpen, setModalOpen] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; paymentId: string | null }>({
    open: false,
    paymentId: null,
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // --- Action handlers ---

  const handleVerify = async (paymentId: string) => {
    setActionLoading(paymentId);
    setActionError(null);
    const res = await verifyPayment(paymentId, 'verified');
    if (res.error) setActionError(res.error);
    setActionLoading(null);
  };

  const openReject = (paymentId: string) => {
    setRejectModal({ open: true, paymentId });
  };

  const handleReject = async (notes: string) => {
    if (!rejectModal.paymentId) return;
    setActionLoading(rejectModal.paymentId);
    setActionError(null);
    const res = await verifyPayment(rejectModal.paymentId, 'rejected', notes);
    if (res.error) setActionError(res.error);
    setActionLoading(null);
    setRejectModal({ open: false, paymentId: null });
  };

  // --- Filtered list ---

  const filtered = payments.filter((p) => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = p.contact
        ? `${p.contact.first_name} ${p.contact.last_name}`.toLowerCase()
        : '';
      const ref = (p.reference_code ?? '').toLowerCase();
      const note = (p.notes ?? '').toLowerCase();
      if (!name.includes(q) && !ref.includes(q) && !note.includes(q)) return false;
    }
    return true;
  });

  const pendingPayments = payments.filter((p) => p.status === 'pending');

  // --- Tabs ---

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'cobros', label: 'Cobros y pagos', badge: pendingPayments.length || undefined },
  ];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-bold text-brand-900">Centro de Cobros</h1>
          <p className="text-xs text-brand-400">
            Aranceles, transferencias, comprobantes y conciliación
          </p>
        </div>
        <Button
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setModalOpen(true)}
          disabled={contacts.length === 0}
        >
          Registrar cobro
        </Button>
      </div>

      {/* Global error */}
      {(error || actionError) && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {error || actionError}
          <button
            className="ml-auto text-red-500 underline"
            onClick={() => { setActionError(null); refetch(); }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-brand-100">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'text-brand-900 border-b-2 border-brand-900 -mb-px'
                : 'text-brand-400 hover:text-brand-700'
            }`}
          >
            {t.label}
            {t.badge ? (
              <span className="ml-1.5 text-[10px] font-bold bg-amber-500 text-white rounded-full px-1.5 py-0.5">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <span className="w-5 h-5 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* TAB: Resumen */}
      {!loading && tab === 'resumen' && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KpiCard
              label="Cobrado este mes"
              value={ARS(summary.this_month_cents)}
              icon={<TrendingUp className="w-4 h-4" />}
              variant="success"
            />
            <KpiCard
              label="Pendiente de verificar"
              value={ARS(summary.total_pending_cents)}
              sub={`${summary.pending_count} ${summary.pending_count === 1 ? 'pago' : 'pagos'}`}
              icon={<Clock className="w-4 h-4" />}
              variant={summary.pending_count > 0 ? 'warning' : 'default'}
            />
            <KpiCard
              label="Total verificado (histórico)"
              value={ARS(summary.total_verified_cents)}
              sub={`${summary.verified_count} pagos confirmados`}
              icon={<ShieldCheck className="w-4 h-4" />}
            />
          </div>

          {/* Quick action if pending */}
          {summary.pending_count > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    {summary.pending_count} {summary.pending_count === 1 ? 'pago pendiente' : 'pagos pendientes'} de verificar
                  </p>
                  <p className="text-xs text-amber-700">
                    {ARS(summary.total_pending_cents)} esperando aprobación
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => setTab('cobros')}>
                Revisar pagos
              </Button>
            </div>
          )}

          {/* Empty state */}
          {payments.length === 0 && (
            <EmptyState
              icon={<CreditCard className="w-6 h-6" />}
              title="Sin movimientos registrados"
              description="Cuando registres cobros aparecerán acá con su estado de verificación."
              action={
                contacts.length > 0 ? (
                  <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setModalOpen(true)}>
                    Registrar primer cobro
                  </Button>
                ) : undefined
              }
            />
          )}

          {/* Recent payments preview */}
          {payments.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-brand-800">Últimos movimientos</h2>
                <button
                  className="text-xs text-brand-500 hover:text-brand-800 underline"
                  onClick={() => setTab('cobros')}
                >
                  Ver todos
                </button>
              </div>
              <div className="bg-white border border-brand-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-brand-100 bg-brand-50/70 text-brand-600">
                        <th className="py-2.5 px-4 font-semibold">Fecha</th>
                        <th className="py-2.5 px-4 font-semibold">Alumno</th>
                        <th className="py-2.5 px-4 font-semibold">Monto</th>
                        <th className="py-2.5 px-4 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-100">
                      {payments.slice(0, 5).map((p) => (
                        <tr key={p.id} className="hover:bg-brand-50/40">
                          <td className="py-2.5 px-4 text-brand-600">{fmtDate(p.created_at)}</td>
                          <td className="py-2.5 px-4 font-medium text-brand-800">
                            {p.contact
                              ? `${p.contact.first_name} ${p.contact.last_name}`
                              : 'N/A'}
                          </td>
                          <td className="py-2.5 px-4 font-bold text-brand-900">{ARS(p.amount_cents)}</td>
                          <td className="py-2.5 px-4">
                            <Badge variant={STATUS_VARIANT[p.status] ?? 'warning'}>
                              {STATUS_LABEL[p.status] ?? p.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Cobros y pagos */}
      {!loading && tab === 'cobros' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-400" />
              <input
                type="text"
                placeholder="Buscar por alumno, comprobante..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-brand-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-900/20"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-400 pointer-events-none" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="pl-8 pr-7 py-2 text-xs border border-brand-200 rounded-lg bg-white focus:outline-none appearance-none cursor-pointer"
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="verified">Verificados</option>
                <option value="rejected">Rechazados</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-brand-400 pointer-events-none" />
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="w-6 h-6" />}
              title={search || filterStatus !== 'all' ? 'Sin resultados' : 'Sin pagos registrados'}
              description={
                search || filterStatus !== 'all'
                  ? 'Probá cambiando el filtro o la búsqueda.'
                  : 'Registrá el primer cobro con el botón de arriba.'
              }
            />
          ) : (
            <div className="bg-white border border-brand-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-brand-100 bg-brand-50/70 text-brand-600">
                      <th className="py-2.5 px-4 font-semibold">Fecha</th>
                      <th className="py-2.5 px-4 font-semibold">Alumno</th>
                      <th className="py-2.5 px-4 font-semibold">Método / Referencia</th>
                      <th className="py-2.5 px-4 font-semibold">Monto</th>
                      <th className="py-2.5 px-4 font-semibold">Estado</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-100">
                    {filtered.map((p) => (
                      <PaymentRow
                        key={p.id}
                        payment={p}
                        onVerify={handleVerify}
                        onReject={openReject}
                        loadingId={actionLoading}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 border-t border-brand-100 bg-brand-50/40 flex items-center justify-between">
                <span className="text-[11px] text-brand-400">
                  {filtered.length} {filtered.length === 1 ? 'registro' : 'registros'}
                  {filterStatus !== 'all' || search ? ' (filtrado)' : ''}
                </span>
                {filterStatus !== 'all' || search ? (
                  <button
                    className="text-[11px] text-brand-500 underline"
                    onClick={() => { setSearch(''); setFilterStatus('all'); }}
                  >
                    Limpiar filtros
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <RegisterPaymentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        contacts={contacts}
        onCreate={createPayment}
      />

      <RejectModal
        open={rejectModal.open}
        onClose={() => setRejectModal({ open: false, paymentId: null })}
        onConfirm={handleReject}
        loading={rejectModal.paymentId !== null && actionLoading === rejectModal.paymentId}
      />
    </div>
  );
};
