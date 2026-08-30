'use client';

/**
 * Drop-in replacement for @getmocha/users-service/react
 * Wraps Supabase auth to expose the same API surface used throughout the app.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient } from './supabase/client';
import type { User } from '@supabase/supabase-js';
import { trackOnce } from "@/src/lib/analytics";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';

interface AuthContextType {
  user: User | null;
  isPending: boolean;
  redirectToLogin: () => Promise<void>;
  redirectToGuestLogin: () => Promise<void>;
  exchangeCodeForSessionToken: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsPending(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsPending(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const redirectToLogin = async () => {
    // Use window.location.origin as fallback so redirectTo is always an absolute URL.
    // Supabase OAuth will reject a relative URL and loop back to the home page.
    const baseUrl = APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${baseUrl}/auth/callback`,
      },
    });
  };

  const redirectToGuestLogin = async () => {
    const { error } = await supabase.auth.signInAnonymously();
    if (!error) trackOnce("nd_demo_entered", "demo-entered", { method: "guest" });
    if (error) {
      console.error("Anonymous auth error:", error.message);
      alert("Guest login is not available. Please sign in with Google.");
    }
  };

  const exchangeCodeForSessionToken = async () => {
    // In Supabase SSR, the callback route handles the exchange.
    // This is called from AuthCallbackPage and is a no-op client-side
    // because PKCE exchange happens in the server route handler.
    // Just refresh the session from storage.
    await supabase.auth.getSession();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, isPending, redirectToLogin, redirectToGuestLogin, exchangeCodeForSessionToken, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
