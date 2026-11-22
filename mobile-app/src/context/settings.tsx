import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_API_URL } from '@/lib/config';
import { secureGet, secureSet } from '@/lib/secure';
import { setApiBaseUrl } from '@/api/client';
import { mr } from '@/lib/mr';

export type Lang = 'en' | 'mr';
export type ThemeMode = 'system' | 'light' | 'dark';
export type Settings = { lang: Lang; theme: ThemeMode; apiUrl: string };

const DEFAULTS: Settings = { lang: 'en', theme: 'system', apiUrl: DEFAULT_API_URL };
const KEY = 'app_settings_v1';

type Ctx = {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings>) => void;
  /** Translate an English string (the English text is the key). `{name}` placeholders are filled from vars. */
  t: (text: string, vars?: Record<string, string | number>) => string;
};

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await secureGet(KEY);
        const saved = raw ? JSON.parse(raw) : {};
        const merged = { ...DEFAULTS, ...saved };
        // The server address comes ONLY from EXPO_PUBLIC_API_URL (.env). A URL saved by an older app version
        // (login / settings "Server" option) must not override it, or changing .env would have no effect.
        merged.apiUrl = DEFAULTS.apiUrl;
        setApiBaseUrl(merged.apiUrl);
        setSettings(merged);
      } catch {
        setApiBaseUrl(DEFAULTS.apiUrl);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (patch.apiUrl !== undefined) setApiBaseUrl(next.apiUrl);
      secureSet(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const t = useCallback(
    (text: string, vars?: Record<string, string | number>) => {
      let out = settings.lang === 'mr' ? mr[text] ?? text : text;
      if (vars) for (const k of Object.keys(vars)) out = out.split(`{${k}}`).join(String(vars[k]));
      return out;
    },
    [settings.lang]
  );

  const value = useMemo(() => ({ settings, ready, update, t }), [settings, ready, update, t]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}

export const useT = () => useSettings().t;
