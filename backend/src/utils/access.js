const prisma = require('../db');
const { todayISO, toISODate } = require('./helpers');

/**
 * Date-write rules for collectors.
 * A collector may add/change entries of TODAY, plus any date covered by an
 * APPROVED access request from their owner. Admin / Owner are unrestricted.
 *
 * `loadGrants` is called once per request; `isDateWritable` is then synchronous,
 * so listing hundreds of entries costs one extra query, not one per row.
 */
async function loadGrants(user) {
  if (user.role !== 'COLLECTOR') return [];
  const rows = await prisma.accessRequest.findMany({
    where: { collectorId: user.id, status: 'APPROVED' },
    select: { fromDate: true, toDate: true },
  });
  return rows.map((r) => ({ from: toISODate(r.fromDate), to: toISODate(r.toDate) }));
}

function isDateWritable(user, grants, dateISO) {
  if (user.role !== 'COLLECTOR') return true;
  if (dateISO === todayISO()) return true;
  return grants.some((g) => dateISO >= g.from && dateISO <= g.to);
}

module.exports = { loadGrants, isDateWritable };
