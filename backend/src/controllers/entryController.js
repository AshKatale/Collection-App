const prisma = require('../db');
const { scopeFilter } = require('../middleware/roleGuard');
const { loadGrants, isDateWritable } = require('../utils/access');
const {
  todayISO,
  toISODate,
  parseDateOnly,
  parsePositiveAmount,
  num,
  round2,
  serializeEntry,
} = require('../utils/helpers');

const TYPES = ['SAVINGS', 'LOAN', 'INTEREST'];
const TODAY_ONLY_MSG = "Collectors can only add or change today's entries. Ask your owner for permission to work on another date.";

const customerSelect = { id: true, name: true, accountNo: true };
const entryInclude = {
  customer: { select: customerSelect },
  collector: { select: { id: true, name: true } },
};

const fail = (res, status, message) => res.status(status).json({ success: false, message });

/**
 * Can this user still modify this (already loaded, already scoped) entry?
 * Collectors: today, or a date their owner approved (grants = loadGrants(user)).
 */
const canModify = (user, entry, grants) => {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'OWNER') return entry.ownerId === user.id;
  return isDateWritable(user, grants, toISODate(entry.date));
};

const present = (user, entry, grants) => ({ ...serializeEntry(entry), canEdit: canModify(user, entry, grants) });

/** A collector may touch only entries of customers assigned to them. */
const collectorHasCustomer = async (user, customerId) =>
  Boolean(
    await prisma.collectorCustomer.findUnique({
      where: { collectorId_customerId: { collectorId: user.id, customerId } },
    })
  );

const snapshot = (e) => ({
  date: toISODate(e.date),
  customerId: e.customerId,
  collectorId: e.collectorId,
  type: e.type,
  amount: num(e.amount),
  notes: e.notes,
});

/**
 * Shared create logic for single + batch endpoints.
 * Validates scope, then creates every item atomically (all or nothing).
 */
async function createEntries(user, { date, customerId, collectorId, items }) {
  const entryDate = parseDateOnly(date);
  if (!entryDate) return { error: [400, 'date must be YYYY-MM-DD'] };
  if (!customerId) return { error: [400, 'customerId is required'] };
  if (!Array.isArray(items) || items.length === 0 || items.length > 10) {
    return { error: [400, 'items must be a non-empty list'] };
  }

  const cleaned = [];
  for (const item of items) {
    if (!TYPES.includes(item?.type)) return { error: [400, 'type must be SAVINGS, LOAN, or INTEREST'] };
    const amount = parsePositiveAmount(item.amount);
    if (amount === null) return { error: [400, 'amount must be a positive number'] };
    const clientId = typeof item.clientId === 'string' && item.clientId.length <= 64 ? item.clientId : null;
    cleaned.push({
      type: item.type,
      amount,
      notes: item.notes ? String(item.notes).slice(0, 300) : null,
      clientId,
    });
  }

  // Collectors may only record today's collections
  if (user.role === 'COLLECTOR' && !isDateWritable(user, await loadGrants(user), date)) {
    return { error: [403, TODAY_ONLY_MSG] };
  }

  // Idempotency: a retried / replayed request must not create duplicates
  const clientIds = cleaned.map((c) => c.clientId).filter(Boolean);
  let existing = [];
  if (clientIds.length) {
    existing = await prisma.entry.findMany({
      where: { clientId: { in: clientIds } },
      include: entryInclude,
    });
  }
  const seen = new Set(existing.map((e) => e.clientId));
  const fresh = cleaned.filter((c) => !c.clientId || !seen.has(c.clientId));
  if (fresh.length === 0) return { entries: existing };

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || !customer.isActive) return { error: [404, 'Customer not found'] };

  let entryOwnerId;
  let entryCollectorId;

  if (user.role === 'COLLECTOR') {
    const assignment = await prisma.collectorCustomer.findUnique({
      where: { collectorId_customerId: { collectorId: user.id, customerId } },
    });
    if (!assignment || !user.ownerId || customer.ownerId !== user.ownerId) {
      return { error: [403, 'Customer is not assigned to you'] };
    }
    entryOwnerId = user.ownerId;
    entryCollectorId = user.id;
  } else {
    if (user.role === 'OWNER' && customer.ownerId !== user.id) {
      return { error: [403, 'Customer does not belong to you'] };
    }
    entryOwnerId = customer.ownerId;
    entryCollectorId = collectorId || user.id;
    if (collectorId) {
      const collector = await prisma.user.findUnique({
        where: { id: collectorId },
        select: { role: true, ownerId: true, isActive: true },
      });
      if (!collector || collector.role !== 'COLLECTOR' || !collector.isActive || collector.ownerId !== entryOwnerId) {
        return { error: [400, 'Invalid collector for this customer'] };
      }
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const rows = await tx.entry.createManyAndReturn({
      data: fresh.map((c) => ({
        date: entryDate,
        collectorId: entryCollectorId,
        customerId,
        type: c.type,
        amount: c.amount,
        notes: c.notes,
        clientId: c.clientId,
        ownerId: entryOwnerId,
        createdBy: user.id,
      })),
    });
    await tx.auditLog.createMany({
      data: rows.map((r) => ({
        entryId: r.id,
        actorId: user.id,
        actorName: user.name,
        action: 'CREATE',
        after: snapshot(r),
      })),
    });
    return rows;
  });

  const collectorRow = { id: entryCollectorId, name: user.role === 'COLLECTOR' ? user.name : undefined };
  const withRelations = created.map((r) => ({
    ...r,
    customer: { id: customer.id, name: customer.name, accountNo: customer.accountNo },
    collector: collectorRow,
  }));
  return { entries: [...existing, ...withRelations] };
}

/**
 * POST /api/entries
 * Body: { date, customerId, type, amount, notes?, collectorId?, clientId? }
 */
const createEntry = async (req, res) => {
  try {
    const { date, customerId, type, amount, notes, collectorId, clientId } = req.body;
    if (!date || !customerId || !type || amount === undefined) {
      return fail(res, 400, 'date, customerId, type, and amount are required');
    }
    const result = await createEntries(req.user, {
      date,
      customerId,
      collectorId,
      items: [{ type, amount, notes, clientId }],
    });
    if (result.error) return fail(res, ...result.error);
    return res.status(201).json({ success: true, data: present(req.user, result.entries[0], await loadGrants(req.user)) });
  } catch (err) {
    console.error('Create entry error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

/**
 * POST /api/entries/batch
 * One customer, several types, saved atomically (all or nothing).
 * Body: { date, customerId, collectorId?, items: [{ type, amount, notes?, clientId? }] }
 */
const createEntriesBatch = async (req, res) => {
  try {
    const { date, customerId, collectorId, items } = req.body;
    const result = await createEntries(req.user, { date, customerId, collectorId, items });
    if (result.error) return fail(res, ...result.error);
    const grants = await loadGrants(req.user);
    return res.status(201).json({
      success: true,
      data: result.entries.map((e) => present(req.user, e, grants)),
    });
  } catch (err) {
    console.error('Batch entry error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

/**
 * GET /api/entries
 * Query: date | from,to, collectorId, customerId, type, page, limit (<=500)
 * Always scoped by role. Returns an exact `totalAmount` for the whole filter
 * (not just the current page).
 */
const listEntries = async (req, res) => {
  try {
    const { date, from, to, collectorId, customerId, type, page = 1, limit = 50 } = req.query;
    const where = { ...scopeFilter(req) };

    if (date) {
      const d = parseDateOnly(date);
      if (!d) return fail(res, 400, 'date must be YYYY-MM-DD');
      where.date = d;
    } else if (from || to) {
      where.date = {};
      if (from) {
        const f = parseDateOnly(from);
        if (!f) return fail(res, 400, 'from must be YYYY-MM-DD');
        where.date.gte = f;
      }
      if (to) {
        const t = parseDateOnly(to);
        if (!t) return fail(res, 400, 'to must be YYYY-MM-DD');
        where.date.lte = t;
      }
    }
    if (collectorId && req.user.role !== 'COLLECTOR') where.collectorId = collectorId;
    if (customerId) where.customerId = customerId;
    if (type) {
      if (!TYPES.includes(type)) return fail(res, 400, 'Invalid type');
      where.type = type;
    }

    const parsedPage = Number.parseInt(page, 10);
    const parsedLimit = Number.parseInt(limit, 10);
    if (!(parsedPage >= 1) || !(parsedLimit >= 1) || parsedLimit > 500) {
      return fail(res, 400, 'page must be positive and limit must be between 1 and 500');
    }

    const [entries, total, agg] = await Promise.all([
      prisma.entry.findMany({
        where,
        include: entryInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (parsedPage - 1) * parsedLimit,
        take: parsedLimit,
      }),
      prisma.entry.count({ where }),
      prisma.entry.aggregate({ where, _sum: { amount: true } }),
    ]);

    const grants = await loadGrants(req.user);
    return res.json({
      success: true,
      data: entries.map((e) => present(req.user, e, grants)),
      // For a single-day query: may the current user add / change entries on that day?
      ...(date ? { dateWritable: isDateWritable(req.user, grants, date) } : {}),
      total,
      totalAmount: num(agg._sum.amount),
      page: parsedPage,
      limit: parsedLimit,
      today: todayISO(),
    });
  } catch (err) {
    console.error('List entries error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

/**
 * GET /api/entries/summary?date=YYYY-MM-DD   (defaults to today)
 * Totals by type for the day + the 10 latest entries. Computed in SQL.
 */
const entrySummary = async (req, res) => {
  try {
    const date = req.query.date || todayISO();
    const d = parseDateOnly(date);
    if (!d) return fail(res, 400, 'date must be YYYY-MM-DD');
    const where = { ...scopeFilter(req), date: d };
    const grants = await loadGrants(req.user);

    const [groups, recent] = await Promise.all([
      prisma.entry.groupBy({ by: ['type'], where, _sum: { amount: true }, _count: { _all: true } }),
      prisma.entry.findMany({
        where,
        include: entryInclude,
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const totals = { savings: 0, loan: 0, interest: 0, total: 0 };
    let count = 0;
    groups.forEach((g) => {
      const v = num(g._sum.amount);
      totals[g.type.toLowerCase()] = v;
      totals.total += v;
      count += g._count._all;
    });
    totals.total = round2(totals.total);

    return res.json({
      success: true,
      data: { date, count, totals, recent: recent.map((e) => present(req.user, e, grants)) },
    });
  } catch (err) {
    console.error('Entry summary error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

/** GET /api/entries/:id */
const getEntry = async (req, res) => {
  try {
    const entry = await prisma.entry.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: entryInclude,
    });
    if (!entry) return fail(res, 404, 'Entry not found');

    const { user } = req;
    if (user.role === 'OWNER' && entry.ownerId !== user.id) return fail(res, 403, 'Access denied');
    if (user.role === 'COLLECTOR' && !(await collectorHasCustomer(user, entry.customerId))) {
      return fail(res, 403, 'Access denied');
    }

    return res.json({ success: true, data: present(user, entry, await loadGrants(user)) });
  } catch (err) {
    console.error('Get entry error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

/** GET /api/entries/:id/history  (Admin / Owner) */
const entryHistory = async (req, res) => {
  try {
    const entry = await prisma.entry.findUnique({ where: { id: req.params.id }, select: { ownerId: true } });
    if (!entry) return fail(res, 404, 'Entry not found');
    if (req.user.role === 'OWNER' && entry.ownerId !== req.user.id) return fail(res, 403, 'Access denied');

    const logs = await prisma.auditLog.findMany({
      where: { entryId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    return res.json({ success: true, data: logs });
  } catch (err) {
    console.error('Entry history error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

/**
 * PUT /api/entries/:id
 * Admin: anything. Owner: own organisation. Collector: entries of their assigned customers,
 * for TODAY or an owner-approved date, and only amount / type / notes.
 */
const updateEntry = async (req, res) => {
  try {
    const { user } = req;
    const entry = await prisma.entry.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!entry) return fail(res, 404, 'Entry not found');

    if (user.role === 'OWNER' && entry.ownerId !== user.id) return fail(res, 403, 'Access denied');
    if (user.role === 'COLLECTOR') {
      if (!(await collectorHasCustomer(user, entry.customerId))) return fail(res, 403, 'Access denied');
      if (!canModify(user, entry, await loadGrants(user))) return fail(res, 403, TODAY_ONLY_MSG);
    }

    const { date, type, amount, notes, collectorId, customerId } = req.body;
    const data = {};

    if (type !== undefined) {
      if (!TYPES.includes(type)) return fail(res, 400, 'type must be SAVINGS, LOAN, or INTEREST');
      data.type = type;
    }
    if (amount !== undefined) {
      const a = parsePositiveAmount(amount);
      if (a === null) return fail(res, 400, 'amount must be a positive number');
      data.amount = a;
    }
    if (notes !== undefined) data.notes = notes ? String(notes).slice(0, 300) : null;

    if (user.role !== 'COLLECTOR') {
      if (date !== undefined) {
        const d = parseDateOnly(date);
        if (!d) return fail(res, 400, 'date must be YYYY-MM-DD');
        data.date = d;
      }
      if (customerId !== undefined && customerId !== entry.customerId) {
        const c = await prisma.customer.findUnique({ where: { id: customerId } });
        if (!c || (user.role === 'OWNER' && c.ownerId !== user.id)) {
          return fail(res, 403, 'Invalid customer for this account');
        }
        data.customerId = c.id;
        data.ownerId = c.ownerId;
      }
      if (collectorId !== undefined && collectorId !== entry.collectorId) {
        const ownerForCheck = data.ownerId || entry.ownerId;
        const col = await prisma.user.findUnique({
          where: { id: collectorId },
          select: { role: true, ownerId: true, isActive: true },
        });
        if (!col || col.role !== 'COLLECTOR' || !col.isActive || col.ownerId !== ownerForCheck) {
          return fail(res, 400, 'Invalid collector for this customer');
        }
        data.collectorId = collectorId;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.entry.update({ where: { id: entry.id }, data, include: entryInclude });
      await tx.auditLog.create({
        data: {
          entryId: entry.id,
          actorId: user.id,
          actorName: user.name,
          action: 'UPDATE',
          before: snapshot(entry),
          after: snapshot(row),
        },
      });
      return row;
    });

    return res.json({ success: true, data: present(user, updated, await loadGrants(user)) });
  } catch (err) {
    console.error('Update entry error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

/**
 * DELETE /api/entries/:id  (soft delete + audit)
 * Same permissions as update.
 */
const deleteEntry = async (req, res) => {
  try {
    const { user } = req;
    const entry = await prisma.entry.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!entry) return fail(res, 404, 'Entry not found');

    if (user.role === 'OWNER' && entry.ownerId !== user.id) return fail(res, 403, 'Access denied');
    if (user.role === 'COLLECTOR') {
      if (!(await collectorHasCustomer(user, entry.customerId))) return fail(res, 403, 'Access denied');
      if (!canModify(user, entry, await loadGrants(user))) return fail(res, 403, TODAY_ONLY_MSG);
    }

    await prisma.$transaction([
      prisma.entry.update({ where: { id: entry.id }, data: { deletedAt: new Date(), clientId: null } }),
      prisma.auditLog.create({
        data: {
          entryId: entry.id,
          actorId: user.id,
          actorName: user.name,
          action: 'DELETE',
          before: snapshot(entry),
        },
      }),
    ]);
    return res.json({ success: true, data: { message: 'Entry deleted' } });
  } catch (err) {
    console.error('Delete entry error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

module.exports = {
  createEntry,
  createEntriesBatch,
  listEntries,
  entrySummary,
  getEntry,
  entryHistory,
  updateEntry,
  deleteEntry,
};
