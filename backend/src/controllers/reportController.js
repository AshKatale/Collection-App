const { parseDateOnly, todayISO, monthName, fyLabel } = require('../utils/helpers');
const { dailyData, monthlyData, yearlyData, customerData, TYPES } = require('../services/reportData');
const excel = require('../utils/excelBuilder');
const pdf = require('../utils/pdfBuilder');

const fail = (res, status, message) => res.status(status).json({ success: false, message });

/* ── query parsing (shared by JSON + export endpoints) ───────── */

const parseMonthYear = (q) => {
  const month = Number.parseInt(q.month, 10);
  const year = Number.parseInt(q.year, 10);
  if (!(month >= 1 && month <= 12) || !(year >= 2000 && year <= 9999)) return null;
  return { month, year };
};

const parseFy = (q) => {
  const fy = Number.parseInt(q.fy, 10);
  return fy >= 2000 && fy <= 9999 ? fy : null;
};

const parseType = (q) => {
  const type = q.type || q.entryType || '';
  if (!type) return { type: undefined };
  return TYPES.includes(type) ? { type } : { error: 'Invalid type' };
};

const parseRange = (q) => {
  const out = {};
  for (const key of ['from', 'to']) {
    if (q[key]) {
      if (!parseDateOnly(q[key])) return { error: `${key} must be YYYY-MM-DD` };
      out[key] = q[key];
    }
  }
  return out;
};

const TYPE_LABEL = excel.TYPE_LABEL;

/* ── JSON endpoints ─────────────────────────────────────────── */

const dailyReport = async (req, res) => {
  try {
    const date = req.query.date || todayISO();
    if (!parseDateOnly(date)) return fail(res, 400, 'date must be YYYY-MM-DD');
    return res.json({ success: true, data: await dailyData(req.user, date) });
  } catch (err) {
    console.error('Daily report error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

const monthlyReport = async (req, res) => {
  try {
    const my = parseMonthYear(req.query);
    if (!my) return fail(res, 400, 'month (1-12) and year are required');
    const t = parseType(req.query);
    if (t.error) return fail(res, 400, t.error);
    return res.json({ success: true, data: await monthlyData(req.user, my.month, my.year, t.type) });
  } catch (err) {
    console.error('Monthly report error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

const yearlyReport = async (req, res) => {
  try {
    const fy = parseFy(req.query);
    if (!fy) return fail(res, 400, 'fy query param is required (start year, e.g. 2025)');
    const t = parseType(req.query);
    if (t.error) return fail(res, 400, t.error);
    return res.json({ success: true, data: await yearlyData(req.user, fy, t.type) });
  } catch (err) {
    console.error('Yearly report error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

const customerReport = async (req, res) => {
  try {
    const customerId = req.params.id || req.query.id || req.query.customerId;
    if (!customerId) return fail(res, 400, 'customerId is required');
    const range = parseRange(req.query);
    if (range.error) return fail(res, 400, range.error);
    const result = await customerData(req.user, customerId, range.from, range.to);
    if (result.status) return fail(res, result.status, result.message);
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('Customer report error:', err);
    return fail(res, 500, 'Internal server error');
  }
};

/* ── Export (Excel / PDF) ───────────────────────────────────── */

/**
 * GET /api/reports/export?report=daily|monthly|yearly|customer&format=xlsx|pdf
 *   daily    : date
 *   monthly  : month, year, [type]   (no type => Total + one sheet/section per type)
 *   yearly   : fy, [type]
 *   customer : id, [from], [to]
 */
const exportReport = async (req, res) => {
  try {
    const { report, format = 'xlsx' } = req.query;
    if (!['xlsx', 'pdf'].includes(format)) return fail(res, 400, 'format must be xlsx or pdf');

    const sendXlsx = async (wb, filename) => {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await wb.xlsx.write(res);
      res.end();
    };

    if (report === 'daily') {
      const date = req.query.date || todayISO();
      if (!parseDateOnly(date)) return fail(res, 400, 'date must be YYYY-MM-DD');
      const data = await dailyData(req.user, date);
      return format === 'pdf'
        ? pdf.sendPdf(res, pdf.dailyDoc(data), `Daily_${date}.pdf`)
        : sendXlsx(excel.buildDailyWorkbook(data), `Daily_${date}.xlsx`);
    }

    if (report === 'monthly') {
      const my = parseMonthYear(req.query);
      if (!my) return fail(res, 400, 'month (1-12) and year are required');
      const t = parseType(req.query);
      if (t.error) return fail(res, 400, t.error);

      const wanted = t.type ? [t.type] : [undefined, ...TYPES];
      const sections = await Promise.all(
        wanted.map(async (type) => ({
          label: type ? TYPE_LABEL[type] : 'Total (All Types)',
          data: await monthlyData(req.user, my.month, my.year, type),
        }))
      );
      const base = `Monthly_${monthName(my.month)}_${my.year}${t.type ? `_${t.type}` : ''}`;
      return format === 'pdf'
        ? pdf.sendPdf(res, pdf.monthlyDoc(sections), `${base}.pdf`)
        : sendXlsx(excel.buildMonthlyWorkbook(sections), `${base}.xlsx`);
    }

    if (report === 'yearly') {
      const fy = parseFy(req.query);
      if (!fy) return fail(res, 400, 'fy is required');
      const t = parseType(req.query);
      if (t.error) return fail(res, 400, t.error);

      const wanted = t.type ? [t.type] : [undefined, ...TYPES];
      const sections = await Promise.all(
        wanted.map(async (type) => ({
          label: type ? TYPE_LABEL[type] : 'Total (All Types)',
          data: await yearlyData(req.user, fy, type),
        }))
      );
      const base = `Yearly_FY${fyLabel(fy)}${t.type ? `_${t.type}` : ''}`;
      return format === 'pdf'
        ? pdf.sendPdf(res, pdf.yearlyDoc(sections), `${base}.pdf`)
        : sendXlsx(excel.buildYearlyWorkbook(sections), `${base}.xlsx`);
    }

    if (report === 'customer') {
      const customerId = req.query.id || req.query.customerId;
      if (!customerId) return fail(res, 400, 'id is required');
      const range = parseRange(req.query);
      if (range.error) return fail(res, 400, range.error);
      const result = await customerData(req.user, customerId, range.from, range.to);
      if (result.status) return fail(res, result.status, result.message);
      const base = `Customer_${result.customer.accountNo}`;
      return format === 'pdf'
        ? pdf.sendPdf(res, pdf.customerDoc(result), `${base}.pdf`)
        : sendXlsx(excel.buildCustomerWorkbook(result), `${base}.xlsx`);
    }

    return fail(res, 400, 'report must be daily, monthly, yearly or customer');
  } catch (err) {
    console.error('Export report error:', err);
    if (!res.headersSent) return fail(res, 500, 'Internal server error');
    res.end();
  }
};

module.exports = { dailyReport, monthlyReport, yearlyReport, customerReport, exportReport };
