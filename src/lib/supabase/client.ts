import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'https://your-project-id.supabase.co' &&
  !supabaseUrl.includes('your-project-id')
);

// Cliente seguro que evita crasheos si aún no se han configurado las variables de entorno
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey && isSupabaseConfigured
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
