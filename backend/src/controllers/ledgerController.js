/**
 * Customer ledger (loans, fixed deposits, interest, settlements). Admin and Owner only;
 * an Owner can only reach their own customers.
 */
const prisma = require('../db');
const { parseDateOnly, todayISO, toISODate, byAccount, displayDate } = require('../utils/helpers');
const service = require('../services/ledgerService');
const { OPENING_FD, monthOf, monthStart, monthEnd } = require('../services/ledgerEngine');
const { ledgerDoc } = require('../utils/ledgerPdf');
const { sendPdf } = require('../utils/pdfBuilder');

const KINDS = ['LOAN', 'FD', 'SAVINGS'];
const MODES = ['PERCENT', 'AMOUNT'];
const BASES = ['BALANCE', 'MONTH'];

class Problem extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const need = (condition, message, status = 400) => {
  if (!condition) throw new Problem(status, message);
};

/** Wraps a handler: loads the customer with access checks and turns Problems into responses. */
const forCustomer = (handler) => async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: req.params.customerId } });
    need(customer, 'Customer not found', 404);
    need(req.user.role === 'ADMIN' || customer.ownerId === req.user.id, 'Access denied', 403);
    await handler(req, res, customer);
  } catch (err) {
    if (err instanceof Problem) return res.status(err.status).json({ success: false, message: err.message });
    if (err.code === 'P2034') return res.status(409).json({ success: false, message: 'The ledger changed while saving. Please try again.' });
    console.error('Ledger error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/* ── input parsing ─────────────────────────────────────────── */

/** Money with at most 2 decimals, zero or more. */
const money = (value, label, { positive = false } = {}) => {
  const n = value === '' || value === null || value === undefined ? NaN : Number(value);
  need(Number.isFinite(n) && n >= 0 && n < 1e10, `${label} must be a number`);
  need(Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, `${label} can have at most 2 decimals`);
  need(!positive || n > 0, `${label} must be greater than 0`);
  return Math.round(n * 100) / 100;
};

const rate = (body) => {
  need(MODES.includes(body.mode), 'Choose a rate (% per month) or an amount per month');
  if (body.mode === 'AMOUNT') return { mode: 'AMOUNT', value: money(body.value, 'Interest amount') };
  const n = body.value === '' || body.value === null || body.value === undefined ? NaN : Number(body.value);
  need(Number.isFinite(n) && n >= 0 && n <= 100, 'Rate must be between 0 and 100 % per month');
  need(Math.abs(n * 10000 - Math.round(n * 10000)) < 1e-6, 'Rate can have at most 4 decimals');
  return { mode: 'PERCENT', value: n };
};

const notesOf = (v) => (v ? String(v).trim().slice(0, 300) || null : null);

const month = (value) => {
  need(typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value), 'month must be YYYY-MM');
  return value;
};

/** A date on which a ledger record may be added or changed. */
const openDate = (value, facts, label = 'Date') => {
  need(parseDateOnly(value), `${label} must be YYYY-MM-DD`);
  need(value <= todayISO(), `${label} cannot be in the future`);
  assertNotSettled(value, facts);
  need(!facts.opening || monthOf(value) >= facts.opening.month, `${label} is before the opening balance month (${facts.opening?.month})`);
  return value;
};
const assertNotSettled = (date, facts) => {
  const last = service.lastSettlementDate(facts);
  need(!last || date > last, `The account is settled up to ${last && displayDate(last)}. Cancel that settlement first to change older records.`, 409);
};
const assertActive = (customer) => need(customer.isActive, 'This customer is archived. New loans and deposits cannot be added.', 409);

const audit = (db, req, customer, action, details) =>
  db.ledgerAudit.create({
    data: { customerId: customer.id, actorId: req.user.id, actorName: req.user.name, action, details },
  });

const asDate = (iso) => new Date(`${iso}T00:00:00.000Z`);
const entered = (req, customer) => ({ customerId: customer.id, createdBy: req.user.id });
/** Loans and deposits also carry the owner. */
const owned = (req, customer) => ({ ...entered(req, customer), ownerId: customer.ownerId });

/** Every change replies with the refreshed ledger, so the screen never shows stale numbers. */
async function respond(req, res, customer, status = 200) {
  const facts = await service.loadFacts(customer.id);
  const requested = Number.parseInt(req.query.fy, 10);
  const history = await prisma.ledgerAudit.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  const { entries, ...records } = facts;
  return res.status(status).json({
    success: true,
    data: {
      customer: { id: customer.id, accountNo: customer.accountNo, name: customer.name, phone: customer.phone, isActive: customer.isActive },
      ...service.buildLedger(facts, requested),
      records,
      history,
    },
  });
}

/* ── read ──────────────────────────────────────────────────── */

/** GET /api/ledger/customers: active customers, plus archived ones that still have a ledger. */
const listLedgerCustomers = async (req, res) => {
  try {
    // archived customers stay reachable while they have anything in the ledger
    const hasLedger = [
      { ledgerLoans: { some: {} } },
      { ledgerDeposits: { some: {} } },
      { ledgerSettlements: { some: {} } },
      { ledgerOpening: { isNot: null } },
    ];
    const withHistory = await prisma.ledgerAudit.findMany({ distinct: ['customerId'], select: { customerId: true } });
    hasLedger.push({ id: { in: withHistory.map((h) => h.customerId) } });
    const customers = await prisma.customer.findMany({
      where: {
        ...(req.user.role === 'OWNER' ? { ownerId: req.user.id } : {}),
        OR: [{ isActive: true }, ...hasLedger],
      },
      select: { id: true, accountNo: true, name: true, isActive: true },
    });
    return res.json({ success: true, data: customers.sort(byAccount) });
  } catch (err) {
    console.error('Ledger customers error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getLedger = forCustomer((req, res, customer) => respond(req, res, customer));

const exportLedger = forCustomer(async (req, res, customer) => {
  const lang = req.query.lang === 'mr' ? 'mr' : 'en';
  const facts = await service.loadFacts(customer.id);
  const ledger = service.buildLedger(facts, Number.parseInt(req.query.fy, 10));
  const safeAccount = String(customer.accountNo).replace(/[^\w-]+/g, '_');
  sendPdf(res, ledgerDoc({ customer, ledger, records: facts, lang }), `Ledger_${safeAccount}_FY${ledger.fy}_${lang}.pdf`);
});

/* ── loans and deposits ────────────────────────────────────── */

const RECORDS = {
  loan: { model: 'ledgerLoan', list: 'loans', kind: 'LOAN', label: 'Loan', audit: 'LOAN' },
  deposit: { model: 'ledgerDeposit', list: 'deposits', kind: 'FD', label: 'Deposit', audit: 'FD' },
};

const createRecord = (type) =>
  forCustomer(async (req, res, customer) => {
    const cfg = RECORDS[type];
    assertActive(customer);
    const facts = await service.loadFacts(customer.id);
    const date = openDate(req.body.date, facts);
    const amount = money(req.body.amount, `${cfg.label} amount`, { positive: true });
    // A loan always needs its interest terms; a deposit's can be added later
    const terms = type === 'loan' || req.body.mode ? rate(req.body) : null;

    await prisma.$transaction(async (tx) => {
      const row = await tx[cfg.model].create({ data: { ...owned(req, customer), date: asDate(date), amount, notes: notesOf(req.body.notes) } });
      if (terms) {
        await tx.ledgerTerm.create({
          data: { ...entered(req, customer), kind: cfg.kind, targetId: type === 'deposit' ? row.id : '', sourceId: row.id, date: asDate(date), ...terms },
        });
      }
      await audit(tx, req, customer, `${cfg.audit}_ADDED`, { id: row.id, date, amount, ...terms });
    });
    await respond(req, res, customer, 201);
  });

const updateRecord = (type) =>
  forCustomer(async (req, res, customer) => {
    const cfg = RECORDS[type];
    const facts = await service.loadFacts(customer.id);
    const current = facts[cfg.list].find((r) => r.id === req.params.id);
    need(current, `${cfg.label} not found`, 404);
    assertNotSettled(current.date, facts);
    const date = openDate(req.body.date ?? current.date, facts);
    const amount = money(req.body.amount ?? current.amount, `${cfg.label} amount`, { positive: true });
    const notes = req.body.notes === undefined ? current.notes : notesOf(req.body.notes);

    await prisma.$transaction(async (tx) => {
      await tx[cfg.model].update({ where: { id: current.id }, data: { date: asDate(date), amount, notes } });
      // the interest terms entered with this record move with it
      await tx.ledgerTerm.updateMany({ where: { customerId: customer.id, sourceId: current.id }, data: { date: asDate(date) } });
      await audit(tx, req, customer, `${cfg.audit}_CHANGED`, {
        id: current.id,
        before: { date: current.date, amount: current.amount },
        after: { date, amount },
      });
    });
    await respond(req, res, customer);
  });

const cancelRecord = (type) =>
  forCustomer(async (req, res, customer) => {
    const cfg = RECORDS[type];
    const facts = await service.loadFacts(customer.id);
    const current = facts[cfg.list].find((r) => r.id === req.params.id);
    need(current, `${cfg.label} not found`, 404);
    assertNotSettled(current.date, facts);

    await prisma.$transaction(async (tx) => {
      await tx[cfg.model].update({ where: { id: current.id }, data: { deletedAt: new Date() } });
      await tx.ledgerTerm.deleteMany({
        where: { customerId: customer.id, OR: [{ sourceId: current.id }, ...(type === 'deposit' ? [{ targetId: current.id }] : [])] },
      });
      if (type === 'deposit') await tx.ledgerOverride.deleteMany({ where: { customerId: customer.id, targetId: current.id } });
      await audit(tx, req, customer, `${cfg.audit}_CANCELLED`, { id: current.id, date: current.date, amount: current.amount });
    });
    await respond(req, res, customer);
  });

/* ── interest terms and typed monthly amounts ──────────────── */

/** For kind FD the target must be a live deposit (or the opening deposit). */
const targetFor = (kind, targetId, facts) => {
  if (kind !== 'FD') return '';
  const valid = facts.deposits.some((d) => d.id === targetId) || (targetId === OPENING_FD && facts.opening?.fdAmount > 0);
  need(valid, 'Select a fixed deposit');
  return targetId;
};

/** POST /:customerId/terms  { kind, targetId?, fromMonth, mode, value, base? } */
const addTerm = forCustomer(async (req, res, customer) => {
  const { kind } = req.body;
  need(KINDS.includes(kind), 'kind must be LOAN, FD or SAVINGS');
  const facts = await service.loadFacts(customer.id);
  const targetId = targetFor(kind, req.body.targetId, facts);
  const from = month(req.body.fromMonth);
  need(from <= monthOf(todayISO()), 'The month cannot be in the future');
  const last = service.lastSettlementDate(facts);
  need(!last || from >= monthOf(last), 'That month is already settled', 409);

  // In the month of a settlement the new terms only apply to what comes after it
  let date = monthStart(from);
  if (last && date <= last) {
    const next = new Date(asDate(last).getTime() + 86400000);
    date = toISODate(next);
    need(monthOf(date) === from, 'That month is already settled', 409);
  }
  const base = kind === 'SAVINGS' && req.body.mode === 'PERCENT' ? req.body.base || 'BALANCE' : null;
  need(base === null || BASES.includes(base), 'Invalid base');
  const terms = rate(req.body);

  await prisma.$transaction(async (tx) => {
    await tx.ledgerTerm.create({ data: { ...entered(req, customer), kind, targetId, date: asDate(date), base, ...terms } });
    await audit(tx, req, customer, 'RATE_SET', { kind, targetId, from, base, ...terms });
  });
  await respond(req, res, customer, 201);
});

const deleteTerm = forCustomer(async (req, res, customer) => {
  const facts = await service.loadFacts(customer.id);
  const term = facts.terms.find((t) => t.id === req.params.id);
  need(term, 'Rate not found', 404);
  need(!term.sourceId, 'This rate was entered with a loan, deposit or opening balance. Set a new rate instead.');
  assertNotSettled(term.date, facts);
  await prisma.$transaction(async (tx) => {
    await tx.ledgerTerm.delete({ where: { id: term.id } });
    await audit(tx, req, customer, 'RATE_REMOVED', { kind: term.kind, from: monthOf(term.date), mode: term.mode, value: term.value });
  });
  await respond(req, res, customer);
});

/** PUT /:customerId/overrides  { kind, targetId?, month, amount }   amount null = calculate again */
const setOverride = forCustomer(async (req, res, customer) => {
  const { kind } = req.body;
  need(KINDS.includes(kind), 'kind must be LOAN, FD or SAVINGS');
  const facts = await service.loadFacts(customer.id);
  const targetId = targetFor(kind, req.body.targetId, facts);
  const m = month(req.body.month);
  need(m <= monthOf(todayISO()), 'The month cannot be in the future');
  need(!facts.opening || m >= facts.opening.month, 'That month is before the opening balance');
  const last = service.lastSettlementDate(facts);
  need(!last || m > monthOf(last), 'That month is already settled', 409);
  if (kind === 'FD' && targetId !== OPENING_FD) {
    const deposit = facts.deposits.find((d) => d.id === targetId);
    need(monthEnd(m) >= deposit.date, 'The deposit did not exist in that month');
  }

  const key = { customerId: customer.id, kind, targetId, month: m };
  const clear = req.body.amount === null || req.body.amount === '';
  const amount = clear ? null : money(req.body.amount, 'Interest amount');
  await prisma.$transaction(async (tx) => {
    if (clear) await tx.ledgerOverride.deleteMany({ where: key });
    else {
      await tx.ledgerOverride.upsert({
        where: { customerId_kind_targetId_month: key },
        create: { ...key, amount, createdBy: req.user.id },
        update: { amount, createdBy: req.user.id },
      });
    }
    await audit(tx, req, customer, clear ? 'INTEREST_RESET' : 'INTEREST_TYPED', { kind, targetId, month: m, amount });
  });
  await respond(req, res, customer);
});

/* ── opening balance ───────────────────────────────────────── */

const assertOpeningEditable = (facts) =>
  need(service.activeSettlements(facts).length === 0, 'The opening balance cannot be changed after a settlement', 409);

const saveOpening = forCustomer(async (req, res, customer) => {
  const facts = await service.loadFacts(customer.id);
  assertOpeningEditable(facts);
  const m = month(req.body.month);
  need(m <= monthOf(todayISO()), 'The month cannot be in the future');
  const earlier = [...facts.loans, ...facts.deposits].find((r) => monthOf(r.date) < m);
  need(!earlier, `A loan or deposit is dated before that month (${earlier && displayDate(earlier.date)}). Choose an earlier month.`);

  const values = {
    month: m,
    loanPrincipal: money(req.body.loanPrincipal || 0, 'Loan remaining'),
    pendingInterest: money(req.body.pendingInterest || 0, 'Pending interest'),
    fdAmount: money(req.body.fdAmount || 0, 'Fixed deposit'),
    fdInterest: money(req.body.fdInterest || 0, 'FD interest'),
    savings: money(req.body.savings || 0, 'Daily collection'),
    savingsInterest: money(req.body.savingsInterest || 0, 'Daily collection interest'),
  };
  const loanTerms = req.body.loanRate?.mode ? rate(req.body.loanRate) : null;
  const fdTerms = req.body.fdRate?.mode ? rate(req.body.fdRate) : null;
  const hasLoanTerms = facts.terms.some((t) => t.kind === 'LOAN' && t.sourceId !== OPENING_FD && monthOf(t.date) <= m);
  need(!values.loanPrincipal || loanTerms || hasLoanTerms, 'Enter the interest rate or amount for the remaining loan');

  await prisma.$transaction(async (tx) => {
    await tx.ledgerOpening.upsert({
      where: { customerId: customer.id },
      create: { customerId: customer.id, ...values, createdBy: req.user.id },
      update: { ...values, createdBy: req.user.id },
    });
    await tx.ledgerTerm.deleteMany({ where: { customerId: customer.id, sourceId: OPENING_FD } });
    const common = { ...entered(req, customer), sourceId: OPENING_FD, date: asDate(monthStart(m)) };
    if (loanTerms && values.loanPrincipal) await tx.ledgerTerm.create({ data: { ...common, kind: 'LOAN', targetId: '', ...loanTerms } });
    if (fdTerms && values.fdAmount) await tx.ledgerTerm.create({ data: { ...common, kind: 'FD', targetId: OPENING_FD, ...fdTerms } });
    await audit(tx, req, customer, 'OPENING_SAVED', values);
  });
  await respond(req, res, customer);
});

const deleteOpening = forCustomer(async (req, res, customer) => {
  const facts = await service.loadFacts(customer.id);
  assertOpeningEditable(facts);
  need(facts.opening, 'There is no opening balance', 404);
  await prisma.$transaction(async (tx) => {
    await tx.ledgerOpening.delete({ where: { customerId: customer.id } });
    await tx.ledgerTerm.deleteMany({ where: { customerId: customer.id, OR: [{ sourceId: OPENING_FD }, { targetId: OPENING_FD }] } });
    await tx.ledgerOverride.deleteMany({ where: { customerId: customer.id, targetId: OPENING_FD } });
    await audit(tx, req, customer, 'OPENING_REMOVED', facts.opening);
  });
  await respond(req, res, customer);
});

/* ── settlement ────────────────────────────────────────────── */

const checkSettlementDate = (date, facts) => {
  need(parseDateOnly(date), 'Date must be YYYY-MM-DD');
  need(date <= todayISO(), 'The settlement date cannot be in the future');
  const last = service.lastSettlementDate(facts);
  need(!last || date > last, `Choose a date after the last settlement (${last && displayDate(last)})`, 409);
  return date;
};

/** GET /:customerId/settlement-preview?date= */
const previewSettlement = forCustomer(async (req, res, customer) => {
  const facts = await service.loadFacts(customer.id);
  const date = checkSettlementDate(String(req.query.date || todayISO()), facts);
  res.json({ success: true, data: service.settlementPreview(facts, date) });
});

/** POST /:customerId/settlements  { date, notes?, expectedFinal } */
const createSettlement = forCustomer(async (req, res, customer) => {
  // Serializable: two people settling at once (or a change in between) must not both succeed
  await prisma.$transaction(
    async (tx) => {
      const facts = await service.loadFacts(customer.id, tx);
      const date = checkSettlementDate(req.body.date, facts);
      const preview = service.settlementPreview(facts, date);
      need(!preview.isEmpty, 'There is nothing to settle on that date');
      need(!preview.missingLoanRate.length, `Set the loan interest rate first (missing for ${preview.missingLoanRate.join(', ')})`);
      need(
        Math.abs(Number(req.body.expectedFinal) - preview.finalAmount) < 0.005,
        'The amount changed since you opened this window. Please check it again.',
        409
      );
      const row = await tx.ledgerSettlement.create({
        data: {
          ...entered(req, customer),
          createdByName: req.user.name,
          date: asDate(date),
          finalAmount: preview.finalAmount,
          snapshot: preview.snapshot,
          notes: notesOf(req.body.notes),
        },
      });
      await audit(tx, req, customer, 'SETTLED', { id: row.id, date, finalAmount: preview.finalAmount });
    },
    { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 }
  );
  await respond(req, res, customer, 201);
});

/** DELETE /:customerId/settlements/:id: only the latest one; it stays in the history as cancelled. */
const cancelSettlement = forCustomer(async (req, res, customer) => {
  const facts = await service.loadFacts(customer.id);
  const active = service.activeSettlements(facts);
  const latest = active[active.length - 1];
  need(active.some((s) => s.id === req.params.id), 'Settlement not found', 404);
  need(latest.id === req.params.id, 'Only the latest settlement can be cancelled', 409);
  await prisma.$transaction(async (tx) => {
    const done = await tx.ledgerSettlement.updateMany({
      where: { id: latest.id, cancelledAt: null },
      data: { cancelledAt: new Date(), cancelledByName: req.user.name },
    });
    need(done.count === 1, 'Already cancelled', 409);
    await audit(tx, req, customer, 'SETTLEMENT_CANCELLED', { id: latest.id, date: latest.date, finalAmount: latest.finalAmount });
  });
  await respond(req, res, customer);
});

module.exports = {
  listLedgerCustomers,
  getLedger,
  exportLedger,
  createRecord,
  updateRecord,
  cancelRecord,
  addTerm,
  deleteTerm,
  setOverride,
  saveOpening,
  deleteOpening,
  previewSettlement,
  createSettlement,
  cancelSettlement,
};
