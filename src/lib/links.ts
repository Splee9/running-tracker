/**
 * Cross-tab hrefs. Week links use `from`/`to`, never `?q=` with an ISO date:
 * the lookup parser splits hyphens and reads a year.
 */

import { parseISODay, weekMonday, weekSunday, yearOf } from "./week.ts";

/** Lookup sport chip. Training's "all" omits this. */
export type LookupSport = "run" | "ride";

/** Inclusive Monday–Sunday on Lookup. `isoDay` may be any day in the week. */
export function lookupWeekHref(isoDay: string, sport?: LookupSport | null): string | null {
  const from = weekMonday(isoDay);
  const to = from ? weekSunday(from) : null;
  if (!from || !to) return null;
  const params = new URLSearchParams();
  params.set("from", from);
  params.set("to", to);
  if (sport) params.set("sport", sport);
  return `/activity-lookup?${params.toString()}`;
}

/** Calendar year on Lookup. `?q=2024` is the existing year parse. */
export function lookupYearHref(year: number): string {
  return `/activity-lookup?q=${year}`;
}

/**
 * Training page focused on a week. `horizon` is set when the chip names one
 * (Lookup always says 12-week / medium). Omitted, the page keeps its default.
 */
export function trainingWeekHref(
  isoDay: string,
  sport: "run" | "bike" | "all" = "run",
  horizon?: "short" | "medium" | "long",
): string | null {
  const week = weekMonday(isoDay);
  if (!week) return null;
  const params = new URLSearchParams();
  params.set("week", week);
  params.set("sport", sport);
  if (horizon) params.set("horizon", horizon);
  return `/training?${params.toString()}`;
}

/** Chicago weekly bar for the Monday of `isoDay`. */
export function chicagoWeekHref(isoDay: string): string | null {
  const week = weekMonday(isoDay);
  if (!week) return null;
  return `/training/chicago?week=${week}`;
}

/** Miles page for a calendar year. The page reads `year`. */
export function milesYearHref(isoDayOrYear: string | number): string | null {
  const year = typeof isoDayOrYear === "number" ? isoDayOrYear : yearOf(isoDayOrYear);
  if (year == null) return null;
  return `/miles?year=${year}`;
}

/**
 * One logged race's public session. The day window plus a distance word narrows
 * the list. `race` is `date|distance` from the miles log so Lookup can open the
 * matching activity without joining the two JSON files.
 */
export function lookupRaceHref(date: string, distanceQuery: string, raceKey: string): string | null {
  const day = parseISODay(date);
  if (!day || !distanceQuery || !raceKey) return null;
  const params = new URLSearchParams();
  params.set("from", day);
  params.set("to", day);
  params.set("sport", "run");
  params.set("q", distanceQuery);
  params.set("race", raceKey);
  return `/activity-lookup?${params.toString()}`;
}

/** Runs in one calendar month on Lookup. `ym` is `YYYY-MM`. */
export function lookupMonthHref(ym: string): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) return null;
  const last = new Date(Date.UTC(+match[1], +match[2], 0)).getUTCDate();
  const params = new URLSearchParams();
  params.set("from", `${ym}-01`);
  params.set("to", `${ym}-${String(last).padStart(2, "0")}`);
  params.set("sport", "run");
  return `/activity-lookup?${params.toString()}`;
}
