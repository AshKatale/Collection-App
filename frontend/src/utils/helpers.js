const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 1234567.5 -> ₹12,34,567.50 (Indian digit grouping; whole numbers have no decimals) */
export function formatMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '₹0';
  const num = Number(n);
  const abs = Math.abs(num);
  const hasPaise = Math.round(abs * 100) % 100 !== 0;
  const text = abs.toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `₹${num < 0 ? '-' : ''}${text}`;
}

/** Number without the rupee sign, '' for zero (used inside report grids). */
export function formatNum(n) {
  if (!n) return '';
  const hasPaise = Math.round(Math.abs(Number(n)) * 100) % 100 !== 0;
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/** Financial-year start year for a date: Jan-Mar belong to the previous FY. */
export function fyStart(date) {
  const d = date ? new Date(date) : new Date();
  return d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear();
}

export function fyLabel(year) {
  return `${year}-${String(year + 1).slice(-2)}`;
}

/** "2026-11-09" (or an ISO timestamp) -> "09-Nov-2026". Pure string work: no time-zone shifts. */
export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}-${MONTH_SHORT[Number(m) - 1]}-${y}`;
}

export function daysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

/** Today as YYYY-MM-DD in the browser's local time. */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Shift a YYYY-MM-DD date by N days. */
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Year choices that follow the calendar: 2024 … next year. */
export function yearOptions(from = 2024) {
  const last = new Date().getFullYear() + 1;
  return Array.from({ length: last - from + 1 }, (_, i) => from + i);
}

/** Collision-safe id for idempotent requests (offline replays, retries). */
export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const FY_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
export const FY_MONTH_NUMBERS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

export const TYPE_LABELS = { SAVINGS: 'Savings', LOAN: 'Loan repayment', INTEREST: 'Interest' };
/** Badge colours per entry type (dark-mode friendly through the global overrides). */
export const TYPE_BADGE = {
  SAVINGS: 'bg-emerald-50 text-emerald-700',
  LOAN: 'bg-blue-50 text-blue-700',
  INTEREST: 'bg-amber-50 text-amber-700',
};

/** Pull a readable message out of an axios error. */
export function errorMessage(err, fallback = 'Something went wrong') {
  if (err?.response?.data?.message) return err.response.data.message;
  if (!err?.response && err?.code === 'ERR_NETWORK') return 'No connection to the server';
  return err?.message || fallback;
}
