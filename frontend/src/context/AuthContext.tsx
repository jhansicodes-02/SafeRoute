import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, post, TOKEN_KEY } from '../api/client';
import type { User } from '../types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setLoading(false);
      return;
    }
    api<{ user: User }>('/auth/me')
      .then((result) => setUser(result.user))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const acceptSession = (result: { token: string; user: User }) => {
    localStorage.setItem(TOKEN_KEY, result.token);
    setUser(result.user);
  };

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    signIn: async (email, password) => acceptSession(await post('/auth/login', { email, password })),
    register: async (name, email, password) => acceptSession(await post('/auth/register', { name, email, password })),
    signOut: () => {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
