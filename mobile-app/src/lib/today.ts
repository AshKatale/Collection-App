import { isoOf } from './format';

let timezone = 'Asia/Kolkata';
export const setAppTimezone = (tz?: string | null) => {
  if (tz) timezone = tz;
};

/**
 * "Today" in the business time zone (same as the server's APP_TIMEZONE), so a collector whose phone
 * is set to another zone still records the date the server will accept. Falls back to the phone's date.
 */
export function todayISO(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (/^\d{4}-\d{2}-\d{2}$/.test(parts)) return parts;
  } catch {
    /* Intl / time zone unavailable */
  }
  return isoOf(new Date());
}
