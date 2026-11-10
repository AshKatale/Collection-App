/**
 * Report data builders. All aggregation happens in Postgres (GROUP BY / SUM);
 * Node only shapes the result. Every builder is scoped by the caller's role.
 */
const { Prisma } = require('@prisma/client');
const prisma = require('../db');
const { scopeFilter } = require('../middleware/roleGuard');
const {
  monthRange,
  daysInMonth,
  fyRange,
  fyMonths,
  num,
  round2,
  byAccount,
  toISODate,
} = require('../utils/helpers');

const TYPES = ['SAVINGS', 'LOAN', 'INTEREST'];

/** Raw-SQL role scope fragment (mirrors scopeFilter in roleGuard). */
const scopeSql = (user) => {
  if (user.role === 'OWNER') return Prisma.sql`AND "ownerId" = ${user.id}`;
  if (user.role === 'COLLECTOR') {
    return Prisma.sql`AND "customerId" IN (SELECT "customerId" FROM "CollectorCustomer" WHERE "collectorId" = ${user.id})`;
  }
  return Prisma.empty;
};

const typeSql = (type) => (type ? Prisma.sql`AND "type" = ${type}::"EntryType"` : Prisma.empty);

/** Customers visible to the user, in account-number order. */
async function scopedCustomers(user) {
  const select = { id: true, accountNo: true, name: true, isActive: true };
  let list;
  if (user.role === 'ADMIN') {
    list = await prisma.customer.findMany({ select });
  } else if (user.role === 'OWNER') {
    list = await prisma.customer.findMany({ where: { ownerId: user.id }, select });
  } else {
    const links = await prisma.collectorCustomer.findMany({
      where: { collectorId: user.id },
      select: { customer: { select } },
    });
    list = links.map((l) => l.customer);
  }
  return list.sort(byAccount);
}

/** Active customers + any inactive/unlisted ones that actually have data. */
async function rowCustomers(user, idsWithData) {
  const all = await scopedCustomers(user);
  const known = new Set(all.map((c) => c.id));
  const missingIds = [...idsWithData].filter((id) => !known.has(id));
  let extra = [];
  if (missingIds.length) {
    extra = await prisma.customer.findMany({
      where: { id: { in: missingIds } },
      select: { id: true, accountNo: true, name: true, isActive: true },
    });
  }
  return [...all, ...extra]
    .filter((c) => c.isActive || idsWithData.has(c.id))
    .sort(byAccount);
}

/* ───────────────────────── Daily ───────────────────────── */

/**
 * One day, in the ledger layout: every customer on its own row with
 * Savings / Loan / Interest / Total, plus a collector-wise summary.
 */
async function dailyData(user, date) {
  const d = new Date(`${date}T00:00:00.000Z`);
  const base = { ...scopeFilter({ user }), date: d };

  const [byCustomer, byCollector] = await Promise.all([
    prisma.entry.groupBy({ by: ['customerId', 'type'], where: base, _sum: { amount: true } }),
    prisma.entry.groupBy({ by: ['collectorId', 'type'], where: base, _sum: { amount: true } }),
  ]);

  const perCustomer = new Map();
  byCustomer.forEach((g) => {
    const row = perCustomer.get(g.customerId) || { savings: 0, loan: 0, interest: 0 };
    row[g.type.toLowerCase()] = num(g._sum.amount);
    perCustomer.set(g.customerId, row);
  });

  const customers = await rowCustomers(user, new Set(perCustomer.keys()));
  const grandTotals = { savings: 0, loan: 0, interest: 0, total: 0 };
  const rows = customers.map((c, i) => {
    const v = perCustomer.get(c.id) || { savings: 0, loan: 0, interest: 0 };
    const total = round2(v.savings + v.loan + v.interest);
    grandTotals.savings += v.savings;
    grandTotals.loan += v.loan;
    grandTotals.interest += v.interest;
    grandTotals.total += total;
    return {
      sr: i + 1,
      customerId: c.id,
      accountNo: c.accountNo,
      customerName: c.name,
      savings: v.savings,
      loan: v.loan,
      interest: v.interest,
      total,
    };
  });
  Object.keys(grandTotals).forEach((k) => (grandTotals[k] = round2(grandTotals[k])));

  const perCollector = new Map();
  byCollector.forEach((g) => {
    const row = perCollector.get(g.collectorId) || { savings: 0, loan: 0, interest: 0 };
    row[g.type.toLowerCase()] = num(g._sum.amount);
    perCollector.set(g.collectorId, row);
  });
  const collectorUsers = perCollector.size
    ? await prisma.user.findMany({
        where: { id: { in: [...perCollector.keys()] } },
        select: { id: true, name: true },
      })
    : [];
  const nameOf = new Map(collectorUsers.map((u) => [u.id, u.name]));
  const collectors = [...perCollector.entries()]
    .map(([id, v]) => ({
      collectorId: id,
      collectorName: nameOf.get(id) || 'Unknown',
      ...v,
      total: round2(v.savings + v.loan + v.interest),
    }))
    .sort((a, b) => a.collectorName.localeCompare(b.collectorName));

  return { date, rows, collectors, grandTotals };
}

/* ───────────────────────── Monthly ───────────────────────── */

/** Customer x day matrix for one month (optionally one type). */
async function monthlyData(user, month, year, type) {
  const { from, to } = monthRange(month, year);
  const totalDays = daysInMonth(month, year);

  const cells = await prisma.$queryRaw(Prisma.sql`
    SELECT "customerId",
           EXTRACT(DAY FROM "date")::int AS day,
           SUM("amount")::float8        AS total
      FROM "Entry"
     WHERE "deletedAt" IS NULL
       AND "date" >= ${from}::date AND "date" <= ${to}::date
       ${scopeSql(user)}
       ${typeSql(type)}
     GROUP BY "customerId", EXTRACT(DAY FROM "date")`);

  const perCustomer = new Map();
  cells.forEach((c) => {
    const m = perCustomer.get(c.customerId) || {};
    m[c.day] = round2(c.total);
    perCustomer.set(c.customerId, m);
  });

  const customers = await rowCustomers(user, new Set(perCustomer.keys()));
  const grandTotals = { total: 0 };
  for (let d = 1; d <= totalDays; d++) grandTotals[d] = 0;

  const rows = customers.map((c, i) => {
    const dayTotals = perCustomer.get(c.id) || {};
    let total = 0;
    for (let d = 1; d <= totalDays; d++) {
      const v = dayTotals[d] || 0;
      total += v;
      grandTotals[d] += v;
    }
    grandTotals.total += total;
    return { sr: i + 1, customerId: c.id, accountNo: c.accountNo, customerName: c.name, dayTotals, total: round2(total) };
  });
  for (let d = 1; d <= totalDays; d++) grandTotals[d] = round2(grandTotals[d]);
  grandTotals.total = round2(grandTotals.total);

  return { month, year, type: type || null, totalDays, rows, grandTotals };
}

/* ───────────────────────── Yearly ───────────────────────── */

/** Customer x month matrix for a financial year (April-March). */
async function yearlyData(user, fy, type) {
  const { from, to } = fyRange(fy);
  const months = fyMonths(fy);

  const cells = await prisma.$queryRaw(Prisma.sql`
    SELECT "customerId",
           EXTRACT(MONTH FROM "date")::int AS month,
           SUM("amount")::float8           AS total
      FROM "Entry"
     WHERE "deletedAt" IS NULL
       AND "date" >= ${from}::date AND "date" <= ${to}::date
       ${scopeSql(user)}
       ${typeSql(type)}
     GROUP BY "customerId", EXTRACT(MONTH FROM "date")`);

  const perCustomer = new Map();
  cells.forEach((c) => {
    const m = perCustomer.get(c.customerId) || {};
    m[c.month] = round2(c.total);
    perCustomer.set(c.customerId, m);
  });

  const customers = await rowCustomers(user, new Set(perCustomer.keys()));
  const grandTotals = { total: 0 };
  months.forEach((m) => (grandTotals[m.month] = 0));

  const rows = customers.map((c, i) => {
    const monthTotals = perCustomer.get(c.id) || {};
    let total = 0;
    months.forEach((m) => {
      const v = monthTotals[m.month] || 0;
      total += v;
      grandTotals[m.month] += v;
    });
    grandTotals.total += total;
    return { sr: i + 1, customerId: c.id, accountNo: c.accountNo, customerName: c.name, monthTotals, total: round2(total) };
  });
  months.forEach((m) => (grandTotals[m.month] = round2(grandTotals[m.month])));
  grandTotals.total = round2(grandTotals.total);

  return { fy, type: type || null, months, rows, grandTotals };
}

/* ───────────────────────── Customer ledger ───────────────────────── */

async function customerData(user, customerId, from, to) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { status: 404, message: 'Customer not found' };
  if (user.role === 'OWNER' && customer.ownerId !== user.id) return { status: 403, message: 'Access denied' };
  if (user.role === 'COLLECTOR') {
    const link = await prisma.collectorCustomer.findUnique({
      where: { collectorId_customerId: { collectorId: user.id, customerId } },
    });
    if (!link) return { status: 403, message: 'Access denied' };
  }

  const where = {
    customerId,
    deletedAt: null,
    ...(user.role === 'OWNER' ? { ownerId: user.id } : {}),
  };
  const range = {};
  if (from) range.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) range.lte = new Date(`${to}T00:00:00.000Z`);
  if (from || to) where.date = range;

  const entries = await prisma.entry.findMany({
    where,
    include: { collector: { select: { id: true, name: true } } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  const totals = { savings: 0, loan: 0, interest: 0, total: 0 };
  const rows = entries.map((e) => {
    const amount = num(e.amount);
    totals[e.type.toLowerCase()] += amount;
    totals.total += amount;
    return {
      id: e.id,
      date: toISODate(e.date),
      type: e.type,
      amount,
      notes: e.notes,
      collectorName: e.collector?.name || '',
    };
  });
  Object.keys(totals).forEach((k) => (totals[k] = round2(totals[k])));

  return {
    customer: { id: customer.id, accountNo: customer.accountNo, name: customer.name, phone: customer.phone },
    from: from || null,
    to: to || null,
    entries: rows,
    totals,
  };
}

module.exports = { TYPES, scopedCustomers, dailyData, monthlyData, yearlyData, customerData };
