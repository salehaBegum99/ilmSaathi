import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { User } from '../types';

interface RegisterInput { email: string; password: string; displayName: string; role: 'learner' | 'educator'; ageConfirmed?: boolean }
interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ mfaRequired: boolean }>;
  verifyMfa: (code: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try { setUser(await api.me()); } catch { setUser(null); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    void api.me()
      .then((nextUser) => { if (active) setUser(nextUser); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const value = useMemo<AuthValue>(() => ({
    user,
    loading,
    login: async (email, password) => {
      const result = await api.login({ email, password });
      if (result.user) setUser(result.user);
      return { mfaRequired: Boolean(result.mfaRequired) };
    },
    verifyMfa: async (code) => { const result = await api.verifyMfa(code); setUser(result.user); },
    register: async (input) => { const result = await api.register(input); setUser(result.user); },
    logout: async () => { await api.logout(); setUser(null); },
    refreshUser
  }), [user, loading, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
