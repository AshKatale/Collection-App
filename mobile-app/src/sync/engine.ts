import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';
import { pullApi, pushApi, refreshApi } from '@/api/endpoints';
import { getAuthToken, setAuthToken, setReachabilityHandler } from '@/api/client';
import { isDbOpen, setMeta, getMeta } from '@/db';
import { applyPull, applyResults, outboxCounts, parsePayload, releaseBatch, resetSending, takeBatch } from '@/db/repo';
import { FULL_PULL_EVERY_MS, PULL_DAYS, PULL_MIN_INTERVAL_MS, PUSH_CHUNK, TOKEN_REFRESH_AFTER_MS } from '@/lib/config';
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
  if (state.online) void syncNow({ quiet: true, light: true });
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

type SyncOpts = { quiet?: boolean; /** triggered by a local save: skip the download if we pulled moments ago */ light?: boolean };
type PullState = { serverTime: string; sig: string; days: number; fullAt: number };
let lastPullAt = 0;

export function syncNow(opts: SyncOpts = {}): Promise<SyncOutcome> {
  if (running) return running;
  running = doSync(opts).finally(() => {
    running = null;
  });
  return running;
}

async function doSync(opts: SyncOpts): Promise<SyncOutcome> {
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

    // 2) pull the latest customers / entries / permissions.
    //    After a plain save (opts.light) we skip it if we pulled very recently: the save is already on the phone.
    const skipPull = !!opts.light && Date.now() - lastPullAt < PULL_MIN_INTERVAL_MS;
    if (!skipPull) {
      // Incremental: ask only for what changed since the last pull. A full pull is made when there is no
      // previous pull, the settings changed, or the last full pull is older than FULL_PULL_EVERY_MS.
      const prev = await getMeta<PullState>('pullState');
      const usable = prev && prev.days === PULL_DAYS && Date.now() - prev.fullAt < FULL_PULL_EVERY_MS ? prev : null;
      const data = await pullApi(PULL_DAYS, usable?.serverTime, usable?.sig);
      setAppTimezone(data.timezone);
      await applyPull(data);
      await setMeta('timezone', data.timezone);
      await setMeta('lastPull', { at: Date.now(), today: data.today });
      await setMeta('requests', data.requests);
      // Only remember the position when the server understood incremental pulls (it returns a signature)
      if (data.sig) {
        const fullAt = data.full === false && usable ? usable.fullAt : Date.now();
        await setMeta('pullState', { serverTime: data.serverTime, sig: data.sig, days: PULL_DAYS, fullAt } satisfies PullState);
      }
      lastPullAt = Date.now();
    }

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
      lastError: expired
        ? 'Session expired. Log in again to sync.'
        : err?.response?.status === 404 && String(err?.config?.url || '').includes('/sync/')
          ? 'This server does not have the offline-sync API yet. Update and restart the backend.'
          : offline
            ? null
            : errorMessage(err),
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
  // Android's "internet reachable" probe is unreliable (tunnels, captive Wi-Fi...), so only a missing
  // connection counts as offline here; the real answer comes from our own requests (below).
  set({ online: net ? net.isConnected !== false : true });

  const goOnline = (online: boolean) => {
    const wasOffline = !state.online;
    if (online !== state.online) set({ online });
    if (online && wasOffline && !state.syncing) void syncNow({ quiet: true });
  };
  setReachabilityHandler(goOnline);
  unsubs.push(() => setReachabilityHandler(null));
  unsubs.push(
    NetInfo.addEventListener((s) => {
      if (s.isConnected === false) set({ online: false });
      else goOnline(true);
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
  lastPullAt = 0; // the next user's first sync must download
  set({ pending: 0, failed: 0, lastSyncAt: null, lastError: null, sessionExpired: false, syncing: false });
}
