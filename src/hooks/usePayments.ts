import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';

type Payment = Database['public']['Tables']['payments']['Row'];

export interface PaymentWithContact extends Payment {
  contact: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
}

export interface FinancialSummary {
  total_verified_cents: number;
  total_pending_cents: number;
  pending_count: number;
  verified_count: number;
  rejected_count: number;
  this_month_cents: number;
}

export const usePayments = (orgId: string | null, contactId?: string | null) => {
  const [payments, setPayments] = useState<PaymentWithContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!supabase || !orgId) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    // Use explicit FK hint to resolve ambiguity between payments_contact_id_fkey
    // and fk_payments_contact_org. We want fk_payments_contact_org (composite,
    // guarantees the contact belongs to the same org).
    let q = supabase
      .from('payments')
      .select(`
        id,
        organization_id,
        contact_id,
        price_version_id,
        amount_cents,
        method,
        status,
        period_month,
        period_year,
        payment_date,
        reference_code,
        notes,
        recorded_by,
        verified_by,
        verified_at,
        created_at,
        updated_at,
        contact:contacts!fk_payments_contact_org(first_name, last_name, email, phone)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (contactId) q = q.eq('contact_id', contactId);

    const { data, error: err } = await q;
    if (err) {
      // Fallback resiliente: consultar pagos y contactos por separado para evitar fallos por ambigüedad o caché de PostgREST
      let fallbackQ = supabase
        .from('payments')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (contactId) fallbackQ = fallbackQ.eq('contact_id', contactId);

      const { data: pData, error: pErr } = await fallbackQ;
      if (pErr) {
        setError(pErr.message);
        setPayments([]);
      } else {
        const contactIds = Array.from(new Set((pData || []).map((p: any) => p.contact_id).filter(Boolean)));
        const contactsMap = new Map<string, any>();
        if (contactIds.length > 0) {
          const { data: cData } = await supabase
            .from('contacts')
            .select('id, first_name, last_name, email, phone')
            .in('id', contactIds);
          (cData || []).forEach((c: any) => contactsMap.set(c.id, c));
        }
        const merged = (pData || []).map((p: any) => ({
          ...p,
          contact: contactsMap.get(p.contact_id) || null,
        }));
        setPayments(merged as PaymentWithContact[]);
        setError(null);
      }
    } else {
      setPayments((data ?? []) as unknown as PaymentWithContact[]);
    }
    setLoading(false);
  }, [orgId, contactId]);

  useEffect(() => { fetch(); }, [fetch]);

  const summary: FinancialSummary = {
    total_verified_cents: payments
      .filter((p) => p.status === 'verified')
      .reduce((sum, p) => sum + p.amount_cents, 0),
    total_pending_cents: payments
      .filter((p) => p.status === 'pending')
      .reduce((sum, p) => sum + p.amount_cents, 0),
    pending_count: payments.filter((p) => p.status === 'pending').length,
    verified_count: payments.filter((p) => p.status === 'verified').length,
    rejected_count: payments.filter((p) => p.status === 'rejected').length,
    this_month_cents: (() => {
      const now = new Date();
      return payments
        .filter((p) => {
          const d = new Date(p.created_at);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && p.status === 'verified';
        })
        .reduce((sum, p) => sum + p.amount_cents, 0);
    })(),
  };

  const createPayment = async (payload: {
    contact_id: string;
    amount_cents: number;
    method: string;
    notes?: string | null;
    period_month?: number | null;
    period_year?: number | null;
    reference_code?: string | null;
  }) => {
    if (!supabase || !orgId) return { error: 'No configurado' };
    const { error: err } = await supabase.from('payments').insert({
      ...payload,
      organization_id: orgId,
      status: 'pending',
      payment_date: new Date().toISOString().split('T')[0],
    } as never);
    if (!err) await fetch();
    return { error: err?.message ?? null };
  };

  /**
   * Verify (approve or reject) a payment.
   * Calls verify_payment_manual with all required parameters.
   * p_new_status: 'verified' | 'rejected'
   * p_verification_notes: required when rejecting a previously-verified payment.
   */
  const verifyPayment = async (
    paymentId: string,
    newStatus: 'verified' | 'rejected' = 'verified',
    verificationNotes?: string
  ) => {
    if (!supabase || !orgId) return { error: 'No configurado' };
    const { error: err } = await supabase.rpc('verify_payment_manual', {
      p_organization_id: orgId,
      p_payment_id: paymentId,
      p_new_status: newStatus,
      p_verification_notes: verificationNotes ?? null,
    });
    if (!err) await fetch();
    return { error: err?.message ?? null };
  };

  return {
    payments,
    loading,
    error,
    summary,
    refetch: fetch,
    createPayment,
    verifyPayment,
  };
};
