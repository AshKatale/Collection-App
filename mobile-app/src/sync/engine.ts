import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';
import { pullApi, pushApi, refreshApi } from '@/api/endpoints';
import { getAuthToken, setAuthToken } from '@/api/client';
import { isDbOpen, setMeta, getMeta } from '@/db';
import { applyPull, applyResults, outboxCounts, parsePayload, releaseBatch, resetSending, takeBatch } from '@/db/repo';
import { PULL_DAYS, PUSH_CHUNK, TOKEN_REFRESH_AFTER_MS } from '@/lib/config';
import { errorMessage, isNetworkError } from '@/lib/format';
import { loadSession, saveSession } from '@/lib/session';
import { setAppTimezone } from '@/lib/today';

export type SyncState = {
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  lastSyncAt: number | null;
  lastError: string | null;
  /** Server said 401: the session needs a fresh login (data stays safe on the device). */
  sessionExpired: boolean;
  /** Bumped whenever local data changes, so screens reload. */
  version: number;
};

let state: SyncState = {
  online: true,
  syncing: false,
  pending: 0,
  failed: 0,
  lastSyncAt: null,
  lastError: null,
  sessionExpired: false,
  version: 0,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useSync = () => useSyncExternalStore(subscribe, () => state, () => state);
export const getSyncState = () => state;

/** Call after any local write: refreshes counters, redraws screens, and syncs if we are online. */
export async function localDataChanged(): Promise<void> {
  await refreshCounts();
  set({ version: state.version + 1 });
  if (state.online) void syncNow({ quiet: true });
}

export async function refreshCounts(): Promise<void> {
  if (!isDbOpen()) return set({ pending: 0, failed: 0 });
  try {
    const c = await outboxCounts();
    set({ pending: c.pending, failed: c.failed });
  } catch {
    /* DB closing */
  }
}

export const markSessionExpired = () => set({ sessionExpired: true });
export const clearSessionExpired = () => set({ sessionExpired: false, lastError: null });

/* ───────────────────────── the sync itself ───────────────────────── */

let running: Promise<SyncOutcome> | null = null;
export type SyncOutcome = { ok: boolean; pushed: number; failed: number; offline: boolean; message?: string };

async function maybeRefreshToken() {
  const session = await loadSession();
  if (!session) return;
  if (Date.now() - session.issuedAt < TOKEN_REFRESH_AFTER_MS) return;
  try {
    const res = await refreshApi();
    if (res?.token) {
      setAuthToken(res.token);
      await saveSession({ token: res.token, user: res.user ?? session.user, issuedAt: Date.now() });
    }
  } catch (err: any) {
    // network trouble: keep using the current token; 401 is handled by the caller's request
    if (err?.response?.status === 401) throw err;
  }
}

export function syncNow(opts: { quiet?: boolean } = {}): Promise<SyncOutcome> {
  if (running) return running;
  running = doSync(opts).finally(() => {
    running = null;
  });
  return running;
}

async function doSync(_opts: { quiet?: boolean }): Promise<SyncOutcome> {
  if (!isDbOpen() || !getAuthToken()) return { ok: false, pushed: 0, failed: 0, offline: false, message: 'Not signed in' };
  set({ syncing: true, lastError: null });
  let pushed = 0;
  let failed = 0;
  try {
    await maybeRefreshToken();

    // 1) push everything waiting, in order
    const attempted = new Set<string>();
    for (;;) {
      const rows = await takeBatch(PUSH_CHUNK);
      if (!rows.length) break;
      if (rows.every((r) => attempted.has(r.opId))) {
        await releaseBatch(rows);
        break;
      }
      rows.forEach((r) => attempted.add(r.opId));
      try {
        const res = await pushApi(rows.map(parsePayload));
        const out = await applyResults(rows, res.results);
        pushed += out.ok;
        failed += out.failed;
      } catch (err) {
        await releaseBatch(rows);
        throw err;
      }
      await refreshCounts();
    }

    // 2) pull the latest customers / entries / permissions
    const data = await pullApi(PULL_DAYS);
    setAppTimezone(data.timezone);
    await applyPull(data);
    await setMeta('timezone', data.timezone);
    await setMeta('lastPull', { at: Date.now(), today: data.today });
    await setMeta('requests', data.requests);

    const lastSyncAt = Date.now();
    await setMeta('lastSyncAt', lastSyncAt);
    await refreshCounts();
    set({ syncing: false, lastSyncAt, lastError: null, sessionExpired: false, version: state.version + 1 });
    return { ok: true, pushed, failed, offline: false };
  } catch (err: any) {
    const offline = isNetworkError(err);
    const expired = err?.response?.status === 401;
    await refreshCounts();
    set({
      syncing: false,
      online: offline ? false : state.online,
      sessionExpired: expired ? true : state.sessionExpired,
      lastError: expired ? 'Session expired. Log in again to sync.' : offline ? null : errorMessage(err),
      version: state.version + 1,
    });
    return { ok: false, pushed, failed, offline, message: expired ? 'Session expired' : errorMessage(err) };
  }
}

/* ───────────────────────── automatic triggers ───────────────────────── */

let started = false;
let unsubs: (() => void)[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

/** Start once a user is signed in and their DB is open. */
export async function startSync(): Promise<void> {
  if (started) return;
  started = true;
  await resetSending();
  const last = await getMeta<number>('lastSyncAt');
  const tz = await getMeta<string>('timezone');
  setAppTimezone(tz);
  set({ lastSyncAt: last ?? null });
  await refreshCounts();

  const net = await NetInfo.fetch().catch(() => null);
  set({ online: net ? !!net.isConnected && net.isInternetReachable !== false : true });

  unsubs.push(
    NetInfo.addEventListener((s) => {
      const online = !!s.isConnected && s.isInternetReachable !== false;
      const wasOffline = !state.online;
      set({ online });
      if (online && wasOffline) void syncNow({ quiet: true });
    })
  );
  const appSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') void syncNow({ quiet: true });
  });
  unsubs.push(() => appSub.remove());

  // Safety net: retry now and then while something is waiting (flaky connections)
  timer = setInterval(() => {
    if (state.online && !state.syncing && (state.pending > 0 || Date.now() - (state.lastSyncAt ?? 0) > 10 * 60 * 1000)) {
      void syncNow({ quiet: true });
    }
  }, 60 * 1000);

  void syncNow({ quiet: true });
}

export function stopSync(): void {
  started = false;
  unsubs.forEach((u) => u());
  unsubs = [];
  if (timer) clearInterval(timer);
  timer = null;
  set({ pending: 0, failed: 0, lastSyncAt: null, lastError: null, sessionExpired: false, syncing: false });
}
