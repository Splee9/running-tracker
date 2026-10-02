/**
 * Lookup expand chips that point at the other tabs.
 * Chicago (~14 KB) and the miles log (~12 KB) are eager.
 * The variability series is not imported here; the panel loads it on expand.
 */

import { contextChips, lookupTvSport, type ContextChip } from "./crosslink.ts";
import { data } from "./chicago-data.ts";
import { data as miles, marathonResults } from "./data.ts";

export { lookupTvSport };
export type SessionChip = ContextChip;

/** Chicago phase, miles year, and races in the same Monday–Sunday. No TV band. */
export function sessionChips(input: { start_date_local: string; race?: unknown }): SessionChip[] {
  return contextChips(input, {
    phases: data.phases,
    weeks: data.weeks,
    years: miles.years.map((year) => year.year),
    raceEvents: miles.raceEvents,
    marathonResults,
  });
}
