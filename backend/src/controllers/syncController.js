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

/**
 * GET /api/sync/pull?days=7
 * -> { serverTime, today, timezone, window:{from,to}, customers, entries, grants, requests }
 */
const pull = async (req, res) => {
  try {
    const { user } = req;
    const today = todayISO();
    const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || DEFAULT_DAYS, 1), MAX_DAYS);
    const from = addDaysISO(today, -(days - 1));

    const where = {
      ...scopeFilter(req),
      date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${addDaysISO(today, 1)}T00:00:00.000Z`) },
    };

    const [customers, entries, grants, requests] = await Promise.all([
      customersFor(user),
      prisma.entry.findMany({
        where,
        include: entryInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: MAX_ENTRY_ROWS,
      }),
      loadGrants(user),
      user.role === 'COLLECTOR'
        ? prisma.accessRequest.findMany({
            where: { collectorId: user.id, status: 'PENDING' },
            select: { id: true, fromDate: true, toDate: true, reason: true, createdAt: true },
          })
        : [],
    ]);

    return res.json({
      success: true,
      data: {
        serverTime: new Date().toISOString(),
        today,
        timezone: APP_TIMEZONE,
        window: { from, to: addDaysISO(today, 1) },
        customers,
        entries: entries.map((e) => present(user, e, grants)),
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

async function runOp(user, op) {
  const opId = String(op?.opId || '');
  if (!opId) return rejected('', 'INVALID', 'opId is required');

  switch (op.kind) {
    case 'ENTRY_CREATE': {
      const result = await createEntries(user, {
        date: op.date,
        customerId: op.customerId,
        collectorId: op.collectorId,
        items: op.items,
      });
      if (result.error) return rejected(opId, codeFor(...result.error), result.error[1]);
      const grants = await loadGrants(user);
      return ok(opId, { entries: result.entries.map((e) => present(user, e, grants)) });
    }

    case 'ENTRY_UPDATE': {
      const id = await resolveEntryId(op);
      if (!id) return rejected(opId, 'NOT_FOUND', 'Entry not found');
      const { amount, type, notes, date } = op.changes || {};
      const result = await applyUpdate(user, id, { amount, type, notes, date });
      if (result.error) return rejected(opId, codeFor(...result.error), result.error[1]);
      return ok(opId, { entry: present(user, result.entry, await loadGrants(user)) });
    }

    case 'ENTRY_DELETE': {
      const id = await resolveEntryId(op);
      // Already gone (deleted from the web, or by an earlier replay): that is the goal state
      if (!id) return duplicate(opId);
      const result = await applyDelete(user, id);
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

    const results = [];
    for (const op of ops) {
      try {
        results.push(await runOp(req.user, op));
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
