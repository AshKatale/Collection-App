/**
 * Server-side PDF exports (pdfmake) with an embedded Noto Sans Devanagari font,
 * so Marathi customer names and the rupee sign render correctly.
 */
const path = require('path');
const PdfPrinter = require('pdfmake');
const { monthName, displayDate, fyLabel } = require('./helpers');
const { ORG_NAME, TYPE_LABEL } = require('./excelBuilder');

const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
const printer = new PdfPrinter({
  // Latin letters, digits, rupee sign
  Noto: {
    normal: path.join(FONT_DIR, 'NotoSans-Regular.ttf'),
    bold: path.join(FONT_DIR, 'NotoSans-Bold.ttf'),
    italics: path.join(FONT_DIR, 'NotoSans-Regular.ttf'),
    bolditalics: path.join(FONT_DIR, 'NotoSans-Bold.ttf'),
  },
  // Marathi / Hindi (Devanagari) - this font has no Latin glyphs, so it is only used for Devanagari runs
  NotoDev: {
    normal: path.join(FONT_DIR, 'NotoSansDevanagari-Regular.ttf'),
    bold: path.join(FONT_DIR, 'NotoSansDevanagari-Bold.ttf'),
    italics: path.join(FONT_DIR, 'NotoSansDevanagari-Regular.ttf'),
    bolditalics: path.join(FONT_DIR, 'NotoSansDevanagari-Bold.ttf'),
  },
});

// A run of Devanagari characters (spaces between Devanagari words stay in the same run)
const DEV = '[\u0900-\u097F\u200C\u200D]';
const DEV_RUN = new RegExp(`${DEV}+(?:[ ]+${DEV}+)*`, 'g');
const HAS_DEV = new RegExp(DEV);

/** "A-12 मिंटू" -> ["A-12 ", {text:"मिंटू", font:"NotoDev"}] so each script uses a font that has its glyphs. */
function splitScripts(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(DEV_RUN)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ text: m[0], font: 'NotoDev' });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Walk a pdfmake definition and apply splitScripts to every text string containing Devanagari. */
function applyScriptFonts(node) {
  if (Array.isArray(node)) return node.forEach(applyScriptFonts);
  if (!node || typeof node !== 'object') return;
  if (node.font === 'NotoDev') return; // already a Devanagari run
  if (typeof node.text === 'string' && HAS_DEV.test(node.text)) {
    node.text = splitScripts(node.text);
    return; // segments are final
  }
  Object.entries(node).forEach(([key, v]) => {
    if (key !== 'layout' && v && typeof v === 'object') applyScriptFonts(v);
  });
}

const GREEN = '#1F6F5C';
const LIGHT = '#E8F3EF';

/** 1234567 -> 12,34,567 ; 0/null -> '' */
const inr = (n) => {
  if (!n) return '';
  const hasPaise = Math.round(Math.abs(Number(n)) * 100) % 100 !== 0;
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: hasPaise ? 2 : 0, maximumFractionDigits: 2 });
};

const th = (text, extra = {}) => ({
  text: String(text),
  bold: true,
  color: '#FFFFFF',
  fillColor: GREEN,
  alignment: 'center',
  ...extra,
});
const td = (text, extra = {}) => ({ text: text === undefined || text === null ? '' : String(text), ...extra });
const money = (n, extra = {}) => td(inr(n), { alignment: 'right', ...extra });
const totalCell = (text, extra = {}) => td(text, { bold: true, fillColor: LIGHT, ...extra });

const layout = {
  hLineWidth: () => 0.4,
  vLineWidth: () => 0.4,
  hLineColor: () => '#CBD5E1',
  vLineColor: () => '#CBD5E1',
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};

function baseDoc({ title, subtitle, content, orientation = 'portrait', pageSize = 'A4', fontSize = 9 }) {
  return {
    pageSize,
    pageOrientation: orientation,
    pageMargins: [20, 24, 20, 28],
    defaultStyle: { font: 'Noto', fontSize },
    info: { title: `${ORG_NAME} – ${subtitle}`, author: ORG_NAME },
    content: [
      { text: title, fontSize: fontSize + 6, bold: true, color: GREEN, alignment: 'center' },
      { text: subtitle, fontSize: fontSize + 2, color: '#475569', alignment: 'center', margin: [0, 2, 0, 8] },
      ...content,
    ],
    footer: (page, pages) => ({
      columns: [
        { text: `Generated ${new Date().toLocaleString('en-IN', { timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata' })}`, fontSize: 7, color: '#94A3B8', margin: [20, 0, 0, 0] },
        { text: `Page ${page} of ${pages}`, fontSize: 7, color: '#94A3B8', alignment: 'right', margin: [0, 0, 20, 0] },
      ],
    }),
  };
}

/* ── Daily ─────────────────────────────────────────────────── */

function dailyDoc(data) {
  const g = data.grandTotals;
  const body = [
    [th('Sr'), th('Account'), th('Customer Name', { alignment: 'left' }), th('Savings'), th('Loan'), th('Interest'), th('Total')],
    ...data.rows.map((r) => [
      td(r.sr, { alignment: 'center' }),
      td(r.accountNo),
      td(r.customerName),
      money(r.savings),
      money(r.loan),
      money(r.interest),
      money(r.total, { bold: true }),
    ]),
    [
      totalCell(''),
      totalCell(''),
      totalCell('Total'),
      money(g.savings, { bold: true, fillColor: LIGHT }),
      money(g.loan, { bold: true, fillColor: LIGHT }),
      money(g.interest, { bold: true, fillColor: LIGHT }),
      money(g.total, { bold: true, fillColor: LIGHT }),
    ],
  ];
  const content = [
    { table: { headerRows: 1, widths: [22, 48, '*', 56, 56, 56, 62], body }, layout },
  ];
  if (data.collectors.length) {
    content.push({ text: 'Collector-wise', bold: true, color: GREEN, margin: [0, 12, 0, 4] });
    content.push({
      table: {
        headerRows: 1,
        widths: ['*', 56, 56, 56, 62],
        body: [
          [th('Collector', { alignment: 'left' }), th('Savings'), th('Loan'), th('Interest'), th('Total')],
          ...data.collectors.map((c) => [td(c.collectorName), money(c.savings), money(c.loan), money(c.interest), money(c.total, { bold: true })]),
        ],
      },
      layout,
    });
  }
  return baseDoc({ title: ORG_NAME, subtitle: `Daily Collection – ${displayDate(data.date)}`, content });
}

/* ── Monthly ───────────────────────────────────────────────── */

function monthlySections(sections) {
  return sections.map(({ label, data }, idx) => {
    const { totalDays, month, year } = data;
    const days = Array.from({ length: totalDays }, (_, i) => i + 1);
    const isSunday = (d) => new Date(Date.UTC(year, month - 1, d)).getUTCDay() === 0;

    const body = [
      [
        th('Sr', { fontSize: 6 }),
        th('Customer Name', { alignment: 'left', fontSize: 6.5 }),
        ...days.map((d) => th(d, { fontSize: 6, fillColor: isSunday(d) ? '#C2410C' : GREEN })),
        th('Total', { fontSize: 6.5 }),
      ],
      ...data.rows.map((r) => [
        td(r.sr, { alignment: 'center', fontSize: 6 }),
        td(`${r.accountNo} · ${r.customerName}`, { fontSize: 6.5 }),
        ...days.map((d) => money(r.dayTotals[d], { fontSize: 6 })),
        money(r.total, { bold: true, fontSize: 6.5 }),
      ]),
      [
        totalCell('', { fontSize: 6 }),
        totalCell('Total', { fontSize: 6.5 }),
        ...days.map((d) => money(data.grandTotals[d], { bold: true, fillColor: LIGHT, fontSize: 6 })),
        money(data.grandTotals.total, { bold: true, fillColor: LIGHT, fontSize: 6.5 }),
      ],
    ];
    return [
      {
        text: `${label} – ${monthName(month)} ${year}`,
        bold: true,
        fontSize: 11,
        color: GREEN,
        margin: [0, 0, 0, 4],
        pageBreak: idx > 0 ? 'before' : undefined,
      },
      { table: { headerRows: 1, widths: [14, 118, ...days.map(() => 25), 44], body }, layout },
    ];
  });
}

function monthlyDoc(sections) {
  const { month, year } = sections[0].data;
  return baseDoc({
    title: ORG_NAME,
    subtitle: `Monthly Collection Sheet – ${monthName(month)} ${year}`,
    content: monthlySections(sections).flat(),
    orientation: 'landscape',
    pageSize: 'A3',
    fontSize: 8,
  });
}

/* ── Yearly ────────────────────────────────────────────────── */

function yearlyDoc(sections) {
  const content = sections.flatMap(({ label, data }, idx) => {
    const body = [
      [
        th('Sr'),
        th('Customer Name', { alignment: 'left' }),
        ...data.months.map((m) => th(`${monthName(m.month)} ${String(m.year).slice(-2)}`)),
        th('Total'),
      ],
      ...data.rows.map((r) => [
        td(r.sr, { alignment: 'center' }),
        td(`${r.accountNo} · ${r.customerName}`),
        ...data.months.map((m) => money(r.monthTotals[m.month])),
        money(r.total, { bold: true }),
      ]),
      [
        totalCell(''),
        totalCell('Total'),
        ...data.months.map((m) => money(data.grandTotals[m.month], { bold: true, fillColor: LIGHT })),
        money(data.grandTotals.total, { bold: true, fillColor: LIGHT }),
      ],
    ];
    return [
      { text: label, bold: true, fontSize: 11, color: GREEN, margin: [0, 0, 0, 4], pageBreak: idx > 0 ? 'before' : undefined },
      { table: { headerRows: 1, widths: [18, 130, ...data.months.map(() => 50), 62], body }, layout },
    ];
  });
  return baseDoc({
    title: ORG_NAME,
    subtitle: `Yearly Collection – Financial Year ${fyLabel(sections[0].data.fy)}`,
    content,
    orientation: 'landscape',
    pageSize: 'A4',
    fontSize: 7,
  });
}

/* ── Customer ledger ───────────────────────────────────────── */

function customerDoc(data) {
  const range = data.from || data.to ? `${data.from ? displayDate(data.from) : '…'} to ${data.to ? displayDate(data.to) : '…'}` : 'All dates';
  const body = [
    [th('Sr'), th('Date'), th('Type'), th('Amount'), th('Collector', { alignment: 'left' }), th('Notes', { alignment: 'left' })],
    ...data.entries.map((e, i) => [
      td(i + 1, { alignment: 'center' }),
      td(displayDate(e.date), { alignment: 'center' }),
      td(TYPE_LABEL[e.type]),
      money(e.amount),
      td(e.collectorName),
      td(e.notes || ''),
    ]),
  ];
  const t = data.totals;
  const content = [
    { table: { headerRows: 1, widths: [22, 60, 70, 60, 90, '*'], body }, layout },
    { text: 'Totals', bold: true, color: GREEN, margin: [0, 12, 0, 4] },
    {
      table: {
        widths: [120, 80],
        body: [
          [td('Savings'), money(t.savings)],
          [td('Loan Repayment'), money(t.loan)],
          [td('Interest'), money(t.interest)],
          [totalCell('Total'), money(t.total, { bold: true, fillColor: LIGHT })],
        ],
      },
      layout,
    },
  ];
  return baseDoc({ title: ORG_NAME, subtitle: `${data.customer.accountNo} · ${data.customer.name} – ${range}`, content });
}

/** Stream a pdfmake definition to an Express response. */
function sendPdf(res, docDefinition, filename) {
  applyScriptFonts(docDefinition.content);
  const doc = printer.createPdfKitDocument(docDefinition);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  doc.end();
}

module.exports = { dailyDoc, monthlyDoc, yearlyDoc, customerDoc, sendPdf };
