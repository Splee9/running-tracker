/**
 * Races on the running log. Callers pass `raceEvents` and `marathonResults`
 * from the miles feed. This module does not import either JSON file, and it
 * does not read `activities.json`.
 */

import { lookupRaceHref, lookupWeekHref, lookupYearHref } from "./links.ts";

export type RaceDistance = "marathon" | "half" | "10K" | "5K";

export interface RaceEventInput {
  date: string;
  distance: RaceDistance;
}

export interface MarathonResultInput {
  date: string;
  name: string;
  seconds: number;
  pr: boolean;
}

export interface LoggedRace {
  /** `YYYY-MM-DD`. Together with `distance` this is the race's identity. */
  date: string;
  distance: RaceDistance;
  /** Set for marathons. Other distances are not named in this feed. */
  name: string | null;
  seconds: number | null;
  pr: boolean;
  year: number;
}

/** `pin` opens the relation list. Chart hovers highlight without rearranging the log. */
export type RaceFocus = { key: string; pin: boolean } | null;

const DISTANCE_LABEL: Record<RaceDistance, string> = {
  marathon: "Marathon",
  half: "Half",
  "10K": "10K",
  "5K": "5K",
};

const DISTANCE_QUERY: Record<RaceDistance, string> = {
  marathon: "marathon",
  half: "half marathon",
  "10K": "10k",
  "5K": "5k",
};

export const RACE_DISTANCE_COLOR: Record<RaceDistance, string> = {
  marathon: "#c0432f",
  half: "#1f7a5c",
  "10K": "#2f6db0",
  "5K": "#8a5a9e",
};

export function raceKey(race: Pick<LoggedRace, "date" | "distance">): string {
  return `${race.date}|${race.distance}`;
}

export function raceTitle(race: Pick<LoggedRace, "distance" | "name">): string {
  return race.name ?? DISTANCE_LABEL[race.distance];
}

/** Lookup `q` for this distance. A distance word, so a city in the name is not read as a place. */
export function raceDistanceQuery(distance: RaceDistance): string {
  return DISTANCE_QUERY[distance];
}

export function raceSessionHref(race: Pick<LoggedRace, "date" | "distance">): string | null {
  return lookupRaceHref(race.date, raceDistanceQuery(race.distance), raceKey(race));
}

export function raceWeekHref(race: Pick<LoggedRace, "date">): string | null {
  return lookupWeekHref(race.date, "run");
}

export function raceYearHref(race: Pick<LoggedRace, "year">): string {
  return lookupYearHref(race.year);
}

/** Join marathon names onto race events by calendar date. Other distances stay unnamed. */
export function buildLoggedRaces(
  events: readonly RaceEventInput[],
  results: readonly MarathonResultInput[] = [],
): LoggedRace[] {
  const marathons = new Map(results.map((result) => [result.date, result]));
  return events
    .map((event) => {
      const result = event.distance === "marathon" ? marathons.get(event.date) : undefined;
      const year = Number(event.date.slice(0, 4));
      return {
        date: event.date,
        distance: event.distance,
        name: result?.name ?? null,
        seconds: result?.seconds ?? null,
        pr: result?.pr === true,
        year: Number.isFinite(year) ? year : 0,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.distance.localeCompare(b.distance));
}

export function findRace(races: readonly LoggedRace[], key: string | null | undefined): LoggedRace | undefined {
  if (!key) return undefined;
  return races.find((race) => raceKey(race) === key);
}

export type RaceRelationId = "distance" | "year" | "pr" | "series";

export interface RaceRelationGroup {
  id: RaceRelationId;
  label: string;
  races: LoggedRace[];
}

function byDate(a: LoggedRace, b: LoggedRace): number {
  return a.date.localeCompare(b.date) || a.distance.localeCompare(b.distance);
}

/**
 * Other races on this log related to `race`.
 * Series is the previous and next race of the same distance — the chain the
 * charts draw — not a second copy of every race at that distance.
 * PRs exist only on marathon results. A 10K does not grow a PR group.
 */
export function relatedRaceGroups(race: LoggedRace, races: readonly LoggedRace[]): RaceRelationGroup[] {
  const key = raceKey(race);
  const others = races.filter((item) => raceKey(item) !== key);
  const sameDistance = others.filter((item) => item.distance === race.distance).sort(byDate);
  const sameYear = others.filter((item) => item.year === race.year).sort(byDate);
  const prs =
    race.distance === "marathon"
      ? others.filter((item) => item.distance === "marathon" && item.pr).sort(byDate)
      : [];
  const chain = races.filter((item) => item.distance === race.distance).sort(byDate);
  const index = chain.findIndex((item) => raceKey(item) === key);
  const series: LoggedRace[] = [];
  if (index > 0) series.push(chain[index - 1]);
  if (index >= 0 && index < chain.length - 1) series.push(chain[index + 1]);

  const groups: RaceRelationGroup[] = [];
  if (sameDistance.length > 0) groups.push({ id: "distance", label: "Same distance", races: sameDistance });
  if (sameYear.length > 0) groups.push({ id: "year", label: "Same year", races: sameYear });
  if (prs.length > 0) groups.push({ id: "pr", label: "PRs", races: prs });
  if (series.length > 0) groups.push({ id: "series", label: "Series", races: series });
  return groups;
}

/** Previous / next inside the series group. Other groups have no step label. */
export function seriesStep(race: LoggedRace, other: LoggedRace): "Previous" | "Next" | null {
  if (other.distance !== race.distance) return null;
  if (other.date < race.date) return "Previous";
  if (other.date > race.date) return "Next";
  return null;
}
