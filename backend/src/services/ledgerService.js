/** Loads one customer's ledger facts from the database and runs the calculation engine. */
const prisma = require('../db');
const { toISODate, todayISO, num } = require('../utils/helpers');
const { computeLedger, financialYearView, fyOfMonth, monthOf, COMPONENTS } = require('./ledgerEngine');

const NOT_DELETED = { deletedAt: null };

async function loadFacts(customerId, db = prisma) {
  const where = { customerId };
  const [loans, deposits, terms, overrides, opening, settlements, entries] = await Promise.all([
    db.ledgerLoan.findMany({ where: { ...where, ...NOT_DELETED }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
    db.ledgerDeposit.findMany({ where: { ...where, ...NOT_DELETED }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
    db.ledgerTerm.findMany({ where, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
    db.ledgerOverride.findMany({ where }),
    db.ledgerOpening.findUnique({ where }),
    db.ledgerSettlement.findMany({ where, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
    // One row per day and type is all the calculation needs
    db.entry.groupBy({ by: ['date', 'type'], where: { ...where, ...NOT_DELETED }, _sum: { amount: true } }),
  ]);

  const money = (row) => ({ id: row.id, date: toISODate(row.date), amount: num(row.amount), notes: row.notes });
  return {
    loans: loans.map(money),
    deposits: deposits.map(money),
    terms: terms.map((t) => ({
      id: t.id,
      kind: t.kind,
      targetId: t.targetId,
      sourceId: t.sourceId,
      date: toISODate(t.date),
      mode: t.mode,
      value: Number(t.value),
      base: t.base,
      createdAt: t.createdAt.toISOString(),
    })),
    overrides: overrides.map((o) => ({ kind: o.kind, targetId: o.targetId, month: o.month, amount: num(o.amount) })),
    opening: opening
      ? {
          month: opening.month,
          loanPrincipal: num(opening.loanPrincipal),
          pendingInterest: num(opening.pendingInterest),
          fdAmount: num(opening.fdAmount),
          fdInterest: num(opening.fdInterest),
          savings: num(opening.savings),
          savingsInterest: num(opening.savingsInterest),
        }
      : null,
    settlements: settlements.map((s) => ({
      id: s.id,
      date: toISODate(s.date),
      finalAmount: num(s.finalAmount),
      snapshot: s.snapshot,
      notes: s.notes,
      createdByName: s.createdByName,
      createdAt: s.createdAt,
      cancelledAt: s.cancelledAt,
      cancelledByName: s.cancelledByName,
    })),
    entries: entries.map((e) => ({ date: toISODate(e.date), type: e.type, amount: num(e._sum.amount) })),
  };
}

const activeSettlements = (facts) => facts.settlements.filter((s) => !s.cancelledAt);
const lastSettlementDate = (facts) => activeSettlements(facts).map((s) => s.date).sort().pop() || null;

function calculate(facts, asOf = todayISO()) {
  return computeLedger({ ...facts, asOf, settlements: activeSettlements(facts) });
}

/** Everything the screen / PDF needs for one financial year. */
function buildLedger(facts, requestedFy) {
  const today = todayISO();
  const result = calculate(facts, today);
  const currentFy = fyOfMonth(monthOf(today));
  const firstFy = Math.min(fyOfMonth(result.startMonth), currentFy);
  const availableFys = Array.from({ length: currentFy - firstFy + 1 }, (_, i) => firstFy + i);
  const fy = availableFys.includes(requestedFy) ? requestedFy : currentFy;
  const view = financialYearView(result, fy);
  const shown = new Set(view.months.map((m) => m.month));

  return {
    today,
    fy,
    availableFys,
    startMonth: result.startMonth,
    view,
    current: financialYearView(result, currentFy).closing,
    warnings: result.warnings.filter((w) => shown.has(w.month)),
    lastSettlementDate: lastSettlementDate(facts),
  };
}

/** The balances that would be settled on `date`. */
function settlementPreview(facts, date) {
  const result = calculate(facts, date);
  const closing = financialYearView(result, fyOfMonth(monthOf(date))).closing;
  const snapshot = Object.fromEntries(COMPONENTS.map((k) => [k, closing[k]]));
  return {
    date,
    snapshot,
    deposits: closing.deposits,
    finalAmount: closing.finalAmount,
    isEmpty: COMPONENTS.every((k) => !snapshot[k]),
    // interest cannot be settled correctly while a loan month has no rate
    missingLoanRate: result.warnings.filter((w) => w.code === 'LOAN_RATE_MISSING').map((w) => w.month),
  };
}

module.exports = { loadFacts, calculate, buildLedger, settlementPreview, lastSettlementDate, activeSettlements };
