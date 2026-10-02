// Logged-race links. The miles feed is read as data, not imported, so this
// stays off activities.json. Run: node --experimental-strip-types test-races.mjs

import { readFileSync } from "node:fs";
import {
  buildLoggedRaces,
  findRace,
  raceKey,
  raceSessionHref,
  raceWeekHref,
  raceYearHref,
  relatedRaceGroups,
} from "./src/lib/races.ts";
import { raceSessionId, sessionToOpen } from "./src/lib/raceSession.ts";

const miles = JSON.parse(readFileSync(new URL("./src/data.json", import.meta.url), "utf8"));
const loggedRaces = buildLoggedRaces(miles.raceEvents, miles.marathonResults);

function raceByKey(key) {
  return findRace(loggedRaces, key);
}

let failed = 0;

function check(name, pass, detail = "") {
  if (pass) {
    console.log(`ok  ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function group(race, id) {
  return relatedRaceGroups(race, loggedRaces).find((item) => item.id === id);
}

function dates(races) {
  return (races ?? []).map((race) => race.date);
}

const indy = raceByKey("2025-11-08|marathon");
const pig = raceByKey("2022-05-01|marathon");
const first10k = raceByKey("2019-06-15|10K");
const turkey = raceByKey("2025-11-27|10K");

check("marathon names join on the date", indy?.name === "Indy Marathon" && indy?.pr === true && indy?.seconds === 9956);
check("a 10K stays unnamed", turkey?.name == null && turkey?.pr === false);
check("the catalog is every race event", loggedRaces.length === 14, String(loggedRaces.length));

const indyDistance = dates(group(indy, "distance")?.races);
check(
  "same distance stays on marathons",
  indyDistance.includes("2022-05-01") &&
    indyDistance.includes("2024-10-13") &&
    !indyDistance.includes("2025-11-27") &&
    !indyDistance.includes("2025-11-08"),
  indyDistance.join(","),
);
const indyYear = dates(group(indy, "year")?.races);
check(
  "same year is the other 2025 races",
  indyYear.includes("2025-09-06") && indyYear.includes("2025-11-27") && indyYear.includes("2025-05-03") && !indyYear.includes("2024-10-13"),
  indyYear.join(","),
);
const indyPrs = group(indy, "pr")?.races ?? [];
check(
  "PRs are the other marathon personal records",
  indyPrs.every((race) => race.pr && race.distance === "marathon") &&
    dates(indyPrs).includes("2025-05-03") &&
    dates(indyPrs).includes("2022-10-16") &&
    dates(indyPrs).includes("2023-11-12") &&
    !dates(indyPrs).includes("2024-10-13") &&
    !dates(indyPrs).includes("2025-11-08"),
  dates(indyPrs).join(","),
);
check("series steps to the previous marathon and stops", dates(group(indy, "series")?.races).join(",") === "2025-05-03");
check("the first marathon's series is only the next one", dates(group(pig, "series")?.races).join(",") === "2022-10-16");
check("a 10K has no PR group", group(first10k, "pr") == null && dates(group(first10k, "series")?.races).join(",") === "2019-10-27");

check(
  "the session href is that day, runs, the distance word, and the race key",
  raceSessionHref(indy) ===
    "/activity-lookup?from=2025-11-08&to=2025-11-08&sport=run&q=marathon&race=2025-11-08%7Cmarathon",
  raceSessionHref(indy) ?? "",
);
check(
  "a half uses the half-marathon word",
  raceSessionHref(raceByKey("2025-09-06|half"))?.includes("q=half+marathon") === true &&
    raceSessionHref(raceByKey("2025-09-06|half"))?.includes("race=2025-09-06%7Chalf") === true,
);
check(
  "the week link is the Monday–Sunday that already exists",
  raceWeekHref(indy) === "/activity-lookup?from=2025-11-03&to=2025-11-09&sport=run",
  raceWeekHref(indy) ?? "",
);
check("the year link is the existing year query", raceYearHref(indy) === "/activity-lookup?q=2025");

function run(overrides) {
  return {
    sport_type: "Run",
    distance_m: 5000,
    workout_type: null,
    ...overrides,
  };
}

const indyDay = [
  run({ id: 1, name: "shakeout", start_date_local: "2025-11-08T06:30:00", distance_m: 5000, primary_stimulus: "easy" }),
  run({
    id: 2,
    name: "Indy Marathon",
    start_date_local: "2025-11-08T08:00:00",
    distance_m: 42195,
    workout_type: 1,
    primary_stimulus: "race",
    race: { distance: "m", event_name: "Indy Marathon", is_pr: true },
  }),
];
check("the race record opens, not the shakeout", raceSessionId(indyDay, raceKey(indy), loggedRaces) === 2);

check(
  "a long run at marathon distance is not treated as the race",
  raceSessionId(
    [run({ id: 3, start_date_local: "2025-11-08T08:00:00", distance_m: 42195, primary_stimulus: "long" })],
    raceKey(indy),
    loggedRaces,
  ) === null,
);

check(
  "a short GPS still opens when the race record says 10k",
  raceSessionId(
    [run({ id: 9, start_date_local: "2024-11-28T08:00:00", distance_m: 8000, race: { distance: "10k" } })],
    "2024-11-28|10K",
    loggedRaces,
  ) === 9,
);

check(
  "a race-labeled run at the distance opens when the export has no race record",
  raceSessionId(
    [run({ id: 4, start_date_local: "2022-06-18T08:00:00", distance_m: 10000, primary_stimulus: "race" })],
    "2022-06-18|10K",
    loggedRaces,
  ) === 4,
);

check("an unknown race key opens nothing", raceSessionId(indyDay, "1999-01-01|marathon", loggedRaces) === null);
check("an empty activity list opens nothing", raceSessionId([], raceKey(indy), loggedRaces) === null);
check(
  "a ride that day is ignored",
  raceSessionId(
    [run({ id: 5, sport_type: "Ride", start_date_local: "2025-11-08T08:00:00", distance_m: 42195, primary_stimulus: "race" })],
    raceKey(indy),
    loggedRaces,
  ) === null,
);
check("an explicit activity id wins over the race key", sessionToOpen(77, indyDay, raceKey(indy), loggedRaces) === 77);
check("without an activity id the race key is used", sessionToOpen(null, indyDay, raceKey(indy), loggedRaces) === 2);

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall race link checks passed");
