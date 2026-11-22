import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb, tx, withLock } from './index';
import type { EntryType, PullData, ServerCustomer, ServerEntry, SyncOp, SyncResult, User } from '@/api/endpoints';
import { uuid } from '@/lib/id';
import { byAccount } from '@/lib/format';

export type LocalCustomer = {
  id: string;
  accountNo: string;
  name: string;
  phone: string | null;
  address: string | null;
  defaultSavings: number | null;
  defaultLoan: number | null;
  defaultInterest: number | null;
  defaultDailyAmount: number | null;
  ownerId: string | null;
  collectorIds: string | null;
};

export type SyncState = 'synced' | 'pending' | 'failed';

export type LocalEntry = {
  id: string;
  serverId: string | null;
  clientId: string | null;
  date: string;
  customerId: string;
  customerName: string | null;
  accountNo: string | null;
  type: EntryType;
  amount: number;
  notes: string | null;
  collectorId: string | null;
  collectorName: string | null;
  syncState: SyncState;
  deleted: number;
  createdAt: number;
};

export type OutboxRow = {
  seq: number;
  opId: string;
  kind: SyncOp['kind'];
  payload: string;
  status: 'pending' | 'sending' | 'failed';
  code: string | null;
  error: string | null;
  attempts: number;
  label: string | null;
  createdAt: number;
};

export const parsePayload = (r: OutboxRow): SyncOp => JSON.parse(r.payload);

/* ───────────────────────── customers ───────────────────────── */

export async function listCustomers(): Promise<LocalCustomer[]> {
  const rows = await getDb().getAllAsync<LocalCustomer>('SELECT * FROM customers');
  return rows.sort(byAccount);
}

export async function getCustomer(id: string): Promise<LocalCustomer | null> {
  return getDb().getFirstAsync<LocalCustomer>('SELECT * FROM customers WHERE id = ?', id);
}

async function replaceCustomers(d: SQLiteDatabase, list: ServerCustomer[]) {
  await d.runAsync('DELETE FROM customers');
  for (const c of list) {
    await d.runAsync(
      `INSERT OR REPLACE INTO customers
       (id, accountNo, name, phone, address, defaultSavings, defaultLoan, defaultInterest, defaultDailyAmount, ownerId, collectorIds)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      c.id,
      String(c.accountNo),
      c.name,
      c.phone ?? null,
      c.address ?? null,
      c.defaultSavings ?? null,
      c.defaultLoan ?? null,
      c.defaultInterest ?? null,
      c.defaultDailyAmount ?? null,
      c.ownerId ?? null,
      JSON.stringify((c.assignments || []).map((a) => a.collectorId))
    );
  }
}

/* ───────────────────────── entries ───────────────────────── */

export async function entriesForDate(date: string): Promise<LocalEntry[]> {
  return getDb().getAllAsync<LocalEntry>(
    'SELECT * FROM entries WHERE date = ? AND deleted = 0 ORDER BY createdAt ASC',
    date
  );
}

export async function recentEntries(limit = 100): Promise<LocalEntry[]> {
  return getDb().getAllAsync<LocalEntry>(
    'SELECT * FROM entries WHERE deleted = 0 ORDER BY date DESC, createdAt DESC LIMIT ?',
    limit
  );
}

const fromServer = (e: ServerEntry) => ({
  serverId: e.id,
  clientId: e.clientId ?? null,
  date: String(e.date).slice(0, 10),
  customerId: e.customerId,
  customerName: e.customer?.name ?? null,
  accountNo: e.customer?.accountNo ?? null,
  type: e.type,
  amount: Number(e.amount),
  notes: e.notes ?? null,
  collectorId: e.collectorId ?? null,
  collectorName: e.collector?.name ?? null,
});

/* ───────────────────────── outbox ───────────────────────── */

export async function outboxRows(): Promise<OutboxRow[]> {
  return getDb().getAllAsync<OutboxRow>('SELECT * FROM outbox ORDER BY seq ASC');
}

export async function outboxCounts(): Promise<{ pending: number; failed: number }> {
  const r = await getDb().getAllAsync<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM outbox GROUP BY status');
  let pending = 0;
  let failed = 0;
  for (const x of r) {
    if (x.status === 'failed') failed += x.n;
    else pending += x.n;
  }
  return { pending, failed };
}

async function insertOp(d: SQLiteDatabase, op: SyncOp, label: string) {
  await d.runAsync(
    `INSERT INTO outbox (opId, kind, payload, status, label, createdAt) VALUES (?,?,?,'pending',?,?)`,
    op.opId,
    op.kind,
    JSON.stringify(op),
    label,
    Date.now()
  );
}

/**
 * Find the create-op that contains this entry's item AND is certain not to exist on the server:
 *  - never attempted (attempts = 0), or
 *  - rejected by the server ('failed').
 * A 'pending' op that was attempted before (timeout / lost reply) MAY already have been applied by the server,
 * so it must not be rewritten or forgotten; edits and deletes are then sent as normal operations instead.
 */
async function createOpFor(d: SQLiteDatabase, clientId: string): Promise<OutboxRow | null> {
  const rows = await d.getAllAsync<OutboxRow>(
    `SELECT * FROM outbox WHERE kind = 'ENTRY_CREATE' AND (status = 'failed' OR (status = 'pending' AND attempts = 0)) AND payload LIKE ?`,
    `%"clientId":"${clientId}"%`
  );
  return rows[0] ?? null;
}

/* ───────────────────────── local writes ───────────────────────── */

export type CollectionInput = {
  date: string;
  customer: Pick<LocalCustomer, 'id' | 'name' | 'accountNo'>;
  amounts: Partial<Record<EntryType, number>>;
  user: Pick<User, 'id' | 'name'>;
};

/** Save one customer's collection for a day: local rows + ONE outbox operation, atomically. */
export async function saveCollection(input: CollectionInput): Promise<{ total: number; count: number }> {
  const items = (['SAVINGS', 'LOAN', 'INTEREST'] as EntryType[])
    .filter((t) => Number(input.amounts[t]) > 0)
    .map((t) => ({ type: t, amount: Math.round(Number(input.amounts[t]) * 100) / 100, clientId: uuid() }));
  if (!items.length) return { total: 0, count: 0 };

  await tx(async (d) => {
    const now = Date.now();
    for (const it of items) {
      await d.runAsync(
        `INSERT INTO entries (id, serverId, clientId, date, customerId, customerName, accountNo, type, amount, notes,
           collectorId, collectorName, syncState, deleted, createdAt)
         VALUES (?,NULL,?,?,?,?,?,?,?,NULL,?,?,'pending',0,?)`,
        it.clientId,
        it.clientId,
        input.date,
        input.customer.id,
        input.customer.name,
        input.customer.accountNo,
        it.type,
        it.amount,
        input.user.id,
        input.user.name,
        now
      );
    }
    await insertOp(
      d,
      { opId: uuid(), kind: 'ENTRY_CREATE', date: input.date, customerId: input.customer.id, items },
      `${input.customer.accountNo} · ${input.customer.name}`
    );
  });
  return { total: items.reduce((s, i) => s + i.amount, 0), count: items.length };
}

/** Change the amount of an entry. Works offline; synced on the next sync. */
export async function editAmount(entry: LocalEntry, amount: number): Promise<void> {
  const value = Math.round(amount * 100) / 100;
  await tx(async (d) => {
    const row = await d.getFirstAsync<LocalEntry>('SELECT * FROM entries WHERE id = ?', entry.id);
    if (!row || row.deleted) return;
    await d.runAsync(`UPDATE entries SET amount = ?, syncState = 'pending' WHERE id = ?`, value, row.id);

    // Not on the server yet and its create is still waiting: just rewrite the create
    if (!row.serverId && row.clientId) {
      const op = await createOpFor(d, row.clientId);
      if (op) {
        const p = parsePayload(op) as Extract<SyncOp, { kind: 'ENTRY_CREATE' }>;
        p.items = p.items.map((i) => (i.clientId === row.clientId ? { ...i, amount: value } : i));
        await d.runAsync('UPDATE outbox SET payload = ? WHERE seq = ?', JSON.stringify(p), op.seq);
        return;
      }
    }

    // Otherwise merge into a waiting update for the same entry, or add one
    const ref = row.serverId ? { entryId: row.serverId } : { clientId: row.clientId as string };
    const existing = await d.getAllAsync<OutboxRow>(
      `SELECT * FROM outbox WHERE kind = 'ENTRY_UPDATE' AND status IN ('pending','failed') AND payload LIKE ?`,
      row.serverId ? `%"entryId":"${row.serverId}"%` : `%"clientId":"${row.clientId}"%`
    );
    if (existing[0]) {
      const p = parsePayload(existing[0]) as Extract<SyncOp, { kind: 'ENTRY_UPDATE' }>;
      p.changes = { ...p.changes, amount: value };
      await d.runAsync(`UPDATE outbox SET payload = ?, status = 'pending', error = NULL, code = NULL WHERE seq = ?`, JSON.stringify(p), existing[0].seq);
    } else {
      await insertOp(d, { opId: uuid(), kind: 'ENTRY_UPDATE', ...ref, changes: { amount: value } } as SyncOp, `${row.accountNo} · ${row.customerName}`);
    }
  });
}

/** Delete an entry. Works offline; synced on the next sync. */
export async function removeEntry(entry: LocalEntry): Promise<void> {
  await tx(async (d) => {
    const row = await d.getFirstAsync<LocalEntry>('SELECT * FROM entries WHERE id = ?', entry.id);
    if (!row) return;

    if (!row.serverId && row.clientId) {
      const op = await createOpFor(d, row.clientId);
      if (op) {
        // never sent: simply forget it
        const p = parsePayload(op) as Extract<SyncOp, { kind: 'ENTRY_CREATE' }>;
        p.items = p.items.filter((i) => i.clientId !== row.clientId);
        if (p.items.length === 0) await d.runAsync('DELETE FROM outbox WHERE seq = ?', op.seq);
        else await d.runAsync('UPDATE outbox SET payload = ? WHERE seq = ?', JSON.stringify(p), op.seq);
        await d.runAsync('DELETE FROM entries WHERE id = ?', row.id);
        return;
      }
    }

    // Drop waiting edits of this entry, then queue the delete
    const like = row.serverId ? `%"entryId":"${row.serverId}"%` : `%"clientId":"${row.clientId}"%`;
    await d.runAsync(`DELETE FROM outbox WHERE kind = 'ENTRY_UPDATE' AND status IN ('pending','failed') AND payload LIKE ?`, like);
    await d.runAsync(`UPDATE entries SET deleted = 1, syncState = 'pending' WHERE id = ?`, row.id);
    const ref = row.serverId ? { entryId: row.serverId } : { clientId: row.clientId as string };
    await insertOp(d, { opId: uuid(), kind: 'ENTRY_DELETE', ...ref } as SyncOp, `${row.accountNo} · ${row.customerName}`);
  });
}

/* ───────────────────────── sync: sending ───────────────────────── */

/** On app start: anything left in 'sending' (app was killed mid-sync) goes back to 'pending'. */
export async function resetSending(): Promise<void> {
  await withLock(() => getDb().runAsync(`UPDATE outbox SET status = 'pending' WHERE status = 'sending'`));
}

export async function takeBatch(limit: number): Promise<OutboxRow[]> {
  return tx(async (d) => {
    const rows = await d.getAllAsync<OutboxRow>(`SELECT * FROM outbox WHERE status = 'pending' ORDER BY seq ASC LIMIT ?`, limit);
    for (const r of rows) await d.runAsync(`UPDATE outbox SET status = 'sending', attempts = attempts + 1 WHERE seq = ?`, r.seq);
    return rows;
  });
}

export async function releaseBatch(rows: OutboxRow[]): Promise<void> {
  await tx(async (d) => {
    for (const r of rows) await d.runAsync(`UPDATE outbox SET status = 'pending' WHERE seq = ? AND status = 'sending'`, r.seq);
  });
}

/** Apply the server's per-operation answers to the local data. */
export async function applyResults(rows: OutboxRow[], results: SyncResult[]): Promise<{ ok: number; failed: number }> {
  const byOp = new Map(results.map((r) => [r.opId, r]));
  let ok = 0;
  let failed = 0;
  await tx(async (d) => {
    for (const row of rows) {
      const res = byOp.get(row.opId);
      const op = parsePayload(row);
      if (!res || res.status === 'RETRY') {
        await d.runAsync(`UPDATE outbox SET status = 'pending', error = ? WHERE seq = ?`, res?.message ?? 'No answer from server', row.seq);
        continue;
      }
      if (res.status === 'OK' || res.status === 'DUPLICATE') {
        ok += 1;
        if (op.kind === 'ENTRY_CREATE') {
          for (const e of res.entries || []) {
            if (!e.clientId) continue;
            await d.runAsync(`UPDATE entries SET serverId = ?, collectorName = COALESCE(?, collectorName) WHERE clientId = ?`, e.id, e.collector?.name ?? null, e.clientId);
          }
        } else if (op.kind === 'ENTRY_DELETE') {
          if (op.entryId) await d.runAsync('DELETE FROM entries WHERE serverId = ? AND deleted = 1', op.entryId);
          if (op.clientId) await d.runAsync('DELETE FROM entries WHERE clientId = ? AND deleted = 1', op.clientId);
        } else if (op.kind === 'ENTRY_UPDATE' && res.entry) {
          await d.runAsync(`UPDATE entries SET serverId = COALESCE(serverId, ?) WHERE id = (SELECT id FROM entries WHERE serverId = ? OR clientId = ? LIMIT 1)`, res.entry.id, res.entry.id, res.entry.clientId ?? '');
        }
        await d.runAsync('DELETE FROM outbox WHERE seq = ?', row.seq);
      } else {
        failed += 1;
        await d.runAsync(`UPDATE outbox SET status = 'failed', code = ?, error = ? WHERE seq = ?`, res.code ?? 'REJECTED', res.message ?? 'Rejected by server', row.seq);
      }
    }
    await recomputeStates(d);
  });
  return { ok, failed };
}

/** syncState of every entry is derived from what is still waiting in the outbox. */
async function recomputeStates(d: SQLiteDatabase) {
  const ops = await d.getAllAsync<OutboxRow>('SELECT * FROM outbox');
  const pending = new Set<string>();
  const failed = new Set<string>();
  for (const r of ops) {
    const p = parsePayload(r);
    const set = r.status === 'failed' ? failed : pending;
    if (p.kind === 'ENTRY_CREATE') p.items.forEach((i) => set.add(i.clientId));
    else {
      if (p.entryId) set.add(p.entryId);
      if (p.clientId) set.add(p.clientId);
    }
  }
  const rows = await d.getAllAsync<{ id: string; serverId: string | null; clientId: string | null; syncState: SyncState }>(
    'SELECT id, serverId, clientId, syncState FROM entries'
  );
  for (const e of rows) {
    const keys = [e.serverId, e.clientId].filter(Boolean) as string[];
    const next: SyncState = keys.some((k) => failed.has(k)) ? 'failed' : keys.some((k) => pending.has(k)) ? 'pending' : 'synced';
    if (next !== e.syncState) await d.runAsync('UPDATE entries SET syncState = ? WHERE id = ?', next, e.id);
  }
}

export async function retryFailed(seq?: number): Promise<void> {
  await tx(async (d) => {
    if (seq) await d.runAsync(`UPDATE outbox SET status = 'pending', error = NULL, code = NULL WHERE seq = ? AND status = 'failed'`, seq);
    else await d.runAsync(`UPDATE outbox SET status = 'pending', error = NULL, code = NULL WHERE status = 'failed'`);
    await recomputeStates(d);
  });
}

/** Give up on a failed operation and undo its local effect (the next pull restores server truth). */
export async function discardOp(seq: number): Promise<void> {
  await tx(async (d) => {
    const row = await d.getFirstAsync<OutboxRow>('SELECT * FROM outbox WHERE seq = ?', seq);
    if (!row) return;
    const p = parsePayload(row);
    if (p.kind === 'ENTRY_CREATE') {
      for (const i of p.items) await d.runAsync('DELETE FROM entries WHERE clientId = ? AND serverId IS NULL', i.clientId);
    } else if (p.kind === 'ENTRY_DELETE') {
      await d.runAsync(`UPDATE entries SET deleted = 0 WHERE (serverId = ? AND ? IS NOT NULL) OR (clientId = ? AND ? IS NOT NULL)`, p.entryId ?? null, p.entryId ?? null, p.clientId ?? null, p.clientId ?? null);
    }
    // for UPDATE ops the amount shown is simply replaced by the server value on the next pull
    await d.runAsync('DELETE FROM outbox WHERE seq = ?', seq);
    await recomputeStates(d);
  });
}

/* ───────────────────────── sync: pulling ───────────────────────── */

export async function applyPull(data: PullData): Promise<void> {
  await tx(async (d) => {
    await replaceCustomers(d, data.customers);

    await d.runAsync('DELETE FROM grants');
    for (const g of data.grants) await d.runAsync('INSERT INTO grants (fromDate, toDate) VALUES (?,?)', g.from, g.to);

    // FULL pull: entries confirmed by the server inside the pulled window are replaced; local pending work is kept.
    // INCREMENTAL pull (full === false): the server only sent what changed, so nothing may be treated as missing.
    const full = data.full !== false;
    if (full) await d.runAsync(`UPDATE entries SET stale = 1 WHERE syncState = 'synced' AND date >= ?`, data.window.from);
    for (const e of data.entries) {
      const v = fromServer(e);
      const existing = await d.getFirstAsync<LocalEntry>(
        `SELECT * FROM entries WHERE serverId = ? OR (clientId IS NOT NULL AND clientId = ?) LIMIT 1`,
        v.serverId,
        v.clientId ?? ''
      );
      if (existing) {
        if (existing.syncState !== 'synced' || existing.deleted) continue; // local change wins until it is sent
        await d.runAsync(
          `UPDATE entries SET serverId=?, clientId=?, date=?, customerId=?, customerName=?, accountNo=?, type=?, amount=?, notes=?,
             collectorId=?, collectorName=?, stale=0 WHERE id=?`,
          v.serverId, v.clientId, v.date, v.customerId, v.customerName, v.accountNo, v.type, v.amount, v.notes, v.collectorId, v.collectorName, existing.id
        );
      } else {
        await d.runAsync(
          `INSERT INTO entries (id, serverId, clientId, date, customerId, customerName, accountNo, type, amount, notes,
             collectorId, collectorName, syncState, deleted, stale, createdAt)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'synced',0,0,?)`,
          v.clientId || v.serverId, v.serverId, v.clientId, v.date, v.customerId, v.customerName, v.accountNo, v.type, v.amount, v.notes, v.collectorId, v.collectorName, Date.now()
        );
      }
    }
    // Entries deleted on the server since the last pull (incremental mode). Local unsent work on them is kept.
    for (const id of data.deletedIds ?? []) {
      await d.runAsync(`DELETE FROM entries WHERE serverId = ? AND syncState = 'synced' AND deleted = 0`, id);
    }
    await d.runAsync(`DELETE FROM entries WHERE stale = 1 AND syncState = 'synced'`);
    await d.runAsync(`UPDATE entries SET stale = 0`);
  });
}

export async function getGrants(): Promise<{ fromDate: string; toDate: string }[]> {
  return getDb().getAllAsync('SELECT fromDate, toDate FROM grants');
}

export async function discardAllUserData(): Promise<void> {
  await tx(async (d) => {
    for (const t of ['customers', 'entries', 'outbox', 'grants', 'api_cache']) await d.runAsync(`DELETE FROM ${t}`);
    await d.runAsync(`DELETE FROM meta WHERE key = 'pullState'`); // next pull must be a full one
  });
}
