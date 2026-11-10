const prisma = require('../db');
const { parseDateOnly, toISODate, todayISO } = require('../utils/helpers');

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const MAX_DAYS = 31;

const shape = (r) => ({
  id: r.id,
  collectorId: r.collectorId,
  collectorName: r.collector?.name,
  fromDate: toISODate(r.fromDate),
  toDate: toISODate(r.toDate),
  reason: r.reason,
  status: r.status,
  decidedByName: r.decidedByName,
  decidedAt: r.decidedAt,
  createdAt: r.createdAt,
});

const include = { collector: { select: { id: true, name: true } } };

function parseRange(body) {
  const from = parseDateOnly(body.fromDate);
  const to = parseDateOnly(body.toDate || body.fromDate);
  if (!from || !to) return { error: 'fromDate and toDate must be YYYY-MM-DD' };
  if (to < from) return { error: 'toDate cannot be before fromDate' };
  if ((to - from) / 86400000 + 1 > MAX_DAYS) return { error: `A request can cover at most ${MAX_DAYS} days` };
  return { from, to };
}

/** GET /api/access?status=PENDING|APPROVED|... (scoped by role) */
const listAccess = async (req, res) => {
  try {
    const { user } = req;
    const where = {};
    if (user.role === 'COLLECTOR') where.collectorId = user.id;
    else if (user.role === 'OWNER') where.ownerId = user.id;
    if (req.query.status) where.status = String(req.query.status);

    const rows = await prisma.accessRequest.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return res.json({ success: true, data: rows.map(shape) });
  } catch (err) {
    console.error('List access error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

/** POST /api/access (collector) { fromDate, toDate?, reason } -> PENDING request to the owner */
const requestAccess = async (req, res) => {
  try {
    const { user } = req;
    if (!user.ownerId) return fail(res, 400, 'You are not linked to an owner');
    const range = parseRange(req.body);
    if (range.error) return fail(res, 400, range.error);
    if (!req.body.reason || !String(req.body.reason).trim()) return fail(res, 400, 'Please give a reason');

    const today = parseDateOnly(todayISO());
    if (range.from.getTime() === today.getTime() && range.to.getTime() === today.getTime()) {
      return fail(res, 400, 'Today does not need permission');
    }

    const dup = await prisma.accessRequest.findFirst({
      where: { collectorId: user.id, status: 'PENDING', fromDate: range.from, toDate: range.to },
    });
    if (dup) return fail(res, 409, 'You already have a pending request for these dates');

    const row = await prisma.accessRequest.create({
      data: {
        collectorId: user.id,
        ownerId: user.ownerId,
        fromDate: range.from,
        toDate: range.to,
        reason: String(req.body.reason).trim().slice(0, 300),
      },
      include,
    });
    return res.status(201).json({ success: true, data: shape(row) });
  } catch (err) {
    console.error('Request access error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

/** POST /api/access/grant (owner/admin) { collectorId, fromDate, toDate?, reason? } -> APPROVED immediately */
const grantAccess = async (req, res) => {
  try {
    const { user } = req;
    const range = parseRange(req.body);
    if (range.error) return fail(res, 400, range.error);

    const collector = await prisma.user.findUnique({
      where: { id: String(req.body.collectorId || '') },
      select: { id: true, role: true, ownerId: true, isActive: true },
    });
    if (!collector || collector.role !== 'COLLECTOR' || !collector.isActive) return fail(res, 400, 'Invalid collector');
    if (user.role === 'OWNER' && collector.ownerId !== user.id) return fail(res, 403, 'Not your collector');

    const row = await prisma.accessRequest.create({
      data: {
        collectorId: collector.id,
        ownerId: collector.ownerId,
        fromDate: range.from,
        toDate: range.to,
        reason: req.body.reason ? String(req.body.reason).slice(0, 300) : 'Granted by owner',
        status: 'APPROVED',
        decidedBy: user.id,
        decidedByName: user.name,
        decidedAt: new Date(),
      },
      include,
    });
    return res.status(201).json({ success: true, data: shape(row) });
  } catch (err) {
    console.error('Grant access error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

/** PUT /api/access/:id { action: 'approve' | 'reject' | 'revoke' } (owner/admin) */
const decide = async (req, res) => {
  try {
    const { user } = req;
    const row = await prisma.accessRequest.findUnique({ where: { id: req.params.id } });
    if (!row) return fail(res, 404, 'Request not found');
    if (user.role === 'OWNER' && row.ownerId !== user.id) return fail(res, 403, 'Access denied');

    const { action } = req.body;
    let status;
    if (action === 'approve' && row.status === 'PENDING') status = 'APPROVED';
    else if (action === 'reject' && row.status === 'PENDING') status = 'REJECTED';
    else if (action === 'revoke' && row.status === 'APPROVED') status = 'REVOKED';
    else return fail(res, 400, `Cannot ${action} a ${row.status.toLowerCase()} request`);

    const updated = await prisma.accessRequest.update({
      where: { id: row.id },
      data: { status, decidedBy: user.id, decidedByName: user.name, decidedAt: new Date() },
      include,
    });
    return res.json({ success: true, data: shape(updated) });
  } catch (err) {
    console.error('Decide access error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

/** DELETE /api/access/:id: a collector withdraws their own pending request */
const cancelRequest = async (req, res) => {
  try {
    const row = await prisma.accessRequest.findUnique({ where: { id: req.params.id } });
    if (!row || row.collectorId !== req.user.id) return fail(res, 404, 'Request not found');
    if (row.status !== 'PENDING') return fail(res, 400, 'Only pending requests can be withdrawn');
    await prisma.accessRequest.delete({ where: { id: row.id } });
    return res.json({ success: true, data: { message: 'Request withdrawn' } });
  } catch (err) {
    console.error('Cancel access error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

module.exports = { listAccess, requestAccess, grantAccess, decide, cancelRequest };
