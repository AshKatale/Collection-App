/**
 * Customer ledger calculation. Pure functions: no database, no clock.
 *
 * Rules (as used in the owner's paper book):
 *  - Loan interest for a month = rate x (principal at the start of the month + loans given that month).
 *    A loan given on any day pays that full month. Repayments reduce the NEXT month's interest.
 *  - Interest is never charged on unpaid interest, and there is no penalty for a missed month.
 *  - Further loans are added to the principal; the latest terms apply to the whole balance.
 *  - FD interest: per month on each deposit (the deposit month counts in full).
 *  - Daily-collection (Savings) interest: typed by the owner, or a rate on the balance / month's collection.
 *  - An owner may type any month's interest, which replaces the calculated amount.
 *  - Nothing is rounded beyond whole paise.
 *  - Balances carry forward for ever (across financial years) until a settlement.
 *
 * Settlements split a month: everything up to and including the settlement date is settled and
 * balances restart from zero. If older records are changed afterwards (e.g. a collection synced late),
 * the difference between "as calculated now" and "as settled" is carried forward, so no money is lost.
 *
 * All arithmetic is done in integer paise.
 */

const COMPONENTS = ['loanPrincipal', 'pendingInterest', 'fd', 'fdInterest', 'savings', 'savingsInterest'];
const OPENING_FD = 'OPENING';

const toPaise = (v) => Math.round(Number(v || 0) * 100);
const toRupees = (p) => p / 100;
/** percent of an amount in paise, rounded half-up to a whole paisa */
const percentOf = (paise, percent) => Math.round((paise * Number(percent)) / 100 + 1e-7);

const monthOf = (iso) => iso.slice(0, 7);
const nextMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};
const monthStart = (m) => `${m}-01`;
const monthEnd = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`;
};
/** Financial year (April-March) that a YYYY-MM month belongs to, as its starting year. */
const fyOfMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return mo >= 4 ? y : y - 1;
};

const sum = (list) => list.reduce((t, x) => t + x.paise, 0);

/** final > 0: pay the customer; final < 0: the customer has to pay */
const finalOf = (c) => c.fd + c.fdInterest + c.savings + c.savingsInterest - c.loanPrincipal - c.pendingInterest;

const outComponents = (c) => {
  const out = {};
  for (const k of COMPONENTS) out[k] = toRupees(c[k]);
  out.deposits = toRupees(c.fd + c.fdInterest + c.savings + c.savingsInterest);
  out.finalAmount = toRupees(finalOf(c));
  return out;
};

/**
 * @param input {
 *   asOf: 'YYYY-MM-DD',
 *   opening: null | { month, loanPrincipal, pendingInterest, fdAmount, fdInterest, savings, savingsInterest },
 *   loans:     [{ id, date, amount }],
 *   deposits:  [{ id, date, amount }],
 *   terms:     [{ id, kind, targetId, date, mode, value, base, createdAt }],
 *   overrides: [{ kind, targetId, month, amount }],
 *   entries:   [{ date, type: 'SAVINGS'|'LOAN'|'INTEREST', amount }],
 *   settlements: [{ id, date, snapshot }]            // active (not cancelled) only
 * }
 */
function computeLedger(input) {
  const { asOf, opening = null } = input;
  const withPaise = (list) => (list || []).map((x) => ({ ...x, paise: toPaise(x.amount) }));

  // With an opening balance, anything before its month is already inside that balance
  const floor = opening ? monthStart(opening.month) : '0000-00-00';
  const inRange = (x) => x.date >= floor && x.date <= asOf;
  const loans = withPaise(input.loans).filter(inRange);
  const deposits = withPaise(input.deposits).filter(inRange);
  const entries = withPaise(input.entries).filter(inRange).sort((a, b) => a.date.localeCompare(b.date));
  const settlements = [...(input.settlements || [])]
    .filter((s) => s.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date));

  const dates = [...loans, ...deposits, ...entries, ...settlements].map((x) => x.date).sort();
  const asOfMonth = monthOf(asOf);
  const startMonth = opening ? opening.month : dates.length ? monthOf(dates[0]) : asOfMonth;

  const override = new Map((input.overrides || []).map((o) => [`${o.kind}|${o.targetId || ''}|${o.month}`, toPaise(o.amount)]));

  /** Latest month wins; within one month, the term entered last wins. */
  const termFor = (kind, targetId, until) => {
    let best = null;
    for (const t of input.terms || []) {
      if (t.kind !== kind || (t.targetId || '') !== targetId || t.date > until) continue;
      if (
        !best ||
        monthOf(t.date) > monthOf(best.date) ||
        (monthOf(t.date) === monthOf(best.date) && String(t.createdAt) >= String(best.createdAt))
      ) {
        best = t;
      }
    }
    return best;
  };

  const state = {
    principal: 0,
    pending: 0,
    deposits: new Map(), // id -> paise (these earn interest)
    carriedFd: 0, // left over after a settlement (earns nothing)
    fdInterest: 0,
    savings: 0,
    savingsInterest: 0,
  };
  if (opening && opening.month <= asOfMonth) {
    state.principal = toPaise(opening.loanPrincipal);
    state.pending = toPaise(opening.pendingInterest);
    if (toPaise(opening.fdAmount)) state.deposits.set(OPENING_FD, toPaise(opening.fdAmount));
    state.fdInterest = toPaise(opening.fdInterest);
    state.savings = toPaise(opening.savings);
    state.savingsInterest = toPaise(opening.savingsInterest);
  }
  const components = () => ({
    loanPrincipal: state.principal,
    pendingInterest: state.pending,
    fd: [...state.deposits.values()].reduce((t, v) => t + v, 0) + state.carriedFd,
    fdInterest: state.fdInterest,
    savings: state.savings,
    savingsInterest: state.savingsInterest,
  });

  const initial = components();
  const months = [];
  const warnings = [];
  const warn = (code, month, targetId = '') => warnings.push({ code, month, targetId });

  for (let month = startMonth; month <= asOfMonth; month = nextMonth(month)) {
    const end = monthEnd(month) < asOf ? monthEnd(month) : asOf;
    const cuts = settlements.filter((s) => monthOf(s.date) === month);
    const segments = cuts.map((s) => ({ until: s.date, settlement: s }));
    segments.push({ until: end, settlement: null });

    const startState = components();
    const row = {
      month,
      loan: { opening: startState.loanPrincipal, given: 0, loans: [], base: 0, interest: 0, source: 'none', rate: null, repaid: 0, received: 0, receipts: [] },
      fd: { opening: startState.fd, added: 0, interest: 0, items: [] },
      savings: { opening: startState.savings, collected: 0, interest: 0, source: 'none', rate: null },
      settlements: [],
    };

    let after = '';
    let settledLive = null; // balances just before the month's last settlement
    let activityAfter = false;
    segments.forEach((segment, index) => {
      const first = index === 0;
      const { until } = segment;
      const within = (x) => x.date > after && x.date <= until && monthOf(x.date) === month;
      const segEntries = entries.filter(within);
      if (!segment.settlement && !first) activityAfter = segEntries.length > 0 || loans.some(within) || deposits.some(within);

      /* ── loan ── */
      const newLoans = loans.filter(within);
      const given = sum(newLoans);
      state.principal += given;
      row.loan.given += given;
      newLoans.forEach((l) => row.loan.loans.push({ id: l.id, date: l.date, amount: toRupees(l.paise) }));

      // after a settlement in the same month only the newly given money is charged
      const base = Math.max(0, first ? state.principal : Math.min(given, state.principal));
      const loanManual = first ? override.get(`LOAN||${month}`) : undefined;
      let charge = 0;
      if (loanManual !== undefined) {
        charge = loanManual;
        row.loan.source = 'manual';
      } else if (base > 0) {
        const term = termFor('LOAN', '', until);
        if (!term) warn('LOAN_RATE_MISSING', month);
        else {
          charge = term.mode === 'PERCENT' ? percentOf(base, term.value) : toPaise(term.value);
          row.loan.source = term.mode === 'PERCENT' ? 'rate' : 'amount';
          row.loan.rate = { mode: term.mode, value: Number(term.value) };
        }
      }
      row.loan.base += base;
      row.loan.interest += charge;
      state.pending += charge;

      for (const e of segEntries) {
        if (e.type === 'LOAN') {
          state.principal -= e.paise;
          row.loan.repaid += e.paise;
        } else if (e.type === 'INTEREST') {
          state.pending -= e.paise;
          row.loan.received += e.paise;
          const same = row.loan.receipts.find((r) => r.date === e.date);
          if (same) same.paise += e.paise;
          else row.loan.receipts.push({ date: e.date, paise: e.paise });
        }
      }

      /* ── fixed deposits ── */
      const newDeposits = deposits.filter(within);
      newDeposits.forEach((d) => state.deposits.set(d.id, d.paise));
      row.fd.added += sum(newDeposits);
      const earning = first ? [...state.deposits.keys()] : newDeposits.map((d) => d.id);
      for (const id of earning) {
        const amount = state.deposits.get(id);
        const manual = first ? override.get(`FD|${id}|${month}`) : undefined;
        const item = { id, amount: toRupees(amount), interest: 0, source: 'none', rate: null };
        if (manual !== undefined) {
          item.interest = manual;
          item.source = 'manual';
        } else {
          const term = termFor('FD', id, until);
          if (!term) warn('FD_RATE_MISSING', month, id);
          else {
            item.interest = term.mode === 'PERCENT' ? percentOf(amount, term.value) : toPaise(term.value);
            item.source = term.mode === 'PERCENT' ? 'rate' : 'amount';
            item.rate = { mode: term.mode, value: Number(term.value) };
          }
        }
        row.fd.interest += item.interest;
        state.fdInterest += item.interest;
        row.fd.items.push({ ...item, interest: toRupees(item.interest) });
      }

      /* ── daily collection (savings) ── */
      const collected = sum(segEntries.filter((e) => e.type === 'SAVINGS'));
      state.savings += collected;
      row.savings.collected += collected;
      const savingsManual = first ? override.get(`SAVINGS||${month}`) : undefined;
      let savingsCharge = 0;
      if (savingsManual !== undefined) {
        savingsCharge = savingsManual;
        row.savings.source = 'manual';
      } else {
        const term = termFor('SAVINGS', '', until);
        if (term) {
          if (term.mode === 'PERCENT') {
            const on = term.base === 'MONTH' || !first ? collected : state.savings;
            savingsCharge = percentOf(Math.max(0, on), term.value);
          } else if (first && state.savings > 0) {
            savingsCharge = toPaise(term.value);
          }
          if (first) {
            row.savings.source = term.mode === 'PERCENT' ? 'rate' : 'amount';
            row.savings.rate = { mode: term.mode, value: Number(term.value), base: term.base || 'BALANCE' };
          }
        }
      }
      row.savings.interest += savingsCharge;
      state.savingsInterest += savingsCharge;

      /* ── settlement closes everything up to here ── */
      if (segment.settlement) {
        const live = components();
        settledLive = live;
        const settled = {};
        const carried = {};
        for (const k of COMPONENTS) {
          settled[k] = toPaise(segment.settlement.snapshot?.[k]);
          carried[k] = live[k] - settled[k];
        }
        row.settlements.push({
          id: segment.settlement.id,
          date: segment.settlement.date,
          settled: outComponents(settled),
          carried: outComponents(carried),
          changedAfterwards: COMPONENTS.some((k) => carried[k] !== 0),
        });
        state.principal = carried.loanPrincipal;
        state.pending = carried.pendingInterest;
        state.deposits.clear();
        state.carriedFd = carried.fd;
        state.fdInterest = carried.fdInterest;
        state.savings = carried.savings;
        state.savingsInterest = carried.savingsInterest;
      }
      after = until;
    });

    // A month is "missed" when money was owed from before, the month is over, and nothing was repaid
    row.loan.missed =
      month < asOfMonth && row.loan.opening > 0 && row.loan.repaid === 0 && row.settlements.length === 0;
    const endState = components();
    // If nothing happened after a settlement, the month's row shows what was settled (not the zeros after it)
    months.push({ ...row, end: endState, shown: settledLive && !activityAfter ? settledLive : endState });
  }

  return { asOf, startMonth, initial, months, warnings, current: components() };
}

/** Money fields of an engine month row, converted to rupees. */
function presentMonth(row) {
  const r = (o, keys) => {
    const out = { ...o };
    for (const k of keys) out[k] = toRupees(o[k]);
    return out;
  };
  return {
    month: row.month,
    loan: {
      ...r(row.loan, ['opening', 'given', 'base', 'interest', 'repaid', 'received']),
      receipts: row.loan.receipts.map((x) => ({ date: x.date, amount: toRupees(x.paise) })),
      closing: toRupees(row.shown.loanPrincipal),
      pending: toRupees(row.shown.pendingInterest),
    },
    fd: { ...r(row.fd, ['opening', 'added', 'interest']), closing: toRupees(row.shown.fd), totalInterest: toRupees(row.shown.fdInterest) },
    savings: {
      ...r(row.savings, ['opening', 'collected', 'interest']),
      closing: toRupees(row.shown.savings),
      totalInterest: toRupees(row.shown.savingsInterest),
    },
    settlements: row.settlements,
  };
}

/** The slice of a computed ledger belonging to one financial year (April of `fy` to March of fy+1). */
function financialYearView(result, fy) {
  const from = `${fy}-04`;
  const to = `${fy + 1}-03`;
  const before = result.months.filter((m) => m.month < from);
  const rows = result.months.filter((m) => m.month >= from && m.month <= to);

  // Brought forward: end of the previous year, or the opening balance if the ledger starts in this year
  let broughtForward;
  if (before.length) broughtForward = before[before.length - 1].end;
  else if (rows.length) broughtForward = result.initial;
  else broughtForward = Object.fromEntries(COMPONENTS.map((k) => [k, 0]));
  const closing = rows.length ? rows[rows.length - 1].end : broughtForward;

  const shownClosing = rows.length ? rows[rows.length - 1].shown : broughtForward;
  // The year ends with a clean account after a settlement: report what that settlement was
  const nothingLeft = COMPONENTS.every((k) => closing[k] === 0);
  const settled = nothingLeft ? rows.flatMap((m) => m.settlements).at(-1) || null : null;

  const total = (pick) => toRupees(rows.reduce((t, m) => t + pick(m), 0));
  return {
    fy,
    months: rows.map(presentMonth),
    broughtForward: outComponents(broughtForward),
    closing: outComponents(closing), // what actually carries on
    shownClosing: outComponents(shownClosing), // for the table totals
    settled, // { date, settled: {...} } or null
    totals: {
      repaid: total((m) => m.loan.repaid),
      received: total((m) => m.loan.received),
      loanGiven: total((m) => m.loan.given),
      loanInterest: total((m) => m.loan.interest),
      fdAdded: total((m) => m.fd.added),
      fdInterest: total((m) => m.fd.interest),
      savingsCollected: total((m) => m.savings.collected),
      savingsInterest: total((m) => m.savings.interest),
    },
  };
}

module.exports = {
  COMPONENTS,
  OPENING_FD,
  computeLedger,
  financialYearView,
  outComponents,
  fyOfMonth,
  monthOf,
  monthStart,
  monthEnd,
  nextMonth,
};
