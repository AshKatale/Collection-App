/**
 * Date / money helpers.
 *
 * Entry dates are calendar dates (Postgres DATE) with no time-zone. They are
 * always handled as "YYYY-MM-DD" strings or UTC-midnight Dates so the server's
 * local time zone can never shift a day. "Today" is decided in APP_TIMEZONE.
 */

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

/** Today's calendar date in the app time zone, as YYYY-MM-DD. */
const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

/** Date (UTC midnight) -> YYYY-MM-DD */
const toISODate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

const parseDateOnly = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

const pad = (n) => String(n).padStart(2, '0');

/** Number of days in a month (1-12). */
const daysInMonth = (month, year) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** First and last day of a month as YYYY-MM-DD. */
const monthRange = (month, year) => ({
  from: `${year}-${pad(month)}-01`,
  to: `${year}-${pad(month)}-${pad(daysInMonth(month, year))}`,
});

/** First and last day of the Indian financial year starting in `startYear`. */
const fyRange = (startYear) => ({
  from: `${startYear}-04-01`,
  to: `${startYear + 1}-03-31`,
});

/** FY label e.g. "2025-26" */
const fyLabel = (startYear) => `${startYear}-${String(startYear + 1).slice(-2)}`;

/** FY month order: April(4) ... March(3) */
const FY_MONTH_NUMBERS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

const fyMonths = (startYear) =>
  FY_MONTH_NUMBERS.map((month) => ({ month, year: month >= 4 ? startYear : startYear + 1 }));

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m) => monthNames[m - 1];

/** 2026-11-09 -> 09-11-2026 */
const displayDate = (iso) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/** Validates a positive money amount with at most 2 decimals. Returns number or null. */
const parsePositiveAmount = (value) => {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1e10) return null;
  return Math.round(amount * 100) / 100;
};

/** Prisma Decimal | number | string -> JS number (2dp). */
const num = (v) => (v === null || v === undefined ? 0 : Math.round(Number(v) * 100) / 100);

const round2 = (n) => Math.round(n * 100) / 100;

/** Natural ordering of account numbers: "2" < "10" < "A-3". */
const byAccount = (a, b) =>
  String(a.accountNo).localeCompare(String(b.accountNo), undefined, { numeric: true, sensitivity: 'base' });

/** Entry row from Prisma -> plain JSON (Decimal -> number, Date -> YYYY-MM-DD). */
const serializeEntry = (e) => ({
  ...e,
  date: toISODate(e.date),
  amount: num(e.amount),
});

module.exports = {
  APP_TIMEZONE,
  todayISO,
  toISODate,
  parseDateOnly,
  daysInMonth,
  monthRange,
  fyRange,
  fyLabel,
  fyMonths,
  FY_MONTH_NUMBERS,
  monthName,
  displayDate,
  parsePositiveAmount,
  num,
  round2,
  byAccount,
  serializeEntry,
};
