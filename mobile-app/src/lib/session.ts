import type { User } from '@/api/endpoints';
import { secureDelete, secureGet, secureSet } from './secure';

export type Session = { token: string; user: User; issuedAt: number };
const KEY = 'session_v1';

export async function loadSession(): Promise<Session | null> {
  const raw = await secureGet(KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s?.token && s?.user?.id ? (s as Session) : null;
  } catch {
    return null;
  }
}
export const saveSession = (s: Session) => secureSet(KEY, JSON.stringify(s));
export const clearSession = () => secureDelete(KEY);
