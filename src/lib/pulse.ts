import type { Activity } from "./activitySearch.ts";

// Same rule as isRun in activitySearch.ts, repeated so Home doesn't pull in the search module.
const isRun = (a: Activity) => /Run$/.test(a.sport_type);

/** GET /api/activities: every public activity. */
export type ActivitySource = {
  /** When this list was read: the live download time, or the build's export time. */
  exported_at: string | null;
  source: "live" | "snapshot";
  /** Newest first, with offline standout grades merged in. */
  activities: Activity[];
};

/** GET /api/pulse: the newest public activities, newest first. */
export type Pulse = {
  exported_at: string | null;
  source: "live" | "snapshot";
  recent: Activity[];
};

export const PULSE_ENDPOINT = "/api/pulse";

const METERS_PER_MILE = 1609.344;
const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" for a Date in the viewer's calendar. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Days between two "YYYY-MM-DD" dates (b − a), with no timezone drift. */
export function daysBetween(a: string, b: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** Monday of the week that contains `now`, as "YYYY-MM-DD". Matches the Chicago tracker's weeks. */
export function weekStart(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDay(d);
}

export function latestRun(recent: Activity[]): Activity | undefined {
  return recent.find(isRun);
}

export type WeekSoFar = { start: string; miles: number; runs: number; longest: number };

/** Run miles since Monday. start_date_local is the athlete's wall clock, so compare dates as text. */
export function runWeekSoFar(recent: Activity[], now: Date): WeekSoFar {
  const start = weekStart(now);
  const runs = recent.filter((a) => isRun(a) && a.start_date_local.slice(0, 10) >= start);
  const miles = runs.map((a) => a.distance_m / METERS_PER_MILE);
  return {
    start,
    miles: miles.reduce((sum, m) => sum + m, 0),
    runs: runs.length,
    longest: miles.length ? Math.max(...miles) : 0,
  };
}

/** "today", "yesterday", "3 days ago", then a date. */
export function relativeDay(startDateLocal: string, now: Date): string {
  const days = daysBetween(startDateLocal.slice(0, 10), isoDay(now));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const [y, m, d] = startDateLocal.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function miles(distanceM: number): number {
  return distanceM / METERS_PER_MILE;
}

/** Seconds per mile → "6:42". */
export function pacePerMile(a: Activity): string | null {
  if (a.distance_m <= 0 || a.moving_time_s <= 0) return null;
  const s = Math.round(a.moving_time_s / miles(a.distance_m));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Seconds → "42:10" or "1:42:10". */
export function formatMoving(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
