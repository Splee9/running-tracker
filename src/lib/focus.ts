/**
 * Inbound selection for `/training`, `/miles`, and `/training/chicago`.
 * Parsers only. They do not load a page's JSON.
 */

import { parseISODay, weekMonday } from "./week.ts";

export type FocusSport = "run" | "bike" | "all";
export type FocusHorizon = "short" | "medium" | "long";
export type FocusRange = "12wk" | "26wk" | "52wk" | "2yr" | "all";

const SPORTS: readonly FocusSport[] = ["run", "bike", "all"];
const HORIZONS: readonly FocusHorizon[] = ["short", "medium", "long"];
const RANGES: readonly FocusRange[] = ["12wk", "26wk", "52wk", "2yr", "all"];

/** Weeks in each preset. `null` is the full series. Matches `DATE_RANGES`. */
const RANGE_WEEKS: Record<FocusRange, number | null> = {
  "12wk": 12,
  "26wk": 26,
  "52wk": 52,
  "2yr": 104,
  all: null,
};

export interface TrainingQuery {
  /** Monday `YYYY-MM-DD`, or null when `week` is missing or not a Monday. */
  week: string | null;
  sport: FocusSport;
  horizon: FocusHorizon;
  range: FocusRange;
  hours: boolean;
}

function oneOf<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return raw != null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** Monday from `?week=`. A Wednesday or a block-local number (`21`) is null. */
export function readWeekMonday(search: string): string | null {
  const day = parseISODay(new URLSearchParams(search).get("week"));
  if (!day || weekMonday(day) !== day) return null;
  return day;
}

/** Unknown values fall back to run, medium, 52 weeks, hours off. */
export function readTrainingQuery(search: string): TrainingQuery {
  const params = new URLSearchParams(search);
  return {
    week: readWeekMonday(search),
    sport: oneOf(params.get("sport"), SPORTS, "run"),
    horizon: oneOf(params.get("horizon"), HORIZONS, "medium"),
    range: oneOf(params.get("range"), RANGES, "52wk"),
    hours: params.get("hours") === "1",
  };
}

function shiftISO(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Smallest preset at least as wide as `preferred` whose window contains `sunday`.
 * The cutoff matches the chart: `lastSunday` minus N×7 days, inclusive.
 * A Sunday after the series stays on `preferred` (widening cannot reveal it).
 */
export function widenDateRange(sunday: string, preferred: FocusRange, lastSunday: string): FocusRange {
  if (sunday > lastSunday) return preferred;
  const start = Math.max(0, RANGES.indexOf(preferred));
  for (const id of RANGES.slice(start)) {
    const weeks = RANGE_WEEKS[id];
    if (weeks == null) return id;
    if (sunday >= shiftISO(lastSunday, -weeks * 7)) return id;
  }
  return "all";
}

/**
 * Year chip from `?year=`. `lifetime` and unknown values (including a year
 * that is not on the log) stay on lifetime.
 */
export function readMilesYear(search: string, years: readonly number[]): number | "lifetime" {
  const raw = new URLSearchParams(search).get("year");
  if (raw == null || raw === "" || raw === "lifetime") return "lifetime";
  if (!/^\d{4}$/.test(raw)) return "lifetime";
  const year = Number(raw);
  return years.includes(year) ? year : "lifetime";
}
