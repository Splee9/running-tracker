/**
 * Week → medium-horizon band. Loaded with a dynamic import the first time a
 * Lookup row expands, so the ~370 KB series stays out of the lookup chunk.
 */

import raw from "../training-variability.json";
import { tvBandFrom, type TvBandResult, type TvBandSource } from "./crosslink.ts";

const tv = raw as TvBandSource;

export type TvBandChip = TvBandResult;

/**
 * Medium / 12-week band for the Sunday of `isoDay`.
 * `allowPending` is false for sports that only borrow the All series: no point means no chip.
 */
export function tvBandChip(isoDay: string, sport: "run" | "bike" | "all", allowPending = true): TvBandChip {
  return tvBandFrom(tv, isoDay, sport, allowPending);
}
