/**
 * Mobile-app sync API (offline-first clients). Used ONLY by the mobile app;
 * the web app never calls these routes.
 *
 *   GET  /api/sync/pull   one-shot snapshot: customers, recent entries, access grants
 *   POST /api/sync/push   ordered list of offline operations, per-operation results
 *
 * Every operation is validated by exactly the same rules as the normal entry
 * endpoints (today-only for collectors, assignment checks, audit log, ...).
 * One rejected operation never blocks the others.
 */
const crypto = require('crypto');
const prisma = require('../db');
const { scopeFilter } = require('../middleware/roleGuard');
const { loadGrants } = require('../utils/access');
const { todayISO, toISODate, APP_TIMEZONE } = require('../utils/helpers');
const { createEntries, applyUpdate, applyDelete, present, entryInclude } = require('./entryController');

const MAX_OPS = 100;
const DEFAULT_DAYS = 7;
const MAX_DAYS = 62;
const MAX_ENTRY_ROWS = 10000;

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const addDaysISO = (iso, n) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Customers the user may collect from (same scoping as GET /customers). */
async function customersFor(user) {
  const include = { assignments: { select: { collectorId: true } } };
  if (user.role === 'ADMIN') {
    return prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, include });
  }
  if (user.role === 'OWNER') {
    return prisma.customer.findMany({ where: { ownerId: user.id, isActive: true }, orderBy: { name: 'asc' }, include });
  }
  const rows = await prisma.collectorCustomer.findMany({
    where: { collectorId: user.id, customer: { isActive: true } },
    include: { customer: { include } },
  });
  return rows.map((r) => r.customer);
}

/** Fingerprint of the customer list + who each customer is assigned to. Changes => the phone needs a full pull. */
const customersSignature = (customers) =>
  crypto
    .createHash('sha1')
    .update(
      customers
        .map((c) => `${c.id}:${c.assignments.map((a) => a.collectorId).sort().join(',')}`)
        .sort()
        .join('|')
    )
    .digest('hex');

/** Overlap when reading "changed since": covers clock differences and transactions that committed late. */
const SINCE_OVERLAP_MS = 2 * 60 * 1000;
/** An incremental pull may only continue a pull that is at most this old (the phone also forces a full pull every few hours). */
const SINCE_MAX_AGE_MS = 36 * 60 * 60 * 1000;

/**
 * GET /api/sync/pull?days=7[&since=<serverTime of the previous pull>&sig=<signature of the previous pull>]
 * -> { serverTime, today, timezone, window:{from,to}, full, sig, customers, entries, deletedIds, grants, requests }
 *
 *  - Without since/sig (or when the customer list changed, or `since` is too old): FULL pull. `entries` is the complete
 *    list for the window. If there are more rows than MAX_ENTRY_ROWS, only fully included days are sent and
 *    `window.from` moves forward to the first complete day, so the phone never deletes days it did not receive.
 *  - With a matching since/sig: INCREMENTAL pull. `entries` holds only entries created/changed since then and
 *    `deletedIds` the ones removed (soft-deleted). Customers, grants and requests are always sent (small).
 */
const pull = async (req, res) => {
  try {
    const { user } = req;
    const serverTime = new Date(); // taken BEFORE reading, so nothing written during the read is ever missed next time
    const today = todayISO();
    const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || DEFAULT_DAYS, 1), MAX_DAYS);
    const from = addDaysISO(today, -(days - 1));
    const to = addDaysISO(today, 1);
    const dateRange = { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) };

    const [customers, grants, requests] = await Promise.all([
      customersFor(user),
      loadGrants(user),
      user.role === 'COLLECTOR'
        ? prisma.accessRequest.findMany({
            where: { collectorId: user.id, status: 'PENDING' },
            select: { id: true, fromDate: true, toDate: true, reason: true, createdAt: true },
          })
        : [],
    ]);
    const sig = customersSignature(customers);

    const sinceDate = req.query.since ? new Date(String(req.query.since)) : null;
    const sinceOk =
      sinceDate &&
      !Number.isNaN(sinceDate.getTime()) &&
      sinceDate <= serverTime &&
      serverTime - sinceDate <= SINCE_MAX_AGE_MS &&
      req.query.sig === sig;

    let full = !sinceOk;
    let entries = [];
    let deletedIds = [];
    let windowFrom = from;

    if (sinceOk) {
      const changed = await prisma.entry.findMany({
        where: {
          ...scopeFilter(req),
          deletedAt: undefined, // also return soft-deleted rows, as tombstones
          date: dateRange,
          updatedAt: { gte: new Date(sinceDate.getTime() - SINCE_OVERLAP_MS) },
        },
        include: entryInclude,
        orderBy: [{ updatedAt: 'asc' }],
        take: MAX_ENTRY_ROWS + 1,
      });
      if (changed.length > MAX_ENTRY_ROWS) {
        full = true; // too much changed: just do a full pull
      } else {
        deletedIds = changed.filter((e) => e.deletedAt).map((e) => e.id);
        entries = changed.filter((e) => !e.deletedAt);
      }
    }

    if (full) {
      const rows = await prisma.entry.findMany({
        where: { ...scopeFilter(req), date: dateRange },
        include: entryInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: MAX_ENTRY_ROWS + 1,
      });
      if (rows.length > MAX_ENTRY_ROWS) {
        // Truncated: the oldest day we reached may be incomplete. Send only the complete (newer) days and
        // tell the phone where the complete range starts, so it never deletes days it was not sent.
        const oldest = toISODate(rows[MAX_ENTRY_ROWS - 1].date);
        windowFrom = addDaysISO(oldest, 1);
        entries = rows.slice(0, MAX_ENTRY_ROWS).filter((e) => toISODate(e.date) >= windowFrom);
      } else {
        entries = rows;
      }
    }

    return res.json({
      success: true,
      data: {
        serverTime: serverTime.toISOString(),
        today,
        timezone: APP_TIMEZONE,
        window: { from: windowFrom, to },
        full,
        sig,
        customers,
        entries: entries.map((e) => present(user, e, grants)),
        deletedIds,
        grants,
        requests: requests.map((r) => ({
          id: r.id,
          fromDate: toISODate(r.fromDate),
          toDate: toISODate(r.toDate),
          reason: r.reason,
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (err) {
    console.error('Sync pull error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

/* ───────────────────────── push ───────────────────────── */

const ok = (opId, extra = {}) => ({ opId, status: 'OK', ...extra });
const duplicate = (opId, extra = {}) => ({ opId, status: 'DUPLICATE', ...extra });
const rejected = (opId, code, message) => ({ opId, status: 'REJECTED', code, message });

/** Map an HTTP-style [status, message] error to a stable, machine-readable code. */
const codeFor = (status, message = '') => {
  if (status === 404) return 'NOT_FOUND';
  if (status === 403 && /today/i.test(message)) return 'DATE_LOCKED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 400) return 'INVALID';
  return 'REJECTED';
};

/** An entry created earlier (maybe in this very push) can be addressed by its clientId. */
async function resolveEntryId(op) {
  if (op.entryId) return op.entryId;
  if (!op.clientId) return null;
  const e = await prisma.entry.findFirst({ where: { clientId: String(op.clientId) }, select: { id: true } });
  return e ? e.id : null;
}

/** `grants` = the collector's approved date grants, loaded ONCE per push (not once per operation). */
async function runOp(user, op, grants) {
  const opId = String(op?.opId || '');
  if (!opId) return rejected('', 'INVALID', 'opId is required');

  switch (op.kind) {
    case 'ENTRY_CREATE': {
      const result = await createEntries(user, {
        date: op.date,
        customerId: op.customerId,
        collectorId: op.collectorId,
        items: op.items,
        grants,
      });
      if (result.error) return rejected(opId, codeFor(...result.error), result.error[1]);
      return ok(opId, { entries: result.entries.map((e) => present(user, e, grants)) });
    }

    case 'ENTRY_UPDATE': {
      const id = await resolveEntryId(op);
      if (!id) return rejected(opId, 'NOT_FOUND', 'Entry not found');
      const { amount, type, notes, date } = op.changes || {};
      const result = await applyUpdate(user, id, { amount, type, notes, date }, grants);
      if (result.error) return rejected(opId, codeFor(...result.error), result.error[1]);
      return ok(opId, { entry: present(user, result.entry, grants) });
    }

    case 'ENTRY_DELETE': {
      const id = await resolveEntryId(op);
      // Already gone (deleted from the web, or by an earlier replay): that is the goal state
      if (!id) return duplicate(opId);
      const result = await applyDelete(user, id, grants);
      if (result.error) {
        if (result.error[0] === 404) return duplicate(opId);
        return rejected(opId, codeFor(...result.error), result.error[1]);
      }
      return ok(opId);
    }

    default:
      return rejected(opId, 'INVALID', `Unknown operation kind: ${op.kind}`);
  }
}

/**
 * POST /api/sync/push
 * Body: { ops: [ { opId, kind, ... } ] }   (processed strictly in order)
 *   ENTRY_CREATE { date, customerId, items:[{type,amount,clientId,notes?}] }
 *   ENTRY_UPDATE { entryId? | clientId?, changes:{amount?,type?,notes?} }
 *   ENTRY_DELETE { entryId? | clientId? }
 * Returns 200 { results:[{opId,status:'OK'|'DUPLICATE'|'REJECTED',code?,message?}] }.
 * Unexpected server errors on one op come back as status 'RETRY' so the device keeps it queued.
 */
const push = async (req, res) => {
  try {
    const ops = req.body?.ops;
    if (!Array.isArray(ops) || ops.length === 0 || ops.length > MAX_OPS) {
      return fail(res, 400, `ops must be a list of 1-${MAX_OPS} operations`);
    }

    const grants = await loadGrants(req.user);
    const results = [];
    for (const op of ops) {
      try {
        results.push(await runOp(req.user, op, grants));
      } catch (err) {
        console.error('Sync op error:', op?.kind, err);
        results.push({ opId: String(op?.opId || ''), status: 'RETRY', message: 'Server error, will retry' });
      }
    }
    return res.json({ success: true, data: { results, serverTime: new Date().toISOString(), today: todayISO() } });
  } catch (err) {
    console.error('Sync push error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

module.exports = { pull, push };
