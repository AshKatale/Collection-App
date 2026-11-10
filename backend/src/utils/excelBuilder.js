/**
 * Excel exports laid out like the paper/Excel ledger:
 *   title row, then  Sr | Account | Customer | (days or months) | Total,
 *   one row per customer, and a total row at the bottom.
 */
const ExcelJS = require('exceljs');
const { monthName, displayDate, fyLabel } = require('./helpers');

const ORG_NAME = process.env.ORG_NAME || 'Siddhivinayak Mandal';
const TYPE_LABEL = { SAVINGS: 'Savings', LOAN: 'Loan Repayment', INTEREST: 'Interest' };

const FILL = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const HEADER_FILL = FILL('FF1F6F5C');
const SUNDAY_FILL = FILL('FFC2410C');
const TOTAL_FILL = FILL('FFE8F3EF');
const ZEBRA_FILL = FILL('FFF8FAF9');
const BORDER = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
};
// Indian digit grouping (12,34,567). Zero cells are written as empty cells, so no zero section is needed.
const INR_FMT = '[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0';
// Same grouping, with paise - used only for cells that really have paise (e.g. 100.50)
const INR_FMT_PAISE = '[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00';
const moneyFmt = (v) => (typeof v === 'number' && Math.round(Math.abs(v) * 100) % 100 !== 0 ? INR_FMT_PAISE : INR_FMT);

function titleRows(ws, title, subtitle, lastCol) {
  ws.mergeCells(1, 1, 1, lastCol);
  ws.mergeCells(2, 1, 2, lastCol);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 14, color: { argb: 'FF1F6F5C' } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { size: 11, color: { argb: 'FF475569' } };
  s.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;
  ws.getRow(2).height = 18;
}

function styleHeader(row, sundayCols = new Set()) {
  row.eachCell((cell, col) => {
    cell.fill = sundayCols.has(col) ? SUNDAY_FILL : HEADER_FILL;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.border = BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  row.height = 22;
}

function styleData(row, idx, firstNumCol) {
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.border = BORDER;
    if (idx % 2 === 1) cell.fill = ZEBRA_FILL;
    if (col >= firstNumCol) {
      cell.numFmt = moneyFmt(cell.value);
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else {
      cell.alignment = { vertical: 'middle' };
    }
  });
}

function styleTotal(row, firstNumCol) {
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.fill = TOTAL_FILL;
    cell.font = { bold: true };
    cell.border = { ...BORDER, top: { style: 'medium', color: { argb: 'FF1F6F5C' } } };
    if (col >= firstNumCol) {
      cell.numFmt = moneyFmt(cell.value);
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    }
  });
  row.height = 22;
}

const sheetName = (s) => String(s).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);

function newBook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = ORG_NAME;
  wb.created = new Date();
  return wb;
}

/* ── Daily ─────────────────────────────────────────────────── */

function buildDailyWorkbook(data) {
  const wb = newBook();
  const ws = wb.addWorksheet(sheetName(`Daily ${displayDate(data.date)}`), {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 6 },
    { width: 12 },
    { width: 34 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ];
  titleRows(ws, ORG_NAME, `Daily Collection – ${displayDate(data.date)}`, 7);

  styleHeader(ws.addRow(['Sr', 'Account No', 'Customer Name', 'Savings', 'Loan', 'Interest', 'Total']));
  data.rows.forEach((r, i) => {
    const row = ws.addRow([
      r.sr,
      r.accountNo,
      r.customerName,
      r.savings || null,
      r.loan || null,
      r.interest || null,
      r.total || null,
    ]);
    styleData(row, i, 4);
    row.getCell(1).alignment = { horizontal: 'center' };
  });
  const g = data.grandTotals;
  styleTotal(ws.addRow(['', '', 'Total', g.savings, g.loan, g.interest, g.total]), 4);

  if (data.collectors.length) {
    ws.addRow([]);
    const head = ws.addRow(['', '', 'Collector-wise', 'Savings', 'Loan', 'Interest', 'Total']);
    styleHeader(head);
    data.collectors.forEach((c, i) => {
      const row = ws.addRow(['', '', c.collectorName, c.savings || null, c.loan || null, c.interest || null, c.total]);
      styleData(row, i, 4);
    });
    styleTotal(ws.addRow(['', '', 'Total', g.savings, g.loan, g.interest, g.total]), 4);
  }
  return wb;
}

/* ── Monthly (customer x day) ──────────────────────────────── */

function addMonthlySheet(wb, data, label) {
  const ws = wb.addWorksheet(sheetName(label), {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 3 }],
    pageSetup: { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const { totalDays, month, year } = data;
  const lastCol = 3 + totalDays + 1;

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 11;
  ws.getColumn(3).width = 30;
  for (let d = 1; d <= totalDays; d++) ws.getColumn(3 + d).width = 8.5;
  ws.getColumn(lastCol).width = 14;

  titleRows(ws, ORG_NAME, `${label} – ${monthName(month)} ${year}`, lastCol);

  const sundayCols = new Set();
  const header = ['Sr', 'Account No', 'Customer Name'];
  for (let d = 1; d <= totalDays; d++) {
    header.push(d);
    if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === 0) sundayCols.add(3 + d);
  }
  header.push('Total');
  styleHeader(ws.addRow(header), sundayCols);

  data.rows.forEach((r, i) => {
    const vals = [r.sr, r.accountNo, r.customerName];
    for (let d = 1; d <= totalDays; d++) vals.push(r.dayTotals[d] || null);
    vals.push(r.total || null);
    const row = ws.addRow(vals);
    styleData(row, i, 4);
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(lastCol).font = { bold: true };
  });

  const tot = ['', '', 'Total'];
  for (let d = 1; d <= totalDays; d++) tot.push(data.grandTotals[d] || null);
  tot.push(data.grandTotals.total);
  styleTotal(ws.addRow(tot), 4);
}

function buildMonthlyWorkbook(sections) {
  const wb = newBook();
  sections.forEach(({ label, data }) => addMonthlySheet(wb, data, label));
  return wb;
}

/* ── Yearly (customer x month) ─────────────────────────────── */

function buildYearlyWorkbook(sections) {
  const wb = newBook();
  sections.forEach(({ label, data }) => {
    const ws = wb.addWorksheet(sheetName(`${label} ${fyLabel(data.fy)}`), {
      views: [{ state: 'frozen', xSplit: 3, ySplit: 3 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const lastCol = 3 + data.months.length + 1;
    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 11;
    ws.getColumn(3).width = 30;
    data.months.forEach((_, i) => (ws.getColumn(4 + i).width = 12));
    ws.getColumn(lastCol).width = 15;

    titleRows(ws, ORG_NAME, `${label} – Financial Year ${fyLabel(data.fy)} (Apr–Mar)`, lastCol);
    styleHeader(
      ws.addRow([
        'Sr',
        'Account No',
        'Customer Name',
        ...data.months.map((m) => `${monthName(m.month)} ${String(m.year).slice(-2)}`),
        'Total',
      ])
    );
    data.rows.forEach((r, i) => {
      const row = ws.addRow([
        r.sr,
        r.accountNo,
        r.customerName,
        ...data.months.map((m) => r.monthTotals[m.month] || null),
        r.total || null,
      ]);
      styleData(row, i, 4);
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(lastCol).font = { bold: true };
    });
    styleTotal(
      ws.addRow(['', '', 'Total', ...data.months.map((m) => data.grandTotals[m.month] || null), data.grandTotals.total]),
      4
    );
  });
  return wb;
}

/* ── Customer ledger ───────────────────────────────────────── */

function buildCustomerWorkbook(data) {
  const wb = newBook();
  const ws = wb.addWorksheet(sheetName(`${data.customer.accountNo} ${data.customer.name}`), {
    views: [{ state: 'frozen', ySplit: 3 }],
  });
  ws.columns = [{ width: 6 }, { width: 14 }, { width: 18 }, { width: 16 }, { width: 24 }, { width: 30 }];
  const range = data.from || data.to ? `${data.from ? displayDate(data.from) : '…'} to ${data.to ? displayDate(data.to) : '…'}` : 'All dates';
  titleRows(ws, ORG_NAME, `${data.customer.accountNo} · ${data.customer.name} – ${range}`, 6);
  styleHeader(ws.addRow(['Sr', 'Date', 'Type', 'Amount', 'Collector', 'Notes']));
  data.entries.forEach((e, i) => {
    const row = ws.addRow([i + 1, displayDate(e.date), TYPE_LABEL[e.type], e.amount, e.collectorName, e.notes || '']);
    styleData(row, i, 99);
    row.getCell(4).numFmt = moneyFmt(e.amount);
    row.getCell(4).alignment = { horizontal: 'right' };
    row.getCell(1).alignment = { horizontal: 'center' };
  });
  ws.addRow([]);
  [['Savings', data.totals.savings], ['Loan Repayment', data.totals.loan], ['Interest', data.totals.interest], ['Total', data.totals.total]].forEach(
    ([k, v], i) => {
      const row = ws.addRow(['', '', k, v]);
      row.getCell(3).font = { bold: true };
      row.getCell(4).numFmt = moneyFmt(v);
      if (i === 3) styleTotal(row, 4);
    }
  );
  return wb;
}

module.exports = {
  ORG_NAME,
  TYPE_LABEL,
  buildDailyWorkbook,
  buildMonthlyWorkbook,
  buildYearlyWorkbook,
  buildCustomerWorkbook,
};
