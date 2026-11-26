/** Customer ledger as a sectioned PDF, in English or Marathi. */
const { kit } = require('./pdfBuilder');
const { ORG_NAME } = require('./excelBuilder');
const { displayDate, fyLabel, APP_TIMEZONE } = require('./helpers');

const { baseDoc, th, td, layout, GREEN, LIGHT } = kit;

const TEXT = {
  en: {
    title: 'Customer Ledger',
    fy: 'Financial year',
    account: 'Account no.',
    name: 'Name',
    phone: 'Phone',
    asOn: 'Balances as on',
    bf: 'Brought forward',
    total: 'Total',
    repaymentTitle: '1. Loan repayment and interest received',
    month: 'Month',
    repaid: 'Loan repaid',
    received: 'Interest received',
    dates: 'Received on',
    missed: 'Missed',
    loanTitle: '2. Loan given and monthly interest',
    given: 'Loan given',
    base: 'Interest on',
    terms: 'Rate',
    interest: 'Interest',
    balance: 'Loan remaining',
    pending: 'Interest pending',
    date: 'Date',
    amount: 'Amount',
    typed: 'entered',
    perMonth: '/month',
    fdTitle: '3. Fixed deposit',
    fdAdded: 'Deposit added',
    fdBalance: 'Deposit',
    fdInterest: 'FD interest',
    interestTotal: 'Interest total',
    savingsTitle: '4. Daily collection (savings)',
    collected: 'Collected',
    collectedTotal: 'Collection total',
    settlementsTitle: 'Settlements',
    paid: 'Paid to customer',
    got: 'Received from customer',
    by: 'By',
    changed: 'Records of a settled period were changed afterwards; the difference is carried forward.',
    summaryTitle: '5. Final calculation',
    rowFd: 'Fixed deposit',
    rowFdInterest: 'Fixed deposit interest',
    rowSavings: 'Daily collection',
    rowSavingsInterest: 'Daily collection interest',
    rowDeposits: 'Total',
    rowLoan: 'Less: loan remaining',
    rowPending: 'Less: interest pending',
    pay: 'Amount payable to customer',
    owe: 'Amount payable by customer',
    nil: 'Nothing payable',
    settledOn: 'Account settled on',
    nothing: 'No records in this year',
    generated: 'Generated',
    page: (p, n) => `Page ${p} of ${n}`,
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  mr: {
    title: 'ग्राहक खातेवही',
    fy: 'आर्थिक वर्ष',
    account: 'खाते क्रमांक',
    name: 'नाव',
    phone: 'फोन',
    asOn: 'शिल्लक दिनांक',
    bf: 'मागील बाकी',
    total: 'एकूण',
    repaymentTitle: '१. कर्ज परतफेड व जमा व्याज',
    month: 'महिना',
    repaid: 'कर्ज परतफेड',
    received: 'जमा व्याज',
    dates: 'जमा दिनांक',
    missed: 'हप्ता नाही',
    loanTitle: '२. दिलेले कर्ज व मासिक व्याज',
    given: 'दिलेले कर्ज',
    base: 'व्याज रक्कम आधार',
    terms: 'दर',
    interest: 'व्याज',
    balance: 'कर्ज येणे',
    pending: 'व्याज बाकी',
    date: 'दिनांक',
    amount: 'रक्कम',
    typed: 'नोंदवलेले',
    perMonth: '/महिना',
    fdTitle: '३. डिपॉझिट',
    fdAdded: 'नवीन डिपॉझिट',
    fdBalance: 'डिपॉझिट जमा',
    fdInterest: 'डिपॉझिट लाभांश',
    interestTotal: 'एकूण लाभांश',
    savingsTitle: '४. दैनंदिन जमा',
    collected: 'महिन्याची जमा',
    collectedTotal: 'एकूण जमा',
    settlementsTitle: 'हिशेब पूर्तता',
    paid: 'ग्राहकाला दिले',
    got: 'ग्राहकाकडून घेतले',
    by: 'कोणी',
    changed: 'पूर्तता झालेल्या कालावधीच्या नोंदी नंतर बदलल्या; फरक पुढे घेतला आहे.',
    summaryTitle: '५. अंतिम हिशेब',
    rowFd: 'डिपॉझिट जमा',
    rowFdInterest: 'डिपॉझिट लाभांश',
    rowSavings: 'दैनंदिन जमा',
    rowSavingsInterest: 'दैनंदिन लाभांश',
    rowDeposits: 'एकूण',
    rowLoan: 'वजा: कर्ज येणे',
    rowPending: 'वजा: व्याज बाकी',
    pay: 'ग्राहकाला देणे',
    owe: 'ग्राहकाकडून येणे',
    nil: 'देणे-घेणे नाही',
    settledOn: 'हिशेब पूर्ण दिनांक',
    nothing: 'या वर्षात नोंदी नाहीत',
    generated: 'तयार केल्याची वेळ',
    page: (p, n) => `पान ${p} / ${n}`,
    months: ['जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून', 'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर'],
  },
};

/** Always two decimals, Indian grouping, western digits (exact figures, no rounding). */
const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const right = (n, extra = {}) => td(fmt(n), { alignment: 'right', ...extra });
const optional = (n, extra = {}) => td(n ? fmt(n) : '-', { alignment: 'right', ...extra });
const strong = { bold: true, fillColor: LIGHT };

const heading = (text) => ({ text, bold: true, fontSize: 11, color: GREEN, margin: [0, 10, 0, 4] });
const table = (widths, head, rows) => ({
  table: { headerRows: 1, widths, body: [head.map((h) => th(h)), ...rows] },
  layout,
});

function ledgerDoc({ customer, ledger, records, lang }) {
  const L = TEXT[lang] || TEXT.en;
  const { view, fy } = ledger;
  const { months, broughtForward: bf, shownClosing: closing, totals, settled: lastSettled } = view;
  // A settled account: the final section repeats what was settled
  const final = lastSettled ? lastSettled.settled : view.closing;
  const monthLabel = (m) => `${L.months[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
  const rateLabel = (item) => {
    if (item.source === 'manual') return L.typed;
    if (!item.rate) return '-';
    return item.rate.mode === 'PERCENT' ? `${item.rate.value}%` : `${fmt(item.rate.value)}${L.perMonth}`;
  };
  const asOn = months.length ? (fy === ledger.availableFys.at(-1) ? ledger.today : `${fy + 1}-03-31`) : ledger.today;

  const repayment = table(
    [90, 80, 80, '*'],
    [L.month, L.repaid, L.received, L.dates],
    [
      ...months.map((m) => [
        td(monthLabel(m.month)),
        m.loan.missed ? td(L.missed, { alignment: 'right', color: '#B91C1C', bold: true }) : optional(m.loan.repaid),
        optional(m.loan.received),
        td(m.loan.receipts.map((r) => `${displayDate(r.date)}: ${fmt(r.amount)}`).join(', ') || '-', { fontSize: 7.5 }),
      ]),
      [td(L.total, strong), right(totals.repaid, strong), right(totals.received, strong), td('', strong)],
    ]
  );

  const loanMonths = table(
    [90, 65, 70, 50, 60, 70, '*'],
    [L.month, L.given, L.base, L.terms, L.interest, L.balance, L.pending],
    [
      [td(L.bf, { italics: true }), td(''), td(''), td(''), td(''), right(bf.loanPrincipal), right(bf.pendingInterest)],
      ...months.map((m) => [
        td(monthLabel(m.month)),
        optional(m.loan.given),
        optional(m.loan.base),
        td(rateLabel(m.loan), { alignment: 'center' }),
        optional(m.loan.interest),
        right(m.loan.closing),
        right(m.loan.pending),
      ]),
      [td(L.total, strong), right(totals.loanGiven, strong), td('', strong), td('', strong), right(totals.loanInterest, strong), right(closing.loanPrincipal, strong), right(closing.pendingInterest, strong)],
    ]
  );

  const yearFrom = `${fy}-04-01`;
  const yearTo = `${fy + 1}-03-31`;
  const dated = (list) => list.filter((r) => r.date >= yearFrom && r.date <= yearTo);
  const givenList = dated(records.loans);
  const depositList = dated(records.deposits);
  const recordTable = (list) =>
    table([90, 80, '*'], [L.date, L.amount, ''], list.map((r) => [td(displayDate(r.date)), right(r.amount), td(r.notes || '')]));

  const fd = table(
    [90, 80, 80, 80, '*'],
    [L.month, L.fdAdded, L.fdBalance, L.fdInterest, L.interestTotal],
    [
      [td(L.bf, { italics: true }), td(''), right(bf.fd), td(''), right(bf.fdInterest)],
      ...months.map((m) => [td(monthLabel(m.month)), optional(m.fd.added), right(m.fd.closing), optional(m.fd.interest), right(m.fd.totalInterest)]),
      [td(L.total, strong), right(totals.fdAdded, strong), right(closing.fd, strong), right(totals.fdInterest, strong), right(closing.fdInterest, strong)],
    ]
  );

  const savings = table(
    [90, 80, 80, 80, '*'],
    [L.month, L.collected, L.collectedTotal, L.interest, L.interestTotal],
    [
      [td(L.bf, { italics: true }), td(''), right(bf.savings), td(''), right(bf.savingsInterest)],
      ...months.map((m) => [td(monthLabel(m.month)), optional(m.savings.collected), right(m.savings.closing), optional(m.savings.interest), right(m.savings.totalInterest)]),
      [td(L.total, strong), right(totals.savingsCollected, strong), right(closing.savings, strong), right(totals.savingsInterest, strong), right(closing.savingsInterest, strong)],
    ]
  );

  const settled = records.settlements.filter((s) => !s.cancelledAt && s.date >= yearFrom && s.date <= yearTo);
  const changed = months.some((m) => m.settlements.some((s) => s.changedAfterwards));

  const verdict = lastSettled
    ? final.finalAmount < 0 ? L.got : L.paid
    : final.finalAmount > 0 ? L.pay : final.finalAmount < 0 ? L.owe : L.nil;
  const line = (label, value, extra = {}) => [td(label, extra), right(value, extra)];
  const summary = {
    table: {
      widths: ['*', 120],
      body: [
        line(L.rowFd, final.fd),
        line(L.rowFdInterest, final.fdInterest),
        line(L.rowSavings, final.savings),
        line(L.rowSavingsInterest, final.savingsInterest),
        line(L.rowDeposits, final.deposits, strong),
        line(L.rowLoan, final.loanPrincipal),
        line(L.rowPending, final.pendingInterest),
        line(verdict, Math.abs(final.finalAmount), { ...strong, fontSize: 11 }),
      ],
    },
    layout,
  };

  const info = {
    table: {
      widths: [80, '*', 80, '*'],
      body: [
        [td(L.name, { bold: true }), td(customer.name), td(L.account, { bold: true }), td(customer.accountNo)],
        [td(L.phone, { bold: true }), td(customer.phone || '-'), td(L.asOn, { bold: true }), td(displayDate(asOn))],
      ],
    },
    layout,
  };

  const content = [info];
  if (!months.length) content.push({ text: L.nothing, margin: [0, 10, 0, 0] });
  else {
    content.push(heading(L.repaymentTitle), repayment, heading(L.loanTitle));
    if (givenList.length) content.push(recordTable(givenList), { text: '', margin: [0, 4, 0, 0] });
    content.push(loanMonths, heading(L.fdTitle));
    if (depositList.length) content.push(recordTable(depositList), { text: '', margin: [0, 4, 0, 0] });
    content.push(fd, heading(L.savingsTitle), savings);
  }
  if (settled.length) {
    content.push(
      heading(L.settlementsTitle),
      table(
        [90, 130, 90, '*'],
        [L.date, '', L.amount, L.by],
        settled.map((s) => [td(displayDate(s.date)), td(s.finalAmount >= 0 ? L.paid : L.got), right(Math.abs(s.finalAmount)), td(s.createdByName)])
      )
    );
  }
  if (changed) content.push({ text: L.changed, fontSize: 8, color: '#B45309', margin: [0, 4, 0, 0] });
  const summaryTitle = lastSettled ? `${L.summaryTitle} – ${L.settledOn} ${displayDate(lastSettled.date)}` : L.summaryTitle;
  content.push({ stack: [heading(summaryTitle), summary], unbreakable: true });

  const doc = baseDoc({ title: ORG_NAME, subtitle: `${L.title} – ${L.fy} ${fyLabel(fy)}`, content });
  const stamp = new Date().toLocaleString('en-IN', { timeZone: APP_TIMEZONE });
  doc.footer = (page, pages) => ({
    columns: [
      { text: lang === 'mr' ? [{ text: L.generated, font: 'NotoDev' }, ` ${stamp}`] : `${L.generated} ${stamp}`, fontSize: 7, color: '#94A3B8', margin: [20, 0, 0, 0] },
      {
        text: lang === 'mr' ? [{ text: 'पान', font: 'NotoDev' }, ` ${page} / ${pages}`] : L.page(page, pages),
        fontSize: 7,
        color: '#94A3B8',
        alignment: 'right',
        margin: [0, 0, 20, 0],
      },
    ],
  });
  return doc;
}

module.exports = { ledgerDoc };
