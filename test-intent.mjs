// Intent, distance-band sort, and describeActivity checks.
// Run: node --experimental-strip-types test-intent.mjs

import { activityFacts, applyJevIntent, buildIndex, buildJevRequest, classifyIntent, describeActivity, describeIntent, planShortlist, searchActivities, splitJevAnswers } from "./src/lib/activitySearch.ts";
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
  act({ id: 19, name: "August Chicago tempo", start_date_local: "2026-08-10T08:00:00", distance_m: 10000, moving_time_s: 2400, place: "Chicago" }),
  act({ id: 20, name: "August Chicago easy", start_date_local: "2026-08-12T08:00:00", distance_m: 10000, moving_time_s: 3600, place: "Chicago" }),
  act({ id: 21, name: "September Chicago fast", start_date_local: "2026-09-10T08:00:00", distance_m: 8000, moving_time_s: 2000, place: "Chicago" }),
  act({ id: 22, name: "August Austin fast", start_date_local: "2026-08-04T08:00:00", distance_m: 10000, moving_time_s: 2000, place: "Austin" }),
  act({ id: 23, name: "Tuesday easy", start_date_local: "2026-09-22T08:00:00", distance_m: 12000, moving_time_s: 4200 }),
  act({ id: 24, name: "Week before", start_date_local: "2026-09-15T08:00:00", distance_m: 15000, moving_time_s: 5000 }),
  act({ id: 25, name: "Chicago stride", start_date_local: "2026-08-08T08:00:00", distance_m: 800, moving_time_s: 120, place: "Chicago" }),
  act({ id: 26, name: "Chicago long", start_date_local: "2026-06-15T08:00:00", distance_m: 32000, moving_time_s: 12000, place: "Chicago" }),
  act({ id: 27, name: "Thursday run", start_date_local: "2026-09-24T08:00:00", distance_m: 10000, moving_time_s: 3600 }),
  // Name alias, no place field: "windy city" must still join the Chicago pool.
  act({ id: 28, name: "Windy City shakeout", start_date_local: "2026-06-18T08:00:00", distance_m: 8000, moving_time_s: 2000 }),
  act({ id: 29, name: "Naperville fast", start_date_local: "2026-09-05T08:00:00", distance_m: 15000, moving_time_s: 4500, place: "Naperville" }),
  act({ id: 30, name: "Monday long", start_date_local: "2026-09-28T08:00:00", distance_m: 42000, moving_time_s: 14000 }),
  act({ id: 31, name: "easy miles", start_date_local: "2026-09-01T08:00:00", distance_m: 28000, moving_time_s: 10000 }),
  // Labeled stimulus fixtures. Names disagree with the label on purpose.
  act({ id: 40, name: "Shakeout", start_date_local: "2026-09-23T08:00:00", distance_m: 12000, moving_time_s: 4500, primary_stimulus: "easy", modifiers: ["outdoor"] }),
  act({ id: 41, name: "Easy Run", start_date_local: "2026-09-26T08:00:00", distance_m: 10000, moving_time_s: 3000, primary_stimulus: "quality", modifiers: ["intervals", "outdoor"], hard_lap_count: 5, has_intervals: true }),
  act({ id: 42, name: "Test Run", start_date_local: "2026-09-21T08:00:00", distance_m: 6000, moving_time_s: 2400, primary_stimulus: "probe", modifiers: ["outdoor"] }),
  act({ id: 43, name: "Earlier easy", start_date_local: "2026-09-16T08:00:00", distance_m: 8000, moving_time_s: 3000, primary_stimulus: "easy" }),
  act({ id: 44, name: "Easy spin", sport_type: "Run", modality: "bike", start_date_local: "2026-09-23T09:00:00", distance_m: 20000, moving_time_s: 3600, primary_stimulus: "easy" }),
  act({ id: 45, name: "Unsure", start_date_local: "2026-09-27T08:00:00", distance_m: 8000, moving_time_s: 3000, primary_stimulus: "easy", modifiers: ["outdoor"], low_confidence: true }),
  act({ id: 46, name: "Morning", start_date_local: "2026-09-25T08:00:00", distance_m: 10000, moving_time_s: 3600, primary_stimulus: "easy", modifiers: ["outdoor"] }),
  act({ id: 50, name: "Tuesday", start_date_local: "2024-06-02T08:00:00", distance_m: 9000, moving_time_s: 2700, primary_stimulus: "quality", modifiers: ["intervals", "outdoor"], hard_lap_count: 8, has_intervals: true }),
  act({ id: 51, name: "Session", start_date_local: "2024-05-02T08:00:00", distance_m: 8000, moving_time_s: 2400, primary_stimulus: "quality", modifiers: ["outdoor"], hard_lap_count: 3 }),
  act({ id: 52, name: "Tempo", start_date_local: "2024-07-02T08:00:00", distance_m: 8000, moving_time_s: 2400, primary_stimulus: "quality", modifiers: ["tempo", "outdoor"] }),
  act({ id: 53, name: "Easy Run", start_date_local: "2024-04-02T08:00:00", distance_m: 8000, moving_time_s: 3000, primary_stimulus: "easy", modifiers: ["strides", "outdoor"], hard_lap_count: 6, has_intervals: true }),
  act({ id: 54, name: "Untitled", start_date_local: "2024-08-02T08:00:00", distance_m: 8000, moving_time_s: 2400, primary_stimulus: "easy", stimulus_cluster: "quality_intervals" }),
  act({ id: 55, name: "Old repeats", start_date_local: "2023-06-02T08:00:00", distance_m: 8000, moving_time_s: 2400, primary_stimulus: "quality", modifiers: ["intervals"], hard_lap_count: 6 }),
  act({ id: 56, name: "Interval City", start_date_local: "2024-03-02T08:00:00", distance_m: 5000, moving_time_s: 1800, place: "Interval", primary_stimulus: "easy" }),
  act({ id: 57, name: "Cruise", start_date_local: "2024-09-02T08:00:00", distance_m: 10000, moving_time_s: 3000, primary_stimulus: "quality", stimulus_cluster: "quality_tempo", modifiers: ["tempo"], hard_lap_count: 4, has_intervals: true }),
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
  ["last week", { isDeterministic: true, kind: "list", dateWindow: { start: "2026-09-21", end: "2026-09-27" }, band: null }],
  ["last week's activities", { isDeterministic: true, kind: "list", dateWindow: { start: "2026-09-21", end: "2026-09-27" }, band: null }],
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
  ["Fastest run in Chicago", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: null, band: null, place: "chicago" }],
  ["Longest run in Chicago", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: null, band: null, place: "chicago" }],
  ["Speedy runs last month", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: { start: "2026-08-01", end: "2026-08-31" }, band: null, place: null }],
  ["Runs last week", { isDeterministic: true, kind: "list", sport: "run", dateWindow: { start: "2026-09-21", end: "2026-09-27" }, band: null, place: null }],
  ["fast runs near Chicago", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: null, band: null, place: "chicago" }],
  ["quickest run in Chicago last month", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: { start: "2026-08-01", end: "2026-08-31" }, band: null, place: "chicago" }],
  ["runs in Chicago last week", { isDeterministic: true, kind: "list", sport: "run", dateWindow: { start: "2026-09-21", end: "2026-09-27" }, band: null, place: "chicago" }],
  ["fastest Chicago run", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: null, band: null, place: "chicago" }],
  ["longest run Chicago", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: null, band: null, place: "chicago" }],
  ["speedy Chicago runs", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: null, band: null, place: "chicago" }],
  ["fastest run in Chi", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: null, band: null, place: "chicago" }],
  ["fastest run in the windy city", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: null, band: null, place: "chicago" }],
  ["chitown runs", { isDeterministic: true, kind: "list", sport: "run", dateWindow: null, band: null, place: "chicago" }],
  ["runs in Chicago", { isDeterministic: true, kind: "list", sport: "run", dateWindow: null, band: null, place: "chicago" }],
  ["runs in the last week", { isDeterministic: true, kind: "list", sport: "run", dateWindow: { start: "2026-09-21", end: "2026-09-27" }, band: null, place: null }],
  ["runs from last week", { isDeterministic: true, kind: "list", sport: "run", dateWindow: { start: "2026-09-21", end: "2026-09-27" }, band: null, place: null }],
  ["fastest run in the last month", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: { start: "2026-08-01", end: "2026-08-31" }, band: null, place: null }],
  ["speedy runs in the last month", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: { start: "2026-08-01", end: "2026-08-31" }, band: null, place: null }],
  ["quick runs this week", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: { start: "2026-09-28", end: "2026-09-29" }, band: null, place: null }],
  ["quick 10ks last month", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: { start: "2026-08-01", end: "2026-08-31" }, band: "10k", place: null }],
  ["this month", { isDeterministic: true, kind: "list", dateWindow: { start: "2026-09-01", end: "2026-09-29" }, band: null }],
  ["this week", { isDeterministic: true, kind: "list", dateWindow: { start: "2026-09-28", end: "2026-09-29" }, band: null }],
  ["best run in Chicago", { isDeterministic: false, kind: null, dateWindow: null, band: null, place: "chicago" }],
  ["longest run on a Tuesday", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: null, band: null, place: null, weekday: "tuesday" }],
  ["longest Tuesday run", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: null, band: null, weekday: "tuesday" }],
  ["runs on Tuesdays", { isDeterministic: true, kind: "list", sport: "run", dateWindow: null, band: null, weekday: "tuesday" }],
  ["fastest run on a Tuesday", { isDeterministic: true, kind: "fastest", sport: "run", dateWindow: null, band: null, weekday: "tuesday" }],
  ["easy runs last week", { isDeterministic: true, kind: "list", sport: "run", dateWindow: { start: "2026-09-21", end: "2026-09-27" }, band: null, place: null, stimulusPrimary: "easy", intervals: false }],
  ["interval workouts 2024", { isDeterministic: true, kind: "list", dateWindow: { start: "2024-01-01", end: "2024-12-31" }, band: null, place: null, intervals: true }],
  ["quality runs", { isDeterministic: true, kind: "list", sport: "run", dateWindow: null, band: null, place: null, stimulusPrimary: "quality", intervals: false }],
  ["tempo runs last month", { isDeterministic: true, kind: "list", sport: "run", dateWindow: { start: "2026-08-01", end: "2026-08-31" }, band: null, place: null, stimulusPrimary: null, modifier: "tempo" }],
  ["hilly ride", { isDeterministic: false, kind: null, dateWindow: null, band: null, stimulusPrimary: null, intervals: false }],
  ["fartlek session", { isDeterministic: false, kind: null, dateWindow: null, band: null, place: null }],
];

for (const [query, expected] of classTests) {
  const result = classifyIntent(query, testClock);
  let pass = result.isDeterministic === expected.isDeterministic && (result.intent?.kind ?? null) === expected.kind;
  if (expected.sport !== undefined && result.intent?.sport !== expected.sport) pass = false;
  if (expected.kind === "place_filter" && expected.place !== undefined && result.intent?.place !== expected.place) pass = false;
  if (expected.filterType !== undefined && result.intent?.filterType !== expected.filterType) pass = false;
  if (expected.field !== undefined && result.intent?.field !== expected.field) pass = false;
  if (!sameWindow(result.dateWindow, expected.dateWindow)) pass = false;
  if (expected.band !== undefined && (result.distanceBand?.kind ?? null) !== expected.band) pass = false;
  if (expected.label !== undefined && result.distanceBand?.label !== expected.label) pass = false;
  if (expected.place !== undefined && result.place !== expected.place) pass = false;
  if (expected.weekday !== undefined && result.weekday !== expected.weekday) pass = false;
  if (expected.stimulusPrimary !== undefined && (result.stimulus?.primary ?? null) !== expected.stimulusPrimary) pass = false;
  if (expected.intervals !== undefined && Boolean(result.stimulus?.intervals) !== expected.intervals) pass = false;
  if (expected.modifier !== undefined && !(result.stimulus?.modifiers ?? []).includes(expected.modifier)) pass = false;
  const detail = pass
    ? ""
    : `got deterministic=${result.isDeterministic} kind=${result.intent?.kind ?? "null"} sport=${result.intent?.sport ?? "-"} band=${result.distanceBand?.kind ?? "null"} label=${result.distanceBand?.label ?? "-"} place=${result.place ?? "null"} weekday=${result.weekday ?? "null"} stimulus=${JSON.stringify(result.stimulus)} window=${result.dateWindow ? `${result.dateWindow.start}..${result.dateWindow.end}` : "null"} remaining=${result.remainingTokens.join(",")}`;
  check(`"${query}"`, pass, detail);
}

const speedyGloss = describeIntent(classifyIntent("Speedy runs last month", testClock));
check(
  "Jev gloss for speedy runs last month",
  speedyGloss.includes("fastest pace") && speedyGloss.includes("runs only") && speedyGloss.includes("2026-08-01") && speedyGloss.includes("2026-08-31"),
  speedyGloss,
);
const chicagoGloss = describeIntent(classifyIntent("Fastest run in Chicago", testClock));
check(
  "Jev gloss for fastest run in Chicago",
  chicagoGloss.includes("fastest pace") && chicagoGloss.includes("in chicago") && chicagoGloss.includes("runs only"),
  chicagoGloss,
);
const weekGloss = describeIntent(classifyIntent("Runs last week", testClock));
check(
  "Jev gloss for runs last week",
  weekGloss.includes("list") && weekGloss.includes("2026-09-21") && weekGloss.includes("2026-09-27"),
  weekGloss,
);
const tuesdayGloss = describeIntent(classifyIntent("longest run on a Tuesday", testClock));
check(
  "Jev gloss for longest run on a Tuesday",
  tuesdayGloss.includes("longest distance") && tuesdayGloss.includes("runs only") && tuesdayGloss.includes("on tuesday"),
  tuesdayGloss,
);
const longestGloss = describeIntent(classifyIntent("Longest run in Chicago", testClock));
check(
  "Jev gloss for longest run in Chicago",
  longestGloss.includes("longest distance") && longestGloss.includes("in chicago"),
  longestGloss,
);

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
order("fastest 10k this year sorts by time inside the band", "fastest 10k this year", [22, 2, 3, 19, 15], [5, 6]);
order("fastest marathon sorts by moving time", "fastest marathon", [11, 7], [2, 10, 13]);
order("longest run this year sorts by distance after the date window", "longest run this year", [17, 7, 30], [8, 6, 5]);
order("longest run 2024 keeps the date window ahead of distance", "longest run 2024", [8, 12, 5], [7, 9]);
order("fastest run without a band still sorts by pace", "fastest run", [5], []);

const unbanded = ids("fastest run");
check(
  "unbanded fastest ranks quicker pace ahead of shorter time",
  unbanded.indexOf(14) !== -1 && unbanded.indexOf(13) !== -1 && unbanded.indexOf(14) < unbanded.indexOf(13),
  `got [${unbanded.join(", ")}]`,
);

order("fastest 10k chicago keeps time order inside the keyword set", "fastest 10k chicago", [19, 15, 16], [2, 6, 22]);
order("fastest 50k stays on runs and sorts by time", "fastest 50k", [17, 8], [18]);
order("fastest run in Chicago ignores other cities", "fastest run in Chicago", [19], [22, 7]);
order("longest run in Chicago sorts by distance", "longest run in Chicago", [26], [7, 17, 22]);
order("speedy runs last month is pace within August", "speedy runs last month", [22, 19], [21, 6]);
order("runs last week is the previous week, newest first", "runs last week", [41, 46, 27, 40, 23, 42, 45], [24, 21, 44]);
order("fastest Chicago run matches in-Chicago pace order", "fastest Chicago run", [19], [22, 29]);
order("windy city alias includes a nameless-place Chicago run", "fastest run in the windy city", [19], [22, 29]);
order("longest run Chicago sorts by distance", "longest run Chicago", [26], [7, 17, 22, 29]);
order("runs in the last week matches runs last week", "runs in the last week", [41, 46, 27, 40, 23, 42, 45], [24, 21, 44]);
order("runs from last week is not an empty keyword search", "runs from last week", [41, 46, 27, 40, 23, 42, 45], [24]);
order("speedy runs in the last month keeps August pace order", "speedy runs in the last month", [22, 19], [21]);
order("quick 10ks last month sorts by time inside the band", "quick 10ks last month", [22, 19, 20], [21]);
order("chitown runs are Chicago runs, newest first", "chitown runs", [21, 20], [22, 29]);
order("longest run on a Tuesday uses the calendar day", "longest run on a Tuesday", [31], [30, 26]);
order("longest Tuesday run matches the on-a-Tuesday wording", "longest Tuesday run", [31], [30]);
order("fastest run on a Tuesday ignores other weekdays", "fastest run on a Tuesday", [22], [30]);
order("runs on a Tuesday is newest first", "runs on a Tuesday", [23, 24], [27, 30]);

const chicagoFast = ids("fastest run in Chicago");
const windyFast = ids("fastest run in the windy city");
check(
  "Chicago alias in the name joins the Chicago pool",
  chicagoFast.includes(28) && windyFast.includes(28) && !chicagoFast.includes(29) && !chicagoFast.includes(22),
  `chicago [${chicagoFast.join(", ")}] windy [${windyFast.join(", ")}]`,
);
check(
  "Chicago stride is related, behind the pace order",
  chicagoFast.indexOf(25) > chicagoFast.indexOf(19),
  `got [${chicagoFast.join(", ")}]`,
);

const tenkYear = ids("fastest 10k this year");
check(
  "out-of-band runs follow the timed 10ks",
  tenkYear.indexOf(7) > tenkYear.indexOf(15) && tenkYear.indexOf(13) > tenkYear.indexOf(15),
  `got [${tenkYear.join(", ")}]`,
);

const quick10 = ids("quick 10ks last month");
check(
  "August 50k follows the 10k times and September stays out",
  quick10.indexOf(17) > quick10.indexOf(20) && !quick10.includes(21),
  `got [${quick10.join(", ")}]`,
);

const noMarathon = ids("fastest marathon in Chicago last month");
check(
  "empty marathon band still keeps August Chicago runs",
  noMarathon.includes(19) && noMarathon.includes(20) && !noMarathon.includes(22) && !noMarathon.includes(21),
  `got [${noMarathon.join(", ")}]`,
);

order("leftover word does not narrow away the Chicago pace pool", "fastest effort in Chicago", [19], [22, 29]);

function branches(query) {
  return planShortlist(query, testClock).join(",");
}
check("Fastest run in Chicago branches", branches("Fastest run in Chicago") === "metric,place-longest,place-list", branches("Fastest run in Chicago"));
check("Longest run in Chicago branches", branches("Longest run in Chicago") === "metric,place-list", branches("Longest run in Chicago"));
check("Speedy runs last month branches", branches("Speedy runs last month") === "metric,date-list", branches("Speedy runs last month"));
check("Runs last week branches", branches("Runs last week") === "date-list", branches("Runs last week"));
check("plain 10k this year stays a keyword branch", branches("10k this year") === "keyword", branches("10k this year"));
check("easy runs last week branches", branches("easy runs last week") === "date-list", branches("easy runs last week"));
check("interval workouts 2024 branches", branches("interval workouts 2024") === "date-list", branches("interval workouts 2024"));
check("hilly ride stays a keyword branch", branches("hilly ride") === "keyword", branches("hilly ride"));
check("most intervals stays on the metric branch", branches("most intervals") === "metric", branches("most intervals"));

order(
  "easy runs last week is labeled easy runs, low confidence last",
  "easy runs last week",
  [46, 40, 45],
  [41, 42, 23, 27, 44, 43],
);
order(
  "interval workouts 2024 uses labels, not the word interval",
  "interval workouts 2024",
  [54, 50, 51],
  [52, 53, 55, 56, 57, 5],
);
order("most intervals keeps easy strides out", "most intervals", [50, 55, 41], [53, 45]);

const easySettled = classifyIntent("easy runs last week", testClock);
check(
  "Jev does not replace a settled easy parse",
  applyJevIntent(easySettled, { is_quality: 0.99, is_intervals: 0.99, year_2020: 0.99 }) === easySettled,
);
const intervalSettled = classifyIntent("interval workouts 2024", testClock);
check(
  "Jev does not move interval workouts off 2024 or onto a place",
  applyJevIntent(intervalSettled, { year_2023: 0.99, is_easy: 0.99, place_chicago: 0.99 }) === intervalSettled &&
    intervalSettled.place === null,
);
const runsSettled = classifyIntent("runs last week", testClock);
check(
  "Jev does not turn a settled date list into fastest",
  applyJevIntent(runsSettled, { is_fastest: 0.99 }) === runsSettled,
);
const fartlek = classifyIntent("fartlek", testClock);
const fartlekFilled = applyJevIntent(fartlek, { is_intervals: 0.91, is_quality: 0.84, is_easy: 0.1 });
check(
  "Jev intervals facet fills an unrecognized workout word",
  !fartlek.isDeterministic &&
    fartlekFilled !== fartlek &&
    fartlekFilled.stimulus?.intervals === true &&
    fartlekFilled.intent?.kind === "list" &&
    fartlekFilled.place == null,
  JSON.stringify(fartlekFilled.stimulus),
);
check(
  "a low Jev interval score is discarded",
  applyJevIntent(fartlek, { is_intervals: 0.4, is_easy: 0.2 }) === fartlek,
);
check(
  "tied Jev stimulus scores are discarded",
  applyJevIntent(fartlek, { is_easy: 0.8, is_quality: 0.78 }) === fartlek,
);
const speedwork = applyJevIntent(classifyIntent("speedwork", testClock), {
  is_intervals: 0.92,
  year_2024: 0.9,
  year_2025: 0.2,
});
check(
  "Jev year facet applies only as a gap fill beside a stimulus",
  speedwork.stimulus?.intervals === true && speedwork.dateWindow?.start === "2024-01-01" && speedwork.dateWindow?.end === "2024-12-31",
  JSON.stringify({ stimulus: speedwork.stimulus, window: speedwork.dateWindow }),
);
const bestRun = classifyIntent("best run in Chicago", testClock);
const bestSped = applyJevIntent(bestRun, { is_fastest: 0.92, is_longest: 0.2 });
check(
  "Jev fastest facet can complete an unsettled Chicago query",
  !bestRun.isDeterministic && bestSped.intent?.kind === "fastest" && bestSped.intent?.sport === "run" && bestSped.place === "chicago",
  JSON.stringify({ kind: bestSped.intent?.kind, sport: bestSped.intent?.sport, place: bestSped.place }),
);

const split = splitJevAnswers({
  a31: { noul: 0.8 },
  is_intervals: { noul: 0.91 },
  is_easy: { noul: 0.2 },
  has_place: { noul: 0.4 },
});
check(
  "Jev answers split into membership scores and intent facets",
  split.scores[31] === 0.8 && split.facets.is_intervals === 0.91 && split.facets.is_easy === 0.2 && split.scores.is_intervals === undefined,
  JSON.stringify(split),
);

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
check("describeActivity includes run pace", marathon.includes("7:26 /mi, fast pace"), marathon);
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
check("describeActivity includes the weekday", blankNotes.includes("Tuesday"), blankNotes);

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

const tuesdayFacts = activityFacts(
  act({
    id: 31,
    name: "easy miles",
    start_date_local: "2026-09-01T08:00:00",
    distance_m: 28000,
    moving_time_s: 10000,
    place: "Lincoln Park",
    description: "Lakefront",
  }),
  testClock,
);
check(
  "activityFacts keeps weekday, distance, pace, and place as fields",
  tuesdayFacts.weekday === "Tuesday" &&
    tuesdayFacts.distance_km === 28 &&
    tuesdayFacts.pace_label === "easy pace" &&
    tuesdayFacts.place === "Lincoln Park" &&
    tuesdayFacts.description === "Lakefront",
  JSON.stringify(tuesdayFacts),
);

const packed = buildJevRequest(
  "longest run on a Tuesday",
  [
    act({ id: 31, name: "easy miles", start_date_local: "2026-09-01T08:00:00", distance_m: 28000, moving_time_s: 10000 }),
    act({ id: 30, name: "Monday long", start_date_local: "2026-09-28T08:00:00", distance_m: 42000, moving_time_s: 14000 }),
  ],
  testClock,
);
check(
  "Jev request packs one noul per activity against one shared rubric",
  packed.state.interpreted_query.includes("on tuesday") &&
    packed.state.how_to_judge.includes("weekday") &&
    packed.questions.a31?.type === "noul" &&
    packed.questions.a30?.type === "noul" &&
    packed.questions.a31.instructions.includes("activities.a31") &&
    !packed.questions.a31.instructions.includes("Last month") &&
    packed.state.activities.a31.weekday === "Tuesday" &&
    packed.state.activities.a30.weekday === "Monday",
  JSON.stringify({ interpreted: packed.state.interpreted_query, q: packed.questions.a31 }),
);
check(
  "Jev request asks intent facets in parallel with membership",
  packed.questions.is_intervals?.type === "noul" &&
    packed.questions.is_easy?.type === "noul" &&
    packed.questions.is_fastest?.type === "noul" &&
    packed.questions.has_place?.type === "noul" &&
    packed.questions.year_2024?.type === "noul" &&
    packed.questions.band_10k?.type === "noul" &&
    packed.state.vocab.primary_stimulus.includes("easy") &&
    packed.state.vocab.stimulus_cluster.includes("quality_intervals") &&
    packed.questions.a31?.type === "noul",
  Object.keys(packed.questions).sort().join(","),
);

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

const mappedLabels = toActivity({
  id: 3,
  name: "repeats",
  sport_type: "Run",
  start_date_local: "2024-06-01T00:00:00Z",
  primary_stimulus: "quality",
  modifiers: ["intervals"],
  stimulus_cluster: "quality_intervals",
  modality: "run",
  low_confidence: true,
  hard_lap_count: 4,
});
check(
  "toActivity keeps stimulus cluster, modality, and low confidence",
  mappedLabels.stimulus_cluster === "quality_intervals" &&
    mappedLabels.modality === "run" &&
    mappedLabels.low_confidence === true &&
    mappedLabels.primary_stimulus === "quality",
  JSON.stringify(mappedLabels),
);
check(
  "toActivity omits an absent stimulus cluster",
  !("stimulus_cluster" in mappedBlank) && !("modality" in mappedBlank) && !("low_confidence" in mappedBlank),
  JSON.stringify(mappedBlank),
);

console.log();
if (failures === 0) {
  console.log("✅ All tests pass!");
  process.exit(0);
}
console.log(`❌ ${failures} test${failures === 1 ? "" : "s"} failed`);
process.exit(1);
