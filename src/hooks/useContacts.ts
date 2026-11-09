import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';

type Contact = Database['public']['Tables']['contacts']['Row'];

export const useContacts = (orgId: string | null) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!supabase || !orgId) { setLoading(false); return; }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', orgId)
      .order('last_name');
    if (err) setError(err.message);
    else setContacts((data as Contact[]) ?? []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetch(); }, [fetch]);

  const createContact = async (payload: Partial<Contact>) => {
    if (!supabase || !orgId) return { error: 'No configurado' };
    const { error: err } = await supabase.from('contacts').insert({
      ...payload,
      organization_id: orgId,
    });
    if (!err) await fetch();
    return { error: err?.message ?? null };
  };

  const updateContact = async (id: string, payload: Partial<Contact>) => {
    if (!supabase) return { error: 'No configurado' };
    const { error: err } = await supabase
      .from('contacts')
      .update(payload)
      .eq('id', id);
    if (!err) await fetch();
    return { error: err?.message ?? null };
  };

  return { contacts, loading, error, refetch: fetch, createContact, updateContact };
};
