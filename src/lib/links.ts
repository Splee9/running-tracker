/**
 * Cross-tab hrefs. Week links use `from`/`to`, never `?q=` with an ISO date:
 * the lookup parser splits hyphens and reads a year.
 */

import { weekMonday, weekSunday, yearOf } from "./week.ts";

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
 * Training page focused on a week. Phase 2 reads `week`; until then the URL
 * still names the Monday and the sport.
 */
export function trainingWeekHref(isoDay: string, sport: "run" | "bike" | "all" = "run"): string | null {
  const week = weekMonday(isoDay);
  if (!week) return null;
  const params = new URLSearchParams();
  params.set("week", week);
  params.set("sport", sport);
  return `/training?${params.toString()}`;
}

/** Miles page for a calendar year. Phase 2 reads `year`. */
export function milesYearHref(isoDayOrYear: string | number): string | null {
  const year = typeof isoDayOrYear === "number" ? isoDayOrYear : yearOf(isoDayOrYear);
  if (year == null) return null;
  return `/miles?year=${year}`;
}
