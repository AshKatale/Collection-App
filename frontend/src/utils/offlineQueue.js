import { createEntriesBatch } from '../api/entries.js';
import { toast } from '../components/common/Toast.jsx';
import { errorMessage } from './helpers.js';

/**
 * Offline queue for collections.
 *
 * When a collector saves with no connection, the request is parked in
 * localStorage and replayed when the network is back. Every item carries a
 * client-generated id, so a replay can never create duplicates (the server
 * treats a repeated clientId as "already saved").
 *
 * Note: the server only lets collectors record TODAY's date. If a queued item
 * is replayed after midnight the server rejects it; the item is dropped with a
 * visible message so the collector can tell the admin.
 */
const KEY = 'collect_queue_v1';
const listeners = new Set();
let flushing = false;

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
};

const write = (items) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full / blocked: queue just won't persist */
  }
  listeners.forEach((fn) => fn(items.length));
};

export const pendingCount = () => read().length;
export const pendingItems = () => read();

export function subscribePending(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when the error means "could not reach the server" (as opposed to a server rejection). */
export const isNetworkError = (err) => !err?.response;

export function enqueue(payload, label) {
  write([...read(), { payload, label, queuedAt: Date.now() }]);
}

/** Try to send everything that is queued. Returns the number of entries synced. */
export async function flushQueue({ silent = false } = {}) {
  if (flushing) return 0;
  flushing = true;
  let synced = 0;
  try {
    let items = read();
    for (const item of [...items]) {
      try {
        const res = await createEntriesBatch(item.payload);
        synced += res.data?.data?.length || item.payload.items.length;
        items = items.filter((i) => i !== item && JSON.stringify(i) !== JSON.stringify(item));
        write(items);
      } catch (err) {
        if (isNetworkError(err)) break; // still offline – try again later
        // The server refused it (e.g. a different day, customer unassigned): drop it, but tell the user
        toast.error(`Could not sync ${item.label}: ${errorMessage(err)}`);
        items = items.filter((i) => JSON.stringify(i) !== JSON.stringify(item));
        write(items);
      }
    }
  } finally {
    flushing = false;
  }
  if (synced && !silent) toast.success(`${synced} offline ${synced === 1 ? 'entry' : 'entries'} synced`);
  return synced;
}

/** Call once at startup: sync on reconnect and when the app is opened. */
export function startQueueSync(onSynced) {
  const run = async () => {
    if (!pendingCount()) return;
    const n = await flushQueue();
    if (n && onSynced) onSynced(n);
  };
  window.addEventListener('online', run);
  run();
  return () => window.removeEventListener('online', run);
}
