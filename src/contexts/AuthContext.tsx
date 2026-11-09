import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithOtp: (email: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null; user: User | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const getRedirectUrl = () => {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/app`;
  }
  return 'https://turnar-nine.vercel.app/app';
};

const getUrlAuthError = (): string | null => {
  if (typeof window === 'undefined') return null;
  // Check hash fragment
  const hash = window.location.hash ? window.location.hash.substring(1) : '';
  const search = window.location.search ? window.location.search.substring(1) : '';

  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(search);

  const errorDesc =
    hashParams.get('error_description') || searchParams.get('error_description');
  if (errorDesc) {
    return decodeURIComponent(errorDesc.replace(/\+/g, ' '));
  }

  const error = hashParams.get('error') || searchParams.get('error');
  if (error) {
    return decodeURIComponent(error.replace(/\+/g, ' '));
  }

  return null;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const clearAuthError = () => setAuthError(null);

  const fetchProfile = async (userId: string) => {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      setProfile((data as Profile) ?? null);
    } catch {
      // Profile might not exist yet if trigger is executing
    }
  };

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // 1. Check for errors in URL (e.g. expired confirmation links)
    const urlError = getUrlAuthError();
    if (urlError) {
      setAuthError(urlError);
      // Clean up URL so error doesn't persist on refresh
      if (window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    // 2. Listen to auth state changes (handles tokens in hash, PKCE, sign-in, sign-out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: string, s: any) => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          await fetchProfile(s.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);

        // If hash contained access_token, clean it up gracefully
        if (
          event === 'SIGNED_IN' &&
          window.location.hash &&
          window.location.hash.includes('access_token') &&
          window.history.replaceState
        ) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    );

    // 3. Fallback check with getSession in case no event fired
    supabase.auth.getSession().then(({ data: { session: s } }: any) => {
      if (s) {
        setSession(s);
        setUser(s.user);
        fetchProfile(s.user.id);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithOtp = async (email: string) => {
    if (!supabase) return { error: new Error('Supabase no configurado') };
    clearAuthError();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getRedirectUrl(),
      },
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    if (!supabase) return { error: new Error('Supabase no configurado'), user: null };
    clearAuthError();

    const [first, ...rest] = (fullName || '').trim().split(' ');
    const lastName = rest.join(' ');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getRedirectUrl(),
        data: {
          first_name: first || 'Usuario',
          last_name: lastName || '',
        },
      },
    });

    return { error: error as Error | null, user: data?.user ?? null };
  };

  const signInWithPassword = async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabase no configurado') };
    clearAuthError();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    if (!supabase) return;
    clearAuthError();
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading,
        authError,
        clearAuthError,
        signInWithOtp,
        signUp,
        signInWithPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export { isSupabaseConfigured };
