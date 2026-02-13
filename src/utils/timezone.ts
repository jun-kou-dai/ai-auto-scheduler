// JST (Asia/Tokyo, UTC+9) timezone utility
// This app targets Japanese users; all date logic must use JST
// regardless of the system/browser timezone setting.

const JST_TZ = 'Asia/Tokyo';

const pad2 = (n: number) => String(n).padStart(2, '0');

interface JSTComponents {
  year: number;
  month: number;   // 0-based (0=Jan, 1=Feb, ...)
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
}

/** Get current date/time components in JST */
function getJSTComponents(): JSTComponents {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: JST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '0';
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: parseInt(get('year')),
    month: parseInt(get('month')) - 1,
    day: parseInt(get('day')),
    hours: parseInt(get('hour')),
    minutes: parseInt(get('minute')),
    seconds: parseInt(get('second')),
    dayOfWeek: wdMap[get('weekday')] ?? 0,
  };
}

/**
 * Create a proper UTC Date from JST year/month/day/hour/min/sec.
 * month is 0-based (0=Jan). Handles overflow (e.g. day=32 rolls to next month).
 */
export function jstToDate(
  year: number, month: number, day: number,
  hours = 0, minutes = 0, seconds = 0,
): Date {
  // Date.UTC handles overflow; subtract 9h to convert JST→UTC
  const utcMs = Date.UTC(year, month, day, hours, minutes, seconds) - 9 * 3600000;
  return new Date(utcMs);
}

/**
 * Get "now" in JST with useful derived values.
 */
export function nowJST() {
  const c = getJSTComponents();
  const todayISO = `${c.year}-${pad2(c.month + 1)}-${pad2(c.day)}`;
  return {
    ...c,
    /** Actual current time as Date */
    date: new Date(),
    /** Start of today in JST (midnight JST) as a proper UTC Date */
    startOfDay: jstToDate(c.year, c.month, c.day),
    /** ISO date string for today in JST: "YYYY-MM-DD" */
    todayISO,
  };
}

/**
 * Add days to a JST date and return new {year, month, day} components.
 * Handles month/year rollovers correctly via Date.UTC arithmetic.
 * month is 0-based.
 */
export function jstAddDays(year: number, month: number, day: number, days: number) {
  const d = new Date(Date.UTC(year, month, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

/**
 * Format {year, month, day} to "YYYY-MM-DD". month is 0-based.
 */
export function toISODateString(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

/**
 * Parse a datetime string (from AI output) as JST.
 * - "2026-02-14T09:00:00"  → appends +09:00
 * - "2026-02-14"           → midnight JST
 * - Already has offset/Z   → parsed as-is
 */
export function parseAsJST(s: string): Date {
  if (/[Z+-]\d{2}:?\d{2}$/.test(s) || s.endsWith('Z')) {
    return new Date(s);
  }
  if (s.includes('T')) {
    return new Date(s + '+09:00');
  }
  return new Date(s + 'T00:00:00+09:00');
}
