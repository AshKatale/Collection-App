import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loginApi, User } from '@/api/endpoints';
import { setAuthToken, setUnauthorizedHandler } from '@/api/client';
import { closeDb, openUserDb } from '@/db';
import { clearSession, loadSession, saveSession } from '@/lib/session';
import { clearSessionExpired, markSessionExpired, startSync, stopSync, syncNow } from '@/sync/engine';

type Status = 'loading' | 'signedOut' | 'signedIn';

type Ctx = {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  /** Re-enter the password of the current user when the token expired (keeps all offline data). */
  reauth: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: User['role'][]) => boolean;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  // Restore the saved session WITHOUT needing the network, so the app opens offline.
  useEffect(() => {
    (async () => {
      try {
        const s = await loadSession();
        if (s) {
          setAuthToken(s.token);
          await openUserDb(s.user.id);
          setUser(s.user);
          setStatus('signedIn');
          void startSync();
          return;
        }
      } catch {
        /* fall through to signed out */
      }
      setStatus('signedOut');
    })();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => markSessionExpired());
    return () => setUnauthorizedHandler(null);
  }, []);

  const enter = useCallback(async (token: string, u: User) => {
    setAuthToken(token);
    await saveSession({ token, user: u, issuedAt: Date.now() });
    await openUserDb(u.id);
    setUser(u);
    clearSessionExpired();
    setStatus('signedIn');
    void startSync().then(() => syncNow({ quiet: true }));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await loginApi(email.trim(), password);
      await enter(res.token, res.user);
    },
    [enter]
  );

  const reauth = useCallback(
    async (password: string) => {
      if (!user) throw new Error('Not signed in');
      const res = await loginApi(user.email, password);
      if (res.user.id !== user.id) throw new Error('Please sign in with the same account to keep your offline data.');
      await enter(res.token, res.user);
    },
    [enter, user]
  );

  const logout = useCallback(async () => {
    stopSync();
    setAuthToken(null);
    await clearSession();
    await closeDb(); // data stays in this user's database file for their next login
    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<Ctx>(
    () => ({ status, user, login, reauth, logout, hasRole: (...roles) => !!user && roles.includes(user.role) }),
    [status, user, login, reauth, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
