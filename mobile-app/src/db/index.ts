import * as SQLite from 'expo-sqlite';

/**
 * One SQLite file PER USER (collect_<userId>.db). If someone else logs in on the same phone,
 * they never see - or overwrite - another user's unsynced data, and logging out never loses it.
 */
let db: SQLite.SQLiteDatabase | null = null;
let currentUserId: string | null = null;

/**
 * To change the local database in a later app version (even one shipped over the air): NEVER edit an
 * existing entry below. Append a NEW array with the extra statements (ALTER TABLE ..., CREATE TABLE ...).
 * The schema version is the number of entries, so every phone upgrades from wherever it is, once, inside
 * a transaction, without losing unsynced data.
 */
const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT)`,
    `CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY NOT NULL,
      accountNo TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      defaultSavings REAL,
      defaultLoan REAL,
      defaultInterest REAL,
      defaultDailyAmount REAL,
      ownerId TEXT,
      collectorIds TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY NOT NULL,
      serverId TEXT,
      clientId TEXT,
      date TEXT NOT NULL,
      customerId TEXT NOT NULL,
      customerName TEXT,
      accountNo TEXT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      collectorId TEXT,
      collectorName TEXT,
      syncState TEXT NOT NULL DEFAULT 'synced',
      deleted INTEGER NOT NULL DEFAULT 0,
      stale INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date)`,
    `CREATE INDEX IF NOT EXISTS idx_entries_server ON entries(serverId)`,
    `CREATE INDEX IF NOT EXISTS idx_entries_client ON entries(clientId)`,
    `CREATE TABLE IF NOT EXISTS outbox (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      opId TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      code TEXT,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      label TEXT,
      createdAt INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS grants (fromDate TEXT NOT NULL, toDate TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS api_cache (key TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, savedAt INTEGER NOT NULL)`,
  ],
];

const SCHEMA_VERSION = MIGRATIONS.length;

async function migrate(d: SQLite.SQLiteDatabase) {
  await d.execAsync('PRAGMA journal_mode = WAL;');
  const row = await d.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let v = row?.user_version ?? 0;
  // A database written by a NEWER app version (the user went back to an older build): leave it untouched.
  while (v < SCHEMA_VERSION) {
    const stmts = MIGRATIONS[v];
    await d.withTransactionAsync(async () => {
      for (const s of stmts) await d.execAsync(s);
    });
    v += 1;
    await d.execAsync(`PRAGMA user_version = ${v}`);
  }
}

const safeName = (id: string) => `collect_${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.db`;

export async function openUserDb(userId: string): Promise<void> {
  if (db && currentUserId === userId) return;
  await closeDb();
  const d = await SQLite.openDatabaseAsync(safeName(userId));
  await migrate(d);
  db = d;
  currentUserId = userId;
}

export async function closeDb(): Promise<void> {
  const d = db;
  db = null;
  currentUserId = null;
  if (d) {
    try {
      await d.closeAsync();
    } catch {
      /* ignore */
    }
  }
}

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Database is not open');
  return db;
}
export const isDbOpen = () => db !== null;
export const dbUserId = () => currentUserId;

/**
 * All writes go through one queue. expo-sqlite transactions are not exclusive, so without this
 * a write from another part of the app could land inside someone else's transaction.
 */
let chain: Promise<unknown> = Promise.resolve();
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export async function tx<T>(fn: (d: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  return withLock(async () => {
    const d = getDb();
    let out!: T;
    await d.withTransactionAsync(async () => {
      out = await fn(d);
    });
    return out;
  });
}

/* ───────── key/value helpers ───────── */
export async function getMeta<T = any>(key: string, fallback: T | null = null): Promise<T | null> {
  try {
    const r = await getDb().getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
    return r ? (JSON.parse(r.value) as T) : fallback;
  } catch {
    return fallback;
  }
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await withLock(() => getDb().runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, JSON.stringify(value)));
}

/** Last successful response of a GET screen, for when the phone is offline. */
export async function cacheRead<T = any>(key: string): Promise<{ data: T; savedAt: number } | null> {
  try {
    const r = await getDb().getFirstAsync<{ json: string; savedAt: number }>('SELECT json, savedAt FROM api_cache WHERE key = ?', key);
    return r ? { data: JSON.parse(r.json) as T, savedAt: r.savedAt } : null;
  } catch {
    return null;
  }
}
export async function cacheWrite(key: string, data: unknown): Promise<void> {
  try {
    await withLock(() =>
      getDb().runAsync('INSERT OR REPLACE INTO api_cache (key, json, savedAt) VALUES (?, ?, ?)', key, JSON.stringify(data), Date.now())
    );
  } catch {
    /* a cache write must never break a screen */
  }
}
