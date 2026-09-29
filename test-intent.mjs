// Intent, distance-band sort, and describeActivity checks.
// Run: node --experimental-strip-types test-intent.mjs

import { buildIndex, classifyIntent, describeActivity, searchActivities } from "./src/lib/activitySearch.ts";
import { toActivity } from "./scripts/strava-activity.mjs";

const testClock = new Date("2026-09-29T12:00:00-05:00");

function act(overrides) {
  return {
    name: `activity ${overrides.id}`,
    sport_type: "Run",
    elevation_gain_m: 0,
    workout_type: null,
    trainer: false,
    ...overrides,
  };
}

const activities = [
  act({ id: 1, name: "shakeout", start_date_local: "2026-06-01T08:00:00", distance_m: 2000, moving_time_s: 400 }),
  act({ id: 2, name: "short 10k clock", start_date_local: "2026-05-02T08:00:00", distance_m: 9800, moving_time_s: 2300 }),
  act({ id: 3, name: "long 10k pace", start_date_local: "2026-05-03T08:00:00", distance_m: 10300, moving_time_s: 2400 }),
  act({ id: 4, name: "steady 10k", start_date_local: "2026-04-01T08:00:00", distance_m: 10000, moving_time_s: 2600 }),
  act({ id: 5, name: "old 10k", start_date_local: "2024-04-01T08:00:00", distance_m: 10000, moving_time_s: 1800 }),
  act({ id: 6, name: "ride 10k", sport_type: "Ride", start_date_local: "2026-05-01T08:00:00", distance_m: 10000, moving_time_s: 1200 }),
  act({ id: 7, name: "this year marathon", start_date_local: "2026-02-01T08:00:00", distance_m: 42200, moving_time_s: 11000 }),
  act({ id: 8, name: "2024 ultra", start_date_local: "2024-01-15T08:00:00", distance_m: 50000, moving_time_s: 18000 }),
  act({ id: 9, name: "this year long run", start_date_local: "2026-07-01T08:00:00", distance_m: 35000, moving_time_s: 12000 }),
  act({ id: 10, name: "half", start_date_local: "2026-03-01T08:00:00", distance_m: 21100, moving_time_s: 5400 }),
  act({ id: 11, name: "faster marathon", start_date_local: "2025-10-13T08:00:00", distance_m: 42195, moving_time_s: 10000 }),
  act({ id: 12, name: "2024 long", start_date_local: "2024-06-01T08:00:00", distance_m: 30000, moving_time_s: 11000 }),
  act({ id: 13, name: "5k steady", start_date_local: "2026-08-01T08:00:00", distance_m: 5000, moving_time_s: 1500 }),
  act({ id: 14, name: "20k quicker pace", start_date_local: "2026-08-02T08:00:00", distance_m: 20000, moving_time_s: 5000 }),
  act({ id: 15, name: "Chicago 10k A", start_date_local: "2026-05-10T08:00:00", distance_m: 9800, moving_time_s: 2400, place: "Chicago" }),
  act({ id: 16, name: "Chicago 10k B", start_date_local: "2026-05-11T08:00:00", distance_m: 10300, moving_time_s: 2500, place: "Chicago" }),
  act({ id: 17, name: "50k race", start_date_local: "2026-08-20T08:00:00", distance_m: 50000, moving_time_s: 14000 }),
  act({ id: 18, name: "50km ride", sport_type: "Ride", start_date_local: "2026-08-21T08:00:00", distance_m: 50000, moving_time_s: 5000 }),
];

const index = buildIndex(activities);

let failures = 0;

function check(name, pass, detail) {
  console.log(`${pass ? "✅" : "❌"} ${name}`);
  if (!pass) {
    failures++;
    if (detail) console.log(`   ${detail}`);
  }
}

function sameWindow(actual, expected) {
  if (expected === null) return actual === null;
  return actual?.start === expected.start && actual?.end === expected.end;
}

console.log("Intent classification:\n");

const classTests = [
  ["longest run", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: null, band: null }],
  ["most intervals", { isDeterministic: true, kind: "most_intervals", dateWindow: null, band: null }],
  ["Chicago races", { isDeterministic: true, kind: "place_filter", place: "chicago", filterType: "race", dateWindow: null, band: null }],
  ["longest run this year", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2026-01-01", end: "2026-09-29" }, band: null }],
  ["longest run 2024", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2024-01-01", end: "2024-12-31" }, band: null }],
  ["longest run in 2024", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2024-01-01", end: "2024-12-31" }, band: null }],
  ["most intervals last year", { isDeterministic: true, kind: "most_intervals", dateWindow: { start: "2025-01-01", end: "2025-12-31" }, band: null }],
  ["Chicago races 2025", { isDeterministic: true, kind: "place_filter", place: "chicago", filterType: "race", dateWindow: { start: "2025-01-01", end: "2025-12-31" }, band: null }],
  ["longest run ytd", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2026-01-01", end: "2026-09-29" }, band: null }],
  ["longest run this month", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2026-09-01", end: "2026-09-29" }, band: null }],
  ["longest run march 2024", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2024-03-01", end: "2024-03-31" }, band: null }],
  ["longest run last 3 months", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2026-06-29", end: "2026-09-29" }, band: null }],
  ["last week", { isDeterministic: true, kind: "list", dateWindow: { start: "2026-09-14", end: "2026-09-20" }, band: null }],
  ["last week's activities", { isDeterministic: true, kind: "list", dateWindow: { start: "2026-09-14", end: "2026-09-20" }, band: null }],
  ["this week runs", { isDeterministic: true, kind: "list", sport: "run", dateWindow: { start: "2026-09-28", end: "2026-09-29" }, band: null }],
  ["top 20 min power this year", { isDeterministic: true, kind: "mmp_power", field: "best_watts_20m", dateWindow: { start: "2026-01-01", end: "2026-09-29" }, band: null }],
  ["best 5 min watts 2024", { isDeterministic: true, kind: "mmp_power", field: "best_watts_5m", dateWindow: { start: "2024-01-01", end: "2024-12-31" }, band: null }],
  ["highest power this year", { isDeterministic: true, kind: "highest_power", dateWindow: { start: "2026-01-01", end: "2026-09-29" }, band: null }],
  ["fastest 10k this year", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: { start: "2026-01-01", end: "2026-09-29" }, band: "10k" }],
  ["fastest marathon", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: null, band: "marathon" }],
  ["fastest half marathon", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: null, band: "half" }],
  ["fastest 13.1 miles", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: null, band: "half" }],
  ["fastest 15 km", { isDeterministic: true, kind: "fastest", dateWindow: null, band: "numeric", label: "15 km" }],
  ["fastest 50k", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: null, band: "numeric", label: "50 km" }],
  ["longest run last year", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2025-01-01", end: "2025-12-31" }, band: null }],
  ["10k this year", { isDeterministic: false, kind: null, dateWindow: { start: "2026-01-01", end: "2026-09-29" }, band: null }],
];

for (const [query, expected] of classTests) {
  const result = classifyIntent(query, testClock);
  let pass = result.isDeterministic === expected.isDeterministic && (result.intent?.kind ?? null) === expected.kind;
  if (expected.sport !== undefined && result.intent?.sport !== expected.sport) pass = false;
  if (expected.place !== undefined && result.intent?.place !== expected.place) pass = false;
  if (expected.filterType !== undefined && result.intent?.filterType !== expected.filterType) pass = false;
  if (expected.field !== undefined && result.intent?.field !== expected.field) pass = false;
  if (!sameWindow(result.dateWindow, expected.dateWindow)) pass = false;
  if (expected.band !== undefined && (result.distanceBand?.kind ?? null) !== expected.band) pass = false;
  if (expected.label !== undefined && result.distanceBand?.label !== expected.label) pass = false;
  const detail = pass
    ? ""
    : `got deterministic=${result.isDeterministic} kind=${result.intent?.kind ?? "null"} sport=${result.intent?.sport ?? "-"} band=${result.distanceBand?.kind ?? "null"} label=${result.distanceBand?.label ?? "-"} window=${result.dateWindow ? `${result.dateWindow.start}..${result.dateWindow.end}` : "null"} remaining=${result.remainingTokens.join(",")}`;
  check(`"${query}"`, pass, detail);
}

console.log("\nSort order:\n");

function ids(query) {
  return searchActivities(index, query, 50, testClock).map((hit) => hit.activity.id);
}

function order(name, query, expected, absent = []) {
  const got = ids(query);
  const head = got.slice(0, expected.length);
  const pass = expected.every((id, i) => head[i] === id) && absent.every((id) => !got.includes(id));
  check(name, pass, pass ? "" : `got [${got.join(", ")}], want head [${expected.join(", ")}] absent [${absent.join(", ")}]`);
}

// 9800m/2300s beats 10300m/2400s on time and loses on pace. Time order is required.
order("fastest 10k this year sorts by time inside the band", "fastest 10k this year", [2, 3, 15, 16, 4], [1, 5, 6, 7, 13]);
order("fastest marathon sorts by moving time", "fastest marathon", [11, 7], [2, 10, 13]);
order("longest run this year sorts by distance after the date window", "longest run this year", [17, 7, 9], [8, 6, 5]);
order("longest run 2024 keeps the date window ahead of distance", "longest run 2024", [8, 12, 5], [7, 9]);
order("fastest run without a band still sorts by pace", "fastest run", [5], []);

const unbanded = ids("fastest run");
check(
  "unbanded fastest ranks quicker pace ahead of shorter time",
  unbanded.indexOf(14) !== -1 && unbanded.indexOf(13) !== -1 && unbanded.indexOf(14) < unbanded.indexOf(13),
  `got [${unbanded.join(", ")}]`,
);

order("fastest 10k chicago keeps time order inside the keyword set", "fastest 10k chicago", [15, 16], [2, 6]);
order("fastest 50k stays on runs and sorts by time", "fastest 50k", [17, 8], [18]);

console.log("\ndescribeActivity:\n");

const marathon = describeActivity(
  act({
    id: 99,
    name: "Chicago Marathon",
    start_date_local: "2024-10-13T08:00:00Z",
    distance_m: 42195,
    moving_time_s: 11700,
    elevation_gain_m: 80,
    workout_type: 1,
    description: "Race day\nperfect weather.",
  }),
  testClock,
);
const marathonDays = Math.round((Date.UTC(2026, 8, 29) - Date.UTC(2024, 9, 13)) / 86_400_000);
check("describeActivity includes year", marathon.includes("year 2024"), marathon);
check("describeActivity includes days ago", marathon.includes(`${marathonDays} days ago`), marathon);
check("describeActivity includes run pace", marathon.includes("7:26 /mi"), marathon);
check("describeActivity includes description", marathon.includes("description: Race day perfect weather."), marathon);

const ride = describeActivity(
  act({
    id: 98,
    name: "evening ride",
    sport_type: "Ride",
    start_date_local: "2026-09-28T08:00:00",
    distance_m: 40000,
    moving_time_s: 3600,
  }),
  testClock,
);
check("describeActivity days-ago for a recent ride", ride.includes("year 2026") && ride.includes("1 day ago"), ride);
check("describeActivity omits run pace on rides", !ride.includes("/mi"), ride);
check("describeActivity omits an empty description", !ride.includes("description:"), ride);

const blankNotes = describeActivity(
  act({
    id: 97,
    name: "easy",
    start_date_local: "2026-09-29T08:00:00",
    distance_m: 8000,
    moving_time_s: 2400,
    description: "   \n  ",
  }),
  testClock,
);
check("describeActivity drops whitespace-only descriptions", !blankNotes.includes("description:"), blankNotes);
check("describeActivity says today for a same-day run", blankNotes.includes("today"), blankNotes);

const longNote = "x".repeat(600);
const clipped = describeActivity(
  act({
    id: 96,
    name: "note",
    start_date_local: "2026-01-01T08:00:00",
    distance_m: 5000,
    moving_time_s: 1500,
    description: longNote,
  }),
  testClock,
);
const notes = clipped.split("description: ")[1] ?? "";
check("describeActivity caps long descriptions", notes.endsWith("...") && notes.length <= 500, `notes length ${notes.length}`);

console.log("\nexport mapping:\n");

const mapped = toActivity({
  id: 1,
  name: "loop",
  sport_type: "Run",
  start_date_local: "2026-01-01T00:00:00Z",
  distance: 5000,
  moving_time: 1200,
  total_elevation_gain: 10,
  workout_type: null,
  trainer: false,
  description: "  hilly loop  ",
  map: { summary_polyline: "secret" },
  start_latlng: [41.8, -87.6],
});
check("toActivity keeps a trimmed description", mapped.description === "hilly loop", JSON.stringify(mapped));
check("toActivity drops GPS fields", mapped.map === undefined && mapped.start_latlng === undefined, JSON.stringify(mapped));

const mappedBlank = toActivity({
  id: 2,
  name: "loop",
  type: "Run",
  start_date_local: "2026-01-02T00:00:00Z",
  description: "   ",
});
check("toActivity omits a blank description", !("description" in mappedBlank), JSON.stringify(mappedBlank));

console.log();
if (failures === 0) {
  console.log("✅ All tests pass!");
  process.exit(0);
}
console.log(`❌ ${failures} test${failures === 1 ? "" : "s"} failed`);
process.exit(1);
