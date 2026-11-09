import React, { useState } from 'react';
import { CreditCard, Plus, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { usePayments } from '@/hooks/usePayments';
import { useContacts } from '@/hooks/useContacts';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia bancaria' },
  { value: 'mercadopago', label: 'Mercado Pago' },
  { value: 'other', label: 'Otro' },
];

export const Payments: React.FC = () => {
  const { orgId } = useOrg();
  const { payments, loading, error, createPayment, verifyPayment } = usePayments(orgId);
  const { contacts } = useContacts(orgId);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [form, setForm] = useState({
    contact_id: '',
    amount_cents: 0,
    method: 'transfer',
    notes: '',
  });

  const openCreate = () => {
    setForm({
      contact_id: contacts[0]?.id || '',
      amount_cents: 0,
      method: 'transfer',
      notes: '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contact_id) {
      setFormError('Seleccioná un alumno o pagador.');
      return;
    }
    if (form.amount_cents <= 0) {
      setFormError('El monto debe ser mayor a 0.');
      return;
    }

    setSaving(true);
    setFormError(null);

    const res = await createPayment({
      contact_id: form.contact_id,
      amount_cents: Number(form.amount_cents),
      method: form.method as any,
      notes: form.notes.trim() || null,
      status: 'pending',
      payment_date: new Date().toISOString().split('T')[0],
    });

    setSaving(false);
    if (res.error) {
      setFormError(res.error);
    } else {
      setModalOpen(false);
    }
  };

  const handleVerify = async (paymentId: string) => {
    setActionLoading(paymentId);
    await verifyPayment(paymentId);
    setActionLoading(null);
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg font-bold text-brand-900">Cobros y Pagos</h1>
          <p className="text-xs text-brand-400">
            Control de transferencias, comprobantes y validación manual
          </p>
        </div>
        <Button
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={openCreate}
          disabled={contacts.length === 0}
        >
          Registrar cobro
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="w-5 h-5 border-2 border-brand-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="w-6 h-6" />}
          title="No hay registros de pago"
          description="Podés asentar cobros manuales o transferencias para mantener la conciliación de cada alumno."
          action={
            contacts.length > 0 ? (
              <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={openCreate}>
                Registrar primer cobro
              </Button>
            ) : undefined
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
                  <th className="py-2.5 px-4 font-semibold">Método / Detalle</th>
                  <th className="py-2.5 px-4 font-semibold">Monto</th>
                  <th className="py-2.5 px-4 font-semibold">Estado</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100">
                {payments.map((p) => {
                  const contact = (p as any).contacts;
                  const dateStr = new Date(p.created_at).toLocaleDateString('es-AR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });

                  return (
                    <tr key={p.id} className="hover:bg-brand-50/40 transition-colors">
                      <td className="py-3 px-4 font-medium text-brand-800">
                        {dateStr}
                      </td>
                      <td className="py-3 px-4 font-semibold text-brand-900">
                        {contact ? `${contact.first_name} ${contact.last_name}` : 'N/A'}
                        {contact?.email && (
                          <div className="text-[11px] text-brand-400 font-normal">{contact.email}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-brand-600">
                        <div className="capitalize font-medium">{p.method}</div>
                        {p.notes && <div className="text-[11px] text-brand-400 truncate max-w-xs">{p.notes}</div>}
                      </td>
                      <td className="py-3 px-4 font-bold text-brand-900">
                        ${(p.amount_cents / 100).toLocaleString('es-AR')}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            p.status === 'verified'
                              ? 'success'
                              : p.status === 'pending'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {p.status === 'verified'
                            ? 'Verificado'
                            : p.status === 'pending'
                            ? 'Pendiente'
                            : 'Rechazado'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {p.status === 'pending' && (
                          <Button
                            size="xs"
                            icon={<CheckCircle2 className="w-3 h-3 text-green-300" />}
                            loading={actionLoading === p.id}
                            onClick={() => handleVerify(p.id)}
                          >
                            Verificar
                          </Button>
                        )}
                        {p.status === 'verified' && (
                          <span className="text-[11px] text-green-700 font-medium inline-flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" /> Aprobado
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Registrar Cobro */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Registrar cobro manual">
        {formError && (
          <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <Select
            label="Alumno / Pagador"
            options={contacts.map((c) => ({
              value: c.id,
              label: `${c.first_name} ${c.last_name} (${c.email || 'sin email'})`,
            }))}
            value={form.contact_id}
            onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
            required
          />

          <Input
            label="Monto en centavos (ej. 2500000 = $25.000)"
            type="number"
            min={1}
            value={form.amount_cents}
            onChange={(e) => setForm({ ...form, amount_cents: Number(e.target.value) })}
            hint={
              form.amount_cents > 0
                ? `Total: $${(form.amount_cents / 100).toLocaleString('es-AR')}`
                : undefined
            }
            required
          />

          <Select
            label="Medio de pago"
            options={PAYMENT_METHODS}
            value={form.method}
            onChange={(e) => setForm({ ...form, method: e.target.value })}
          />

          <Textarea
            label="Notas / N° de Comprobante"
            placeholder="Ej. Transferencia Banco Galicia comprobante #83921..."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
          />

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Registrar pago
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
