const test = require('node:test');
const assert = require('node:assert/strict');
const { computeLedger, financialYearView } = require('../src/services/ledgerEngine');

const entry = (date, type, amount) => ({ date, type, amount });
const term = (kind, date, value, extra = {}) => ({ kind, targetId: '', date, mode: 'PERCENT', value, createdAt: date, ...extra });

/** The page from the paper ledger: loan of 6000 on 4-8-2025 at 1.5% a month. */
const paper = (extra = {}) => ({
  asOf: '2026-03-31',
  loans: [{ id: 'L1', date: '2025-08-04', amount: 6000 }],
  deposits: [{ id: 'D1', date: '2025-04-21', amount: 1000 }],
  terms: [term('LOAN', '2025-08-04', 1.5)],
  overrides: [
    { kind: 'FD', targetId: 'D1', month: '2026-03', amount: 100 },
    { kind: 'SAVINGS', targetId: '', month: '2026-03', amount: 128 },
  ],
  entries: [
    ...[['08', 620], ['09', 290], ['10', 310], ['11', 300], ['12', 310]].map(([m, a]) => entry(`2025-${m}-28`, 'LOAN', a)),
    ...[['01', 310], ['02', 1120], ['03', 1080]].map(([m, a]) => entry(`2026-${m}-27`, 'LOAN', a)),
    entry('2025-08-04', 'INTEREST', 90),
    entry('2025-11-05', 'INTEREST', 157.1),
    entry('2025-12-02', 'INTEREST', 71.7),
    entry('2026-01-05', 'INTEREST', 138.9),
    entry('2025-05-10', 'SAVINGS', 3600),
  ],
  settlements: [],
  ...extra,
});

test('paper page: monthly loan interest and closing balances (no rounding)', () => {
  const v = financialYearView(computeLedger(paper()), 2025);
  const loanMonths = v.months.filter((m) => m.month >= '2025-08');
  assert.deepEqual(loanMonths.map((m) => m.loan.interest), [90, 80.7, 76.35, 71.7, 67.2, 62.55, 57.9, 41.1]);
  assert.deepEqual(loanMonths.map((m) => m.loan.closing), [5380, 5090, 4780, 4480, 4170, 3860, 2740, 1660]);
  assert.equal(v.totals.repaid, 4340);
  assert.equal(v.totals.received, 457.7);
  assert.equal(v.totals.loanInterest, 547.5);
  assert.deepEqual(
    [v.closing.fd, v.closing.fdInterest, v.closing.savings, v.closing.savingsInterest, v.closing.deposits],
    [1000, 100, 3600, 128, 4828]
  );
  assert.equal(v.closing.loanPrincipal, 1660);
  assert.equal(v.closing.pendingInterest, 89.8);
  assert.equal(v.closing.finalAmount, 3078.2);
});

test('typed monthly interest replaces the calculated amount only for that month', () => {
  const input = paper();
  input.overrides.push({ kind: 'LOAN', targetId: '', month: '2025-10', amount: 76.4 }, { kind: 'LOAN', targetId: '', month: '2026-01', amount: 62.6 });
  const v = financialYearView(computeLedger(input), 2025);
  assert.equal(v.totals.loanInterest, 547.6);
  assert.equal(v.closing.pendingInterest, 89.9);
  assert.equal(v.closing.finalAmount, 3078.1);
});

test('missed month: no penalty, interest only on the remaining principal', () => {
  const r = computeLedger({
    asOf: '2025-08-31',
    loans: [{ id: 'L', date: '2025-06-25', amount: 1000 }],
    terms: [term('LOAN', '2025-06-25', 2)],
    entries: [entry('2025-08-02', 'LOAN', 100)],
  });
  const v = financialYearView(r, 2025);
  assert.deepEqual(v.months.map((m) => m.loan.interest), [20, 20, 20]); // full month although given on the 25th
  assert.deepEqual(v.months.map((m) => m.loan.missed), [false, true, false]);
  assert.equal(v.closing.loanPrincipal, 900);
  assert.equal(v.closing.pendingInterest, 60);
});

test('second loan is added to the principal and the latest rate applies to all of it', () => {
  const r = computeLedger({
    asOf: '2025-06-30',
    loans: [{ id: 'A', date: '2025-05-01', amount: 1000 }, { id: 'B', date: '2025-06-20', amount: 500 }],
    terms: [term('LOAN', '2025-05-01', 1), term('LOAN', '2025-06-20', 2)],
    entries: [entry('2025-05-15', 'LOAN', 200)],
  });
  const june = financialYearView(r, 2025).months[1];
  assert.equal(june.loan.base, 1300);
  assert.equal(june.loan.interest, 26);
});

test('a rate changed for a month beats the rate entered with a loan in that month', () => {
  const r = computeLedger({
    asOf: '2025-05-31',
    loans: [{ id: 'A', date: '2025-05-10', amount: 1000 }],
    terms: [term('LOAN', '2025-05-10', 1, { createdAt: '1' }), term('LOAN', '2025-05-01', 3, { createdAt: '2' })],
  });
  assert.equal(financialYearView(r, 2025).months[0].loan.interest, 30);
});

test('fixed amount terms, FD rate from the deposit month, and savings rate bases', () => {
  const base = {
    asOf: '2025-06-30',
    loans: [{ id: 'A', date: '2025-05-10', amount: 1000 }],
    deposits: [{ id: 'D', date: '2025-05-29', amount: 2000 }],
    entries: [entry('2025-05-02', 'SAVINGS', 300), entry('2025-06-02', 'SAVINGS', 200)],
  };
  const terms = [term('LOAN', '2025-05-10', 25, { mode: 'AMOUNT' }), term('FD', '2025-05-29', 1, { targetId: 'D' })];
  const onBalance = financialYearView(computeLedger({ ...base, terms: [...terms, term('SAVINGS', '2025-05-01', 10, { base: 'BALANCE' })] }), 2025);
  assert.equal(onBalance.totals.loanInterest, 50);
  assert.equal(onBalance.totals.fdInterest, 40);
  assert.equal(onBalance.totals.savingsInterest, 80); // 30 + 50
  const onMonth = financialYearView(computeLedger({ ...base, terms: [...terms, term('SAVINGS', '2025-05-01', 10, { base: 'MONTH' })] }), 2025);
  assert.equal(onMonth.totals.savingsInterest, 50); // 30 + 20
});

test('balances carry into the next financial year', () => {
  const r = computeLedger(paper({ asOf: '2026-05-15' }));
  const next = financialYearView(r, 2026);
  assert.equal(next.broughtForward.finalAmount, 3078.2);
  assert.equal(next.broughtForward.loanPrincipal, 1660);
  assert.deepEqual(next.months.map((m) => m.loan.interest), [24.9, 24.9]);
  assert.deepEqual(next.months.map((m) => m.loan.missed), [true, false]);
});

test('opening balance: earlier records are ignored and balances start from it', () => {
  const r = computeLedger({
    asOf: '2025-05-31',
    opening: { month: '2025-05', loanPrincipal: 1000, pendingInterest: 10, fdAmount: 500, fdInterest: 5, savings: 300, savingsInterest: 3 },
    terms: [term('LOAN', '2025-05-01', 1), term('FD', '2025-05-01', 2, { targetId: 'OPENING' })],
    entries: [entry('2025-04-30', 'SAVINGS', 999), entry('2025-05-02', 'SAVINGS', 100)],
  });
  const v = financialYearView(r, 2025);
  assert.equal(v.broughtForward.savings, 300);
  assert.equal(v.closing.savings, 400);
  assert.equal(v.closing.pendingInterest, 20);
  assert.equal(v.closing.fdInterest, 15);
});

test('settlement clears balances; nothing keeps earning afterwards', () => {
  const march = computeLedger(paper());
  const snapshot = financialYearView(march, 2025).closing;
  const r = computeLedger(paper({ asOf: '2026-05-31', settlements: [{ id: 'S', date: '2026-03-31', snapshot }] }));
  const done = financialYearView(r, 2025);
  assert.equal(done.closing.finalAmount, 0);
  // the settled year still shows the figures that were settled
  assert.equal(done.months.at(-1).loan.closing, 1660);
  assert.equal(done.shownClosing.finalAmount, 3078.2);
  assert.equal(done.settled.date, '2026-03-31');
  assert.equal(done.settled.settled.finalAmount, 3078.2);
  const next = financialYearView(r, 2026);
  assert.equal(next.broughtForward.finalAmount, 0);
  assert.equal(next.totals.loanInterest, 0);
  assert.equal(next.totals.fdInterest, 0);
});

test('mid-month settlement: later money starts a new account and is not charged twice', () => {
  const input = {
    loans: [{ id: 'A', date: '2025-05-01', amount: 1000 }],
    terms: [term('LOAN', '2025-05-01', 2)],
    entries: [entry('2025-05-05', 'SAVINGS', 100)],
  };
  const snapshot = financialYearView(computeLedger({ ...input, asOf: '2025-05-10' }), 2025).closing;
  assert.equal(snapshot.finalAmount, -920);
  const r = computeLedger({
    ...input,
    asOf: '2025-06-30',
    loans: [...input.loans, { id: 'B', date: '2025-05-20', amount: 500 }],
    entries: [...input.entries, entry('2025-05-25', 'SAVINGS', 50)],
    settlements: [{ id: 'S', date: '2025-05-10', snapshot }],
  });
  const v = financialYearView(r, 2025);
  assert.equal(v.months[0].loan.interest, 30); // 20 settled + 10 on the new 500
  assert.equal(v.closing.loanPrincipal, 500);
  assert.equal(v.closing.pendingInterest, 20); // 10 (May) + 10 (June)
  assert.equal(v.closing.savings, 50);
  assert.equal(v.months[0].savings.closing, 50); // activity after the settlement: show the new account
  assert.equal(v.settled, null);
});

test('a collection added late to a settled period is carried forward, not lost', () => {
  const input = { asOf: '2025-05-10', entries: [entry('2025-05-05', 'SAVINGS', 100)] };
  const snapshot = financialYearView(computeLedger(input), 2025).closing;
  const r = computeLedger({
    asOf: '2025-05-31',
    entries: [...input.entries, entry('2025-05-10', 'SAVINGS', 40)],
    settlements: [{ id: 'S', date: '2025-05-10', snapshot }],
  });
  const v = financialYearView(r, 2025);
  assert.equal(v.closing.savings, 40);
  assert.equal(v.months[0].settlements[0].changedAfterwards, true);
});

test('loan repaid in excess becomes a credit and no negative interest is charged', () => {
  const r = computeLedger({
    asOf: '2025-06-30',
    loans: [{ id: 'A', date: '2025-05-01', amount: 100 }],
    terms: [term('LOAN', '2025-05-01', 2)],
    entries: [entry('2025-05-02', 'LOAN', 150)],
  });
  const v = financialYearView(r, 2025);
  assert.equal(v.months[1].loan.interest, 0);
  assert.equal(v.closing.loanPrincipal, -50);
});
