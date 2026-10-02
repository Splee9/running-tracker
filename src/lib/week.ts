/**
 * Monday–Sunday weeks in calendar dates, with no clock and no timezone shift.
 * Chicago stores the Monday (`weekStart`). Training variability stores the Sunday
 * (`week_end`). Lookup filters an inclusive `YYYY-MM-DD` window. Callers convert.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DayWindow = { start: string; end: string };

/** A real `YYYY-MM-DD`, or null. `2026-02-31` is null. */
export function parseISODay(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = ISO_DAY.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function shiftISODay(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Monday of the Monday–Sunday week that contains `isoDay`. */
export function weekMonday(isoDay: string): string | null {
  const day = parseISODay(isoDay);
  if (!day) return null;
  const [year, month, date] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  return shiftISODay(day, delta);
}

/** Sunday that closes the Monday–Sunday week containing `isoDay`. */
export function weekSunday(isoDay: string): string | null {
  const monday = weekMonday(isoDay);
  return monday ? shiftISODay(monday, 6) : null;
}

/** `{ from, to }` for a Monday. Any other day returns null. */
export function weekWindow(monday: string): { from: string; to: string } | null {
  const day = parseISODay(monday);
  if (!day || weekMonday(day) !== day) return null;
  return { from: day, to: shiftISODay(day, 6) };
}

export function yearOf(isoDay: string): number | null {
  const day = parseISODay(isoDay);
  return day ? Number(day.slice(0, 4)) : null;
}

/**
 * Inclusive machine window from URL `from` / `to`.
 * `from` is required. A missing `to` is the Sunday of `from`'s week.
 * Reversed bounds are swapped. An invalid `from` drops the window.
 */
export function machineWindow(fromRaw: string | null, toRaw: string | null): DayWindow | null {
  const from = parseISODay(fromRaw);
  if (!from) return null;
  const to = parseISODay(toRaw) ?? weekSunday(from);
  if (!to) return null;
  if (to < from) return { start: to, end: from };
  return { start: from, end: to };
}

/** Intersection. A result with `start > end` matches nothing. */
export function intersectWindows(a: DayWindow | null, b: DayWindow | null): DayWindow | null {
  if (!a) return b;
  if (!b) return a;
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  return { start, end };
}

/** `start_date_local` (or any string with a `YYYY-MM-DD` prefix) inside an inclusive window. */
export function inDayWindow(isoTimestamp: string, window: DayWindow): boolean {
  const day = isoTimestamp.slice(0, 10);
  return day >= window.start && day <= window.end;
}
