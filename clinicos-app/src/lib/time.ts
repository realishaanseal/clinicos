/**
 * The clinic's clock.
 *
 * On the clinic computer the machine's own time zone is the clinic's, and that
 * is what these use when NEXT_PUBLIC_CLINIC_TIMEZONE is unset — exactly the
 * behaviour from before this file existed. Online the server runs on UTC (and
 * Vercel does not let TZ be changed), so the zone is named explicitly:
 * `Asia/Kolkata`. Without it, every visit before 05:30 in India would be filed
 * under yesterday, and every time on screen would be five and a half hours off.
 *
 * No Node imports: client components format times with this too, so the page
 * rendered on the server and the page in the browser print the same thing.
 */

export const CLINIC_TIMEZONE: string | undefined = process.env.NEXT_PUBLIC_CLINIC_TIMEZONE?.trim() || undefined;

const pad = (n: number) => String(n).padStart(2, "0");

/** The clinic's calendar date, YYYY-MM-DD. Stored timestamps are UTC ISO
 *  strings; "today" has to mean the clinic's today. */
export function localDay(d = new Date()): string {
  if (!CLINIC_TIMEZONE) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const p = zonedParts(d, CLINIC_TIMEZONE);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Start and end of the clinic's day, as UTC ISO strings for comparing against
 *  stored timestamps. */
export function localDayBounds(d = new Date()): [string, string] {
  if (!CLINIC_TIMEZONE) {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return [start.toISOString(), end.toISOString()];
  }
  const p = zonedParts(d, CLINIC_TIMEZONE);
  return [
    zonedMidnight(p.year, p.month, p.day, CLINIC_TIMEZONE).toISOString(),
    zonedMidnight(p.year, p.month, p.day + 1, CLINIC_TIMEZONE).toISOString(),
  ];
}

/** The clinic's calendar date `offset` days from today, as a Date at noon in the
 *  clinic's zone — safe to format with fmt() without slipping a day. */
export function clinicDayAt(offset: number, from = new Date()): Date {
  if (!CLINIC_TIMEZONE) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset, 12);
    return d;
  }
  const p = zonedParts(from, CLINIC_TIMEZONE);
  return new Date(zonedMidnight(p.year, p.month, p.day + offset, CLINIC_TIMEZONE).getTime() + 12 * 3600_000);
}

/** toLocaleString in the clinic's zone. Same options as the built-in. */
export function fmt(d: Date | string | number, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(d).toLocaleString("en-IN", { ...opts, timeZone: CLINIC_TIMEZONE });
}

export function fmtDate(d: Date | string | number, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(d).toLocaleDateString("en-IN", { ...opts, timeZone: CLINIC_TIMEZONE });
}

export function fmtTime(d: Date | string | number, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(d).toLocaleTimeString("en-IN", { ...opts, timeZone: CLINIC_TIMEZONE });
}

// ------------------------------------------------------------------ zones
type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function zonedParts(d: Date, timeZone: string): Parts {
  const out: Record<string, number> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return out as Parts;
}

/** The UTC instant of 00:00 on a calendar date in a zone. Day overflow (31 + 1)
 *  rolls over the way Date.UTC does. */
function zonedMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const wall = Date.UTC(year, month - 1, day);
  let t = wall;
  // Twice, so a zone that changes its offset near midnight still lands right.
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(t), timeZone);
    const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
    t = wall - offset;
  }
  return new Date(t);
}
