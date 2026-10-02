/**
 * The miles-log race catalog. `data.json` only — activities stay on Lookup.
 */

import { data } from "./data.ts";
import { buildLoggedRaces, findRace, type LoggedRace } from "./races.ts";

export const loggedRaces: LoggedRace[] = buildLoggedRaces(data.raceEvents, data.marathonResults);

export function raceByKey(key: string | null | undefined): LoggedRace | undefined {
  return findRace(loggedRaces, key);
}
