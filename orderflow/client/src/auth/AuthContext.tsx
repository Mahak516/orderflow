import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { http, onTokenChange, refreshSession, setAccessToken } from '../api/http';
import type { AuthResult, User } from '../api/types';

interface AuthState {
  user: User | null;
  /** True until the first "am I already logged in?" check finishes. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On page load, try to restore the session from the refresh cookie.
  useEffect(() => {
    let active = true;
    refreshSession().then((session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  // If a token refresh fails mid-session, the API client clears the token: log the user out.
  useEffect(() => onTokenChange((token) => token === null && setUser(null)), []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await http.post<AuthResult>('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { data } = await http.post<AuthResult>('/auth/register', { name, email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await http.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
