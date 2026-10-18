/**
 * Calendar dates for the operations team, who work on WIB (Asia/Jakarta, UTC+7).
 * Never use toISOString() for a "today" or range default: between 00:00 and 07:00 WIB
 * it returns the previous day.
 */
const JAKARTA_TZ = 'Asia/Jakarta';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: JAKARTA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** The Jakarta calendar date of the given instant, as YYYY-MM-DD */
export function jakartaDate(instant: Date = new Date()): string {
  return formatter.format(instant);
}

/**
 * Every calendar date from `from` to `to` inclusive, as YYYY-MM-DD.
 * Pure date arithmetic (UTC, no time zone shift), so the list is exact for the given strings.
 */
export function eachDate(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const dates: string[] = [];
  if (Number.isNaN(start) || Number.isNaN(end)) return dates;
  for (let t = start; t <= end; t += 24 * 60 * 60 * 1000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

/** The calendar date `days` days after `date` (negative goes back), as YYYY-MM-DD. Pure date arithmetic. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The Jakarta calendar date `days` days before now, as YYYY-MM-DD */
export function jakartaDaysAgo(days: number): string {
  return jakartaDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a real calendar date in YYYY-MM-DD form.
 * The round-trip check rejects rollover dates such as 2026-02-31, which Date.parse accepts.
 */
export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}
