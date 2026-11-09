import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';

type Payment = Database['public']['Tables']['payments']['Row'];

export const usePayments = (orgId: string | null, contactId?: string | null) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!supabase || !orgId) { setLoading(false); return; }
    setLoading(true);
    let q = supabase
      .from('payments')
      .select('*, contacts(first_name, last_name, email)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    if (contactId) q = q.eq('contact_id', contactId);
    const { data, error: err } = await q;
    if (err) setError(err.message);
    else setPayments(data as unknown as Payment[] ?? []);
    setLoading(false);
  }, [orgId, contactId]);

  useEffect(() => { fetch(); }, [fetch]);

  const createPayment = async (payload: Partial<Payment>) => {
    if (!supabase || !orgId) return { error: 'No configurado' };
    const { error: err } = await supabase.from('payments').insert({
      ...payload,
      organization_id: orgId,
    } as never);
    if (!err) await fetch();
    return { error: err?.message ?? null };
  };

  const verifyPayment = async (paymentId: string) => {
    if (!supabase) return { error: 'No configurado' };
    const { error: err } = await supabase.rpc('verify_payment_manual', {
      p_payment_id: paymentId,
    });
    if (!err) await fetch();
    return { error: err?.message ?? null };
  };

  return { payments, loading, error, refetch: fetch, createPayment, verifyPayment };
};
