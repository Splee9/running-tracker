/**
 * Opens a logged race's public session from Lookup's own activity list.
 * The miles log names the race (`date|distance`). This file does not write
 * that id back into `data.json`, and the log never reads `activities.json`.
 */

import { findRace, type LoggedRace, type RaceDistance } from "./races.ts";
import { matchesPrimary, type LabeledActivity } from "./stimulus.ts";

/** Same windows as Lookup's race distance tags. */
const TARGET: Record<RaceDistance, { km: number; tol: number; codes: readonly string[] }> = {
  "5K": { km: 5, tol: 0.3, codes: ["5k"] },
  "10K": { km: 10, tol: 0.4, codes: ["10k"] },
  half: { km: 21.1, tol: 0.6, codes: ["hm", "half"] },
  marathon: { km: 42.2, tol: 1, codes: ["m", "marathon"] },
};

export interface RaceSessionCandidate extends LabeledActivity {
  id: number;
  sport_type: string;
  start_date_local: string;
  distance_m: number;
}

function isRun(sportType: string): boolean {
  return /Run$/.test(sportType);
}

function kmOf(meters: number): number {
  return meters / 1000;
}

function within(km: number, spec: { km: number; tol: number }): boolean {
  return Math.abs(km - spec.km) <= spec.tol;
}

function recordMatches(activity: RaceSessionCandidate, spec: (typeof TARGET)[RaceDistance]): boolean {
  const code = activity.race?.distance?.toLowerCase();
  if (code && spec.codes.includes(code)) return true;
  const official = activity.race?.official_distance_m;
  return official != null && within(kmOf(official), spec);
}

function closest(activities: RaceSessionCandidate[], spec: (typeof TARGET)[RaceDistance]): RaceSessionCandidate {
  return activities.reduce((best, activity) => {
    const delta = Math.abs(kmOf(activity.distance_m) - spec.km);
    const bestDelta = Math.abs(kmOf(best.distance_m) - spec.km);
    return delta < bestDelta ? activity : best;
  });
}

/**
 * The public run for this logged race, or null when Lookup has no race-shaped
 * session that day (empty export, private race, or only a shakeout).
 */
export function raceSessionId(
  activities: readonly RaceSessionCandidate[],
  key: string | null | undefined,
  races: readonly LoggedRace[],
): number | null {
  const race = findRace(races, key);
  if (!race) return null;
  const spec = TARGET[race.distance];
  const sameDay = activities.filter(
    (activity) => isRun(activity.sport_type) && activity.start_date_local.slice(0, 10) === race.date,
  );
  if (sameDay.length === 0) return null;

  const recorded = sameDay.filter((activity) => recordMatches(activity, spec));
  if (recorded.length === 1) return recorded[0].id;
  if (recorded.length > 1) return closest(recorded, spec).id;

  const labeled = sameDay.filter(
    (activity) => matchesPrimary(activity, "race") && within(kmOf(activity.distance_m), spec),
  );
  if (labeled.length === 1) return labeled[0].id;
  if (labeled.length > 1) return closest(labeled, spec).id;
  return null;
}

/** An explicit `?activity=` wins. Otherwise open the logged race, when one matches. */
export function sessionToOpen(
  explicitId: number | null,
  activities: readonly RaceSessionCandidate[],
  raceParam: string | null,
  races: readonly LoggedRace[],
): number | null {
  return explicitId ?? raceSessionId(activities, raceParam, races);
}
