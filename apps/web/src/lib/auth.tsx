import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { SystemStatus, UserDto } from '@datapot/shared';
import { api, clearSession, getStoredUser, getToken, setSession } from './api';

interface AuthState {
  user: UserDto | null;
  token: string | null;
  status: SystemStatus | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginBootstrap: () => Promise<void>;
  logout: () => void;
  refreshStatus: () => Promise<SystemStatus>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(getStoredUser<UserDto>());
  const [token, setToken] = useState<string | null>(getToken());
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    const s = await api<SystemStatus>('/system/status');
    setStatus(s);
    return s;
  }, []);

  useEffect(() => {
    refreshStatus()
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, [refreshStatus]);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await api<{ accessToken: string; user: UserDto }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setSession(res.accessToken, res.user);
      setToken(res.accessToken);
      setUser(res.user);
      await refreshStatus();
    },
    [refreshStatus],
  );

  const loginBootstrap = useCallback(async () => {
    const res = await api<{ accessToken: string; user: UserDto }>(
      '/auth/bootstrap-login',
      { method: 'POST', body: '{}' },
    );
    setSession(res.accessToken, res.user);
    setToken(res.accessToken);
    setUser(res.user);
    await refreshStatus();
  }, [refreshStatus]);

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      status,
      loading,
      refreshStatus,
      login,
      loginBootstrap,
      logout,
    }),
    [user, token, status, loading, refreshStatus, login, loginBootstrap, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
