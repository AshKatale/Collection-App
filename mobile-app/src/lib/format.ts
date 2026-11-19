/** Pure string / number helpers. No Intl: identical results on every device. */

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const FY_MONTH_NUMBERS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

/** 1234567.5 -> "12,34,567.50" (Indian digit grouping; whole numbers have no decimals) */
export function groupIndian(n: number, forceDecimals = false): string {
  const abs = Math.abs(n);
  const paise = Math.round(abs * 100);
  const whole = Math.floor(paise / 100);
  const frac = paise % 100;
  let s = String(whole);
  if (s.length > 3) {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    s = `${rest},${last3}`;
  }
  if (frac !== 0 || forceDecimals) s += `.${String(frac).padStart(2, '0')}`;
  return n < 0 && paise !== 0 ? `-${s}` : s;
}

export function formatMoney(n: unknown): string {
  const v = Number(n);
  if (n === null || n === undefined || Number.isNaN(v)) return '₹0';
  return `₹${groupIndian(v)}`;
}

/** Number without the rupee sign, '' for zero (used inside report grids). */
export function formatNum(n: unknown): string {
  const v = Number(n);
  return !v ? '' : groupIndian(v);
}

/** "2026-11-09" (or ISO timestamp) -> "09-Nov-2026". */
export function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}-${MONTH_SHORT[Number(m) - 1]}-${y}`;
}

export function formatDateTime(ts?: number | string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${MONTH_SHORT[d.getMonth()]}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** Local calendar date of a JS Date as YYYY-MM-DD. */
export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Shift a YYYY-MM-DD date by N days (pure calendar math, no time-zone drift). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}

/** Day of week of a YYYY-MM-DD date: 0 = Sunday ... 1 = Monday */
export function dayOfWeek(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Monday collections are double the usual amount. */
export const isMonday = (iso: string) => dayOfWeek(iso) === 1;

export function daysInMonth(month: number, year: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function fyStart(date = new Date()): number {
  return date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear();
}
export const fyLabel = (y: number) => `${y}-${String(y + 1).slice(-2)}`;

export function yearOptions(from = 2024): number[] {
  const last = new Date().getFullYear() + 1;
  return Array.from({ length: last - from + 1 }, (_, i) => from + i);
}

/** Natural ordering of account numbers: "2" < "10" < "A-3". */
export const byAccount = (a: { accountNo: string | number }, b: { accountNo: string | number }) =>
  String(a.accountNo).localeCompare(String(b.accountNo), undefined, { numeric: true, sensitivity: 'base' });

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const isValidISODate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

/** Pull a readable message out of an axios-like error. */
export function errorMessage(err: any, fallback = 'Something went wrong'): string {
  const msg = err?.response?.data?.message;
  if (typeof msg === 'string' && msg) return msg;
  if (isNetworkError(err)) return 'No connection to the server';
  return err?.message || fallback;
}

/** True when the failure means "could not reach the server" (as opposed to a server rejection). */
export function isNetworkError(err: any): boolean {
  return !!err && !err.response && (err.isAxiosError || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED' || /network|timeout/i.test(err.message || ''));
}
