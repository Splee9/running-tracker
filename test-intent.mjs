// Intent, distance-band sort, and describeActivity checks.
// Run: node --experimental-strip-types test-intent.mjs

import { activityFacts, applyJevIntent, buildGradeRequest, buildIndex, buildJevRequest, classifyIntent, climbingLabel, rankGradeFor, readStandout, STANDOUT_LEVELS, withGrades, withoutParts, describeActivity, describeIntent, jevCacheScope, MEMBERSHIP_DEMOTE_BELOW, needsIntentFacets, planShortlist, rerankUnlockedHits, resolveInterpretation, searchActivities, settledIntentPayload, splitJevAnswers } from "./src/lib/activitySearch.ts";
import { toActivity } from "./scripts/strava-activity.mjs";
import { formatHours, formatWindow, interpretationParts, lookupStatus, orderHits, primaryHits, resultTotals } from "./src/lib/lookupView.ts";

const testClock = new Date("2026-09-29T12:00:00-05:00");

// A Jev Choice answer as splitJevAnswers keeps it.
function pick(choice, confidence = 0.9) {
  return { choice, confidence };
}

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
  // Race-name keyword fixtures. Distances stay off the marathon and longest heads.
  act({ id: 60, name: "Chicago Marathon", start_date_local: "2024-10-13T08:00:00", distance_m: 8000, moving_time_s: 20000, place: "Chicago", primary_stimulus: "race", workout_type: 1 }),
  act({ id: 61, name: "Marathon pace", start_date_local: "2026-08-01T08:00:00", distance_m: 16000, moving_time_s: 4800, place: "Chicago", primary_stimulus: "quality", modifiers: ["marathon_pace"] }),
  act({ id: 63, name: "Shamrock Shuffle", start_date_local: "2026-03-22T08:00:00", distance_m: 10000, moving_time_s: 4200, primary_stimulus: "race", workout_type: 1 }),
  act({ id: 64, name: "run commute", start_date_local: "2026-09-02T08:00:00", distance_m: 10000, moving_time_s: 3600, primary_stimulus: "easy", modifiers: ["commute"] }),
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

const chicagoMarathon = ids("Chicago Marathon");
check(
  "Chicago Marathon promotes the race-labeled name over a recent pace session",
  chicagoMarathon[0] === 60 && chicagoMarathon.indexOf(60) < chicagoMarathon.indexOf(61),
  `got [${chicagoMarathon.join(", ")}]`,
);
const plainTenk = ids("10k this year");
check(
  "10k this year promotes a race-labeled 10k over a recent commute",
  plainTenk.indexOf(63) !== -1 && plainTenk.indexOf(63) < plainTenk.indexOf(64),
  `got [${plainTenk.join(", ")}]`,
);

const easyWeekHits = searchActivities(index, "easy runs last week", 50, testClock);
check(
  "easy runs last week stays a locked code sort",
  easyWeekHits.length > 0 && easyWeekHits.every((hit) => hit.locked !== false),
  easyWeekHits.map((hit) => hit.locked).join(","),
);
const fastestChicagoHits = searchActivities(index, "fastest run in Chicago", 50, testClock);
check(
  "fastest run in Chicago stays locked",
  fastestChicagoHits.length > 0 && fastestChicagoHits.every((hit) => hit.locked !== false),
  `locked flags ${fastestChicagoHits.map((hit) => hit.locked).join(",")}`,
);

const fartlekFilledHits = searchActivities(
  index,
  "fartlek",
  50,
  testClock,
  applyJevIntent(classifyIntent("fartlek", testClock), { stimulus: pick("intervals") }),
);
check(
  "fartlek fill is an unlocked interval shortlist",
  fartlekFilledHits.length > 0 &&
    fartlekFilledHits.every((hit) => hit.locked === false) &&
    fartlekFilledHits.some((hit) => hit.activity.id === 41) &&
    !fartlekFilledHits.some((hit) => hit.activity.id === 40),
  fartlekFilledHits.map((hit) => `${hit.activity.id}:${hit.locked}`).join(","),
);

function bareHit(id, locked) {
  return { activity: { id }, locked, score: 1, kind: "keyword", matched: [] };
}
const reranked = rerankUnlockedHits(
  [bareHit(1, true), bareHit(2, true), bareHit(3, false), bareHit(4, false), bareHit(5, false)],
  { 1: 0.1, 2: 0.99, 3: 0.2, 4: 0.9, 5: 0.4 },
);
check(
  "unlocked rows sort by membership noul and a weak yes is demoted",
  reranked.map((hit) => hit.activity.id).join(",") === "1,2,4,5,3" && MEMBERSHIP_DEMOTE_BELOW === 0.3,
  reranked.map((hit) => hit.activity.id).join(","),
);
const tied = rerankUnlockedHits(
  [bareHit(3, false), bareHit(4, false)],
  { 3: 0.8, 4: 0.8 },
  { 3: { stimulus: 0.2 }, 4: { stimulus: 0.9, place: 0.9 } },
);
check("companion nouls only break a membership tie", tied[0].activity.id === 4, String(tied[0].activity.id));
const lockedOnly = rerankUnlockedHits(
  [bareHit(9, true), bareHit(8, true)],
  { 9: 0.1, 8: 0.99 },
);
check(
  "a locked list does not reorder when membership would",
  lockedOnly.map((hit) => hit.activity.id).join(",") === "9,8",
  lockedOnly.map((hit) => hit.activity.id).join(","),
);
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
  applyJevIntent(easySettled, { stimulus: pick("quality"), year: pick("2020") }) === easySettled,
);
const intervalSettled = classifyIntent("interval workouts 2024", testClock);
check(
  "Jev does not move interval workouts off 2024 or onto a place",
  applyJevIntent(intervalSettled, { year: pick("2023"), stimulus: pick("easy"), place_chicago: 0.99 }) === intervalSettled &&
    intervalSettled.place === null,
);
const runsSettled = classifyIntent("runs last week", testClock);
check(
  "Jev does not turn a settled date list into fastest",
  applyJevIntent(runsSettled, { superlative: pick("fastest") }) === runsSettled,
);
const fartlek = classifyIntent("fartlek", testClock);
const fartlekFilled = applyJevIntent(fartlek, { stimulus: pick("intervals", 0.8) });
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
  "a low-confidence stimulus choice is discarded",
  applyJevIntent(fartlek, { stimulus: pick("intervals", 0.3) }) === fartlek,
);
check(
  "a no-match stimulus choice adds nothing",
  applyJevIntent(fartlek, { stimulus: pick("none", 0.99) }) === fartlek,
);
check(
  "tempo and marathon pace choices land as modifiers",
  applyJevIntent(classifyIntent("threshold", testClock), { stimulus: pick("tempo") }).stimulus?.modifiers?.[0] === "tempo",
  JSON.stringify(applyJevIntent(classifyIntent("threshold", testClock), { stimulus: pick("tempo") }).stimulus),
);
const speedwork = applyJevIntent(classifyIntent("speedwork", testClock), {
  stimulus: pick("intervals"),
  year: pick("2024", 0.8),
});
check(
  "Jev year facet applies only as a gap fill beside a stimulus",
  speedwork.stimulus?.intervals === true && speedwork.dateWindow?.start === "2024-01-01" && speedwork.dateWindow?.end === "2024-12-31",
  JSON.stringify({ stimulus: speedwork.stimulus, window: speedwork.dateWindow }),
);
const bestRun = classifyIntent("best run in Chicago", testClock);
const bestSped = applyJevIntent(bestRun, { superlative: pick("fastest", 0.84) });
check(
  "Jev fastest facet can complete an unsettled Chicago query",
  !bestRun.isDeterministic && bestSped.intent?.kind === "fastest" && bestSped.intent?.sport === "run" && bestSped.place === "chicago",
  JSON.stringify({ kind: bestSped.intent?.kind, sport: bestSped.intent?.sport, place: bestSped.place }),
);

const split = splitJevAnswers({
  a31: { type: "noul", noul: 0.8 },
  a31s: { type: "noul", noul: 0.7 },
  a31p: { type: "noul", noul: 0.6 },
  stimulus: { type: "choice", choice: "intervals", probabilities: { intervals: 0.9, none: 0.1 }, confidence: 0.82 },
  year: { type: "choice", choice: "none", probabilities: { none: 1 }, confidence: 1 },
  place_chicago: { type: "noul", noul: 0.2 },
  has_place: { type: "noul", noul: 0.4 },
});
check(
  "Jev answers split into membership scores, companions, and typed intent facets",
  split.scores[31] === 0.8 &&
    split.facets.stimulus?.choice === "intervals" &&
    split.facets.stimulus?.confidence === 0.82 &&
    split.facets.year?.choice === "none" &&
    split.facets.place_chicago === 0.2 &&
    split.facets.has_place === undefined &&
    split.facets.a31s === undefined &&
    split.companions[31]?.stimulus === 0.7 &&
    split.companions[31]?.place === 0.6,
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
  "a deterministic parse asks no intent facets",
  !needsIntentFacets(classifyIntent("longest run on a Tuesday", testClock)) &&
    Object.keys(packed.questions).sort().join(",") === "a30,a31",
  Object.keys(packed.questions).sort().join(","),
);
const openPacked = buildJevRequest(
  "hilly ride",
  [act({ id: 32, name: "gravel climb", sport_type: "Ride", start_date_local: "2026-09-01T08:00:00", distance_m: 60000, moving_time_s: 9000 })],
  testClock,
);
check(
  "an open parse asks pick-one intent facets as Choices with a no-match option",
  needsIntentFacets(classifyIntent("hilly ride", testClock)) &&
    openPacked.questions.stimulus?.type === "choice" &&
    "none" in openPacked.questions.stimulus.criteria &&
    "intervals" in openPacked.questions.stimulus.criteria &&
    openPacked.questions.superlative?.type === "choice" &&
    openPacked.questions.year?.type === "choice" &&
    "2020" in openPacked.questions.year.criteria &&
    "2026" in openPacked.questions.year.criteria &&
    "none" in openPacked.questions.year.criteria &&
    openPacked.questions.distance?.type === "choice" &&
    openPacked.questions.sport?.criteria.any !== undefined &&
    openPacked.questions.place_chicago?.type === "noul" &&
    openPacked.questions.has_place === undefined &&
    openPacked.state.vocab.primary_stimulus.includes("easy") &&
    openPacked.state.vocab.stimulus_cluster.includes("quality_intervals") &&
    openPacked.questions.a32?.type === "noul",
  Object.keys(openPacked.questions).sort().join(","),
);
const cachedFacetsPacked = buildJevRequest(
  "hilly ride",
  [act({ id: 32, name: "gravel climb", sport_type: "Ride", start_date_local: "2026-09-01T08:00:00", distance_m: 60000, moving_time_s: 9000 })],
  testClock,
  undefined,
  { includeFacets: false },
);
check(
  "cached facets are not asked again",
  Object.keys(cachedFacetsPacked.questions).join(",") === "a32",
  Object.keys(cachedFacetsPacked.questions).join(","),
);
check(
  "interval facet treats fartlek as the existing intervals predicate",
  openPacked.questions.stimulus.criteria.intervals.includes("fartlek") &&
    openPacked.state.vocab.synonyms.fartlek === "intervals" &&
    !openPacked.state.vocab.primary_stimulus.includes("fartlek"),
  openPacked.questions.stimulus.criteria.intervals,
);
const blockedBase = { ...classifyIntent("fastest run in Chicago", testClock), place: "intervals" };
const blockedCleared = applyJevIntent(blockedBase, {});
check(
  "a blocked place clears without waiting on facets",
  blockedBase.isDeterministic && blockedCleared.place == null,
  String(blockedCleared.place),
);
const hillyOpen = classifyIntent("hilly ride", testClock);
check(
  "empty or missing facets leave an open parse unchanged",
  applyJevIntent(hillyOpen, {}) === hillyOpen && applyJevIntent(hillyOpen, undefined) === hillyOpen,
  "",
);
const fartlekOpen = classifyIntent("fartlek", testClock);
const scopeBefore = jevCacheScope("fartlek", settledIntentPayload(fartlekOpen), testClock);
const scopeAfter = jevCacheScope(
  "fartlek",
  settledIntentPayload(applyJevIntent(fartlekOpen, { stimulus: pick("intervals") })),
  testClock,
);
const scopeTomorrow = jevCacheScope("fartlek", settledIntentPayload(fartlekOpen), new Date("2026-09-30T12:00:00-05:00"));
check(
  "membership cache scope changes with the interpretation and the day",
  scopeBefore.interpreted !== scopeAfter.interpreted &&
    scopeBefore.day === "2026-09-29" &&
    scopeTomorrow.day === "2026-09-30",
  JSON.stringify({ scopeBefore, scopeAfter, scopeTomorrow }),
);

const fartlekSettled = applyJevIntent(classifyIntent("fartlek", testClock), { stimulus: pick("intervals") });
const fartlekPacked = buildJevRequest(
  "fartlek",
  [act({ id: 41, name: "Easy Run", start_date_local: "2026-09-26T08:00:00", distance_m: 10000, moving_time_s: 3000, primary_stimulus: "quality", modifiers: ["intervals"] })],
  testClock,
  settledIntentPayload(fartlekSettled),
);
check(
  "settled intervals land in the membership criteria",
  fartlekPacked.state.interpreted_query.includes("intervals") &&
    fartlekPacked.questions.a41.criteria.true.includes("interval workout") &&
    fartlekPacked.questions.a41s?.type === "noul" &&
    fartlekPacked.questions.a41p === undefined,
  fartlekPacked.questions.a41.criteria.true,
);
const refused = resolveInterpretation(
  "easy runs last week",
  { stimulus: { intervals: true, modifiers: [] }, kind: "fastest", place: "not a city" },
  testClock,
);
check(
  "a deterministic parse ignores a client gap-fill",
  refused.stimulus?.primary === "easy" && refused.intent?.kind === "list" && refused.place == null,
  JSON.stringify({ stimulus: refused.stimulus, kind: refused.intent?.kind, place: refused.place }),
);
const bestPacked = buildJevRequest(
  "best run in Chicago",
  [act({ id: 21, name: "September Chicago fast", start_date_local: "2026-09-10T08:00:00", distance_m: 8000, moving_time_s: 2000, place: "Chicago" })],
  testClock,
);
check(
  "best in Chicago conditions membership on place and a standout",
  bestPacked.questions.a21.criteria.true.includes("in chicago") &&
    bestPacked.questions.a21.criteria.true.includes("standout"),
  bestPacked.questions.a21.criteria.true,
);
check(
  "a code-parsed place needs no place companion",
  bestPacked.questions.a21p === undefined,
  Object.keys(bestPacked.questions).filter((key) => key.startsWith("a21")).join(","),
);
const racePacked = buildJevRequest(
  "Chicago Marathon",
  [act({ id: 60, name: "Chicago Marathon", start_date_local: "2024-10-13T08:00:00", distance_m: 8000, moving_time_s: 20000, place: "Chicago", primary_stimulus: "race" })],
  testClock,
);
check(
  "a race-name keyword asks membership for a race-labeled activity",
  racePacked.questions.a60.criteria.true.includes("race-labeled") &&
    racePacked.questions.a60.criteria.false.includes("quality session"),
  racePacked.questions.a60.criteria.true,
);
const pacePacked = buildJevRequest(
  "fastest run in Chicago",
  [act({ id: 19, name: "August Chicago tempo", start_date_local: "2026-08-10T08:00:00", distance_m: 10000, moving_time_s: 2400, place: "Chicago" })],
  testClock,
);
check(
  "a locked pace query does not take the race-name membership rubric",
  pacePacked.questions.a19.criteria.true.includes("in chicago") &&
    !pacePacked.questions.a19.criteria.true.includes("race-labeled"),
  pacePacked.questions.a19.criteria.true,
);

console.log("\nlookup view:\n");

const idle = { available: true, scored: false, pending: false, error: false };
const fastestChicago = classifyIntent("fastest run in Chicago", testClock);
check(
  "read-as parts name the sort, sport, and place a code parse settled",
  JSON.stringify(interpretationParts(fastestChicago, fastestChicago).map((p) => [p.key, p.value, p.fromJev])) ===
    JSON.stringify([["sort", "Fastest", false], ["sport", "Runs", false], ["place", "Chicago", false]]),
  JSON.stringify(interpretationParts(fastestChicago, fastestChicago)),
);
const fartlekCode = classifyIntent("fartlek", testClock);
const fartlekReadAs = applyJevIntent(fartlekCode, { stimulus: pick("intervals") });
const fartlekParts = interpretationParts(fartlekReadAs, fartlekCode);
check(
  "a part Jev filled in is marked as Jev's",
  fartlekParts.some((p) => p.key === "stimulus" && p.value === "intervals" && p.fromJev) &&
    fartlekParts.some((p) => p.key === "words" && !p.fromJev),
  JSON.stringify(fartlekParts),
);
check(
  "a full calendar year reads as the year; a week reads as a range",
  formatWindow("2024-01-01", "2024-12-31") === "2024" &&
    formatWindow("2026-09-21", "2026-09-27") === "Sep 21 – Sep 27, 2026",
  formatWindow("2026-09-21", "2026-09-27"),
);
const statusIndex = buildIndex(activities);
const fastestHits = searchActivities(statusIndex, "fastest run in Chicago", 500, testClock, fastestChicago);
check(
  "a locked metric status reads as count and order, without Jev noise",
  /^\d+ match(es)? · by pace( · \d+ related)?$/.test(lookupStatus("fastest run in Chicago", fastestHits, fastestChicago, { ...idle, pending: true })),
  lookupStatus("fastest run in Chicago", fastestHits, fastestChicago, { ...idle, pending: true }),
);
const keywordQuery = classifyIntent("steady", testClock);
const keywordHits = searchActivities(statusIndex, "steady", 500, testClock, keywordQuery);
check(
  "an unlocked status says when Jev is ranking and when it has",
  lookupStatus("steady", keywordHits, keywordQuery, { ...idle, pending: true }).endsWith("best match first · ranking…") &&
    lookupStatus("steady", keywordHits, keywordQuery, { ...idle, scored: true }).endsWith("ranked by Jev") &&
    lookupStatus("steady", keywordHits, keywordQuery, { ...idle, error: true }).endsWith("Jev unavailable"),
  lookupStatus("steady", keywordHits, keywordQuery, { ...idle, pending: true }),
);
check(
  "empty and no-result statuses stay plain",
  lookupStatus("", [], null, idle) === "0 activities · most recent first" &&
    lookupStatus("zzz", [], classifyIntent("zzz", testClock), idle) === 'No activities match "zzz"',
  "",
);
const totals = resultTotals([activities[1], activities[2]]);
check(
  "totals add distance and time and give run pace when every hit is a run",
  totals.count === 2 && totals.distanceM === 20100 && totals.movingS === 4700 &&
    Math.abs(totals.runPaceSPerM - 4700 / 20100) < 1e-9 &&
    resultTotals([activities[1], activities[5]]).runPaceSPerM === null &&
    formatHours(4700) === "1h 18m",
  JSON.stringify(totals),
);
check(
  "primary hits drop the related tail",
  primaryHits(fastestHits, fastestChicago).every((h) => h.branch === "metric"),
  "",
);

console.log("\ngrades, removal, and order:\n");

check(
  "climbing buckets come from metres per km in code, with tighter ride buckets",
  climbingLabel(act({ id: 90, start_date_local: "2026-01-01T08:00:00", distance_m: 10000, moving_time_s: 3000, elevation_gain_m: 30 })) === "flat" &&
    climbingLabel(act({ id: 91, start_date_local: "2026-01-01T08:00:00", distance_m: 10000, moving_time_s: 3000, elevation_gain_m: 150 })) === "hilly" &&
    climbingLabel(act({ id: 92, sport_type: "Ride", start_date_local: "2026-01-01T08:00:00", distance_m: 50000, moving_time_s: 7000, elevation_gain_m: 450 })) === "hilly" &&
    climbingLabel(act({ id: 93, trainer: true, start_date_local: "2026-01-01T08:00:00", distance_m: 10000, moving_time_s: 3000, elevation_gain_m: 150 })) === undefined,
  "",
);
const gradeRequest = buildGradeRequest(act({ id: 94, name: "Chicago Marathon", start_date_local: "2025-10-12T08:00:00", distance_m: 42300, moving_time_s: 11000, primary_stimulus: "race" }));
check(
  "the standout grade is one Score per activity, with no day-relative facts",
  gradeRequest.questions.standout.type === "score" &&
    gradeRequest.questions.standout.criteria.length === STANDOUT_LEVELS.length &&
    gradeRequest.state.activity.name === "Chicago Marathon" &&
    gradeRequest.state.activity.days_ago === undefined,
  JSON.stringify(gradeRequest.state.activity),
);
check(
  "readStandout takes a Score answer and rejects anything else",
  readStandout({ standout: { type: "score", score: 2.4 } }) === 2.4 &&
    readStandout({ standout: { type: "noul", noul: 0.9 } }) === null &&
    readStandout(undefined) === null,
);
const graded = withGrades([act({ id: 95, start_date_local: "2026-01-01T08:00:00", distance_m: 1, moving_time_s: 1 }), act({ id: 96, start_date_local: "2026-01-01T08:00:00", distance_m: 1, moving_time_s: 1 })], { model: "m", grades: { 95: { standout: 2.5 } } });
check("grades attach by id and leave ungraded activities alone", graded[0].standout === 2.5 && graded[1].standout === undefined);
const bestC = classifyIntent("best run in Chicago", testClock);
check(
  "best orders by standout only once grades exist; hilly orders by climbing; metrics keep their sort",
  rankGradeFor("best run in Chicago", bestC, false) === null &&
    rankGradeFor("best run in Chicago", bestC, true)?.label === "standout" &&
    rankGradeFor("hilly ride", classifyIntent("hilly ride", testClock), false)?.label === "climbing" &&
    rankGradeFor("fastest run in Chicago", classifyIntent("fastest run in Chicago", testClock), true) === null,
  "",
);
function gradedHit(id, standout) {
  return { activity: { id, standout }, locked: false, score: 1, kind: "keyword", matched: [] };
}
const byStandout = rerankUnlockedHits(
  [gradedHit(1, 0.5), gradedHit(2, 2.8), gradedHit(3, 1.5), gradedHit(4, 3)],
  { 1: 0.95, 2: 0.6, 3: 0.9, 4: 0.1 },
  undefined,
  (a) => a.standout,
);
check(
  "the noul gates and the grade orders what passes; a failed gate stays last",
  byStandout.map((h) => h.activity.id).join(",") === "2,3,1,4",
  byStandout.map((h) => h.activity.id).join(","),
);
check(
  "a grade orders unlocked rows even before Jev answers",
  rerankUnlockedHits([gradedHit(1, 0.5), gradedHit(2, 2.8)], {}, undefined, (a) => a.standout).map((h) => h.activity.id).join(",") === "2,1",
);
check(
  "a lower floor stops demoting weak yeses",
  rerankUnlockedHits([bareHit(3, false), bareHit(4, false)], { 3: 0.2, 4: 0.25 }, undefined, undefined, 0).map((h) => h.activity.id).join(",") === "4,3",
);
const gradedBest = buildJevRequest("best run in Chicago", [{ ...act({ id: 21, name: "x", start_date_local: "2026-09-10T08:00:00", distance_m: 8000, moving_time_s: 2000, place: "Chicago" }), standout: 2 }], testClock);
check(
  "with standout grades, the best membership noul judges fit only",
  !gradedBest.questions.a21.criteria.true.includes("standout"),
  gradedBest.questions.a21.criteria.true,
);
const fastChi = classifyIntent("fastest run in Chicago", testClock);
const noPlace = withoutParts(fastChi, ["place"]);
const noSort = withoutParts(fastChi, ["sort"]);
check(
  "removing a part drops just that part; removing the sort keeps the filters as a list",
  noPlace.place === null && noPlace.intent?.kind === "fastest" &&
    noSort.intent?.kind === "list" && noSort.intent.sport === "run" && noSort.place === "chicago" &&
    withoutParts(fastChi, []) === fastChi,
  JSON.stringify({ noPlace: noPlace.intent, noSort: noSort.intent }),
);
const removedPacked = buildJevRequest("fastest run in Chicago", [act({ id: 19, name: "t", start_date_local: "2026-08-10T08:00:00", distance_m: 10000, moving_time_s: 2400, place: "Chicago" })], testClock, undefined, { removed: ["place"] });
check(
  "a removed part leaves the membership question and the cache scope",
  !removedPacked.questions.a19.criteria.true.includes("chicago") &&
    jevCacheScope("fastest run in Chicago", undefined, testClock, ["place"]).interpreted !==
      jevCacheScope("fastest run in Chicago", undefined, testClock).interpreted,
  removedPacked.questions.a19.criteria.true,
);
const orderedHits = orderHits(
  [activities[0], activities[6], activities[12]].map((activity) => ({ activity, score: 1, kind: "keyword", matched: [] })),
  "longest",
);
check(
  "a picked order sorts every row",
  orderedHits.map((h) => h.activity.id).join(",") === "7,13,1" &&
    orderHits(orderedHits, "match") === orderedHits,
  orderedHits.map((h) => h.activity.id).join(","),
);
check(
  "a picked order replaces the ranking notes in the status",
  lookupStatus("steady", keywordHits, keywordQuery, { ...idle, pending: true }, undefined, "newest first").endsWith("newest first") &&
    lookupStatus("hilly ride", keywordHits, keywordQuery, idle, "climbing").includes("by climbing"),
  lookupStatus("hilly ride", keywordHits, keywordQuery, idle, "climbing"),
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

console.log("\neval misses:\n");

// One fixture per miss that scripts/eval-jev.mjs found on real searches.
const evalIndex = buildIndex([
  act({ id: 101, name: "Tally In The Valley", sport_type: "TrailRun", start_date_local: "2022-07-31T08:00:00", distance_m: 49000, moving_time_s: 21000, elevation_gain_m: 1100, primary_stimulus: "long" }),
  act({ id: 102, name: "Long Run", start_date_local: "2023-10-14T08:00:00", distance_m: 29500, moving_time_s: 8000, elevation_gain_m: 538, primary_stimulus: "long" }),
  act({ id: 103, name: "Mt. Holly Ski", sport_type: "AlpineSki", start_date_local: "2025-12-21T08:00:00", distance_m: 23800, moving_time_s: 4200, elevation_gain_m: 2839, primary_stimulus: "other" }),
  act({ id: 104, name: "Mega Ride", sport_type: "Ride", start_date_local: "2025-07-08T08:00:00", distance_m: 182000, moving_time_s: 22000, elevation_gain_m: 1366, primary_stimulus: "long" }),
  act({ id: 105, name: "Morning Hill Sprints", start_date_local: "2024-08-21T08:00:00", distance_m: 17000, moving_time_s: 5300, elevation_gain_m: 533, primary_stimulus: "quality" }),
  act({ id: 106, name: "Hill session", start_date_local: "2024-09-01T08:00:00", distance_m: 12000, moving_time_s: 4000, elevation_gain_m: 200, primary_stimulus: "hills" }),
  act({ id: 107, name: "Long Run", start_date_local: "2025-10-10T08:00:00", distance_m: 35900, moving_time_s: 8900, elevation_gain_m: 43, primary_stimulus: "long", place: "Los Angeles" }),
  act({ id: 108, name: "La Plagne Ski", sport_type: "AlpineSki", start_date_local: "2026-03-27T08:00:00", distance_m: 22800, moving_time_s: 4100, elevation_gain_m: 95, primary_stimulus: "other" }),
  act({ id: 109, name: "Lunch Swim", sport_type: "Swim", start_date_local: "2020-08-23T08:00:00", distance_m: 1100, moving_time_s: 1300, primary_stimulus: "easy" }),
  act({ id: 110, name: "Morning Swim", sport_type: "Swim", start_date_local: "2026-05-16T08:00:00", distance_m: 800, moving_time_s: 1080, primary_stimulus: "easy" }),
  // Zwift's France is a game world, but its name still says France.
  act({ id: 112, name: "Zwift - Race: R.G.V. in France", sport_type: "VirtualRide", start_date_local: "2023-04-06T08:00:00", distance_m: 25400, moving_time_s: 2700, primary_stimulus: "race" }),
  act({ id: 111, name: "Chicago Marathon", start_date_local: "2024-10-13T08:00:00", distance_m: 42970, moving_time_s: 10745, primary_stimulus: "race", place: "Chicago" }),
]);
const evalIds = (query, c = classifyIntent(query, testClock)) =>
  searchActivities(evalIndex, query, 50, testClock, c).map((hit) => hit.activity.id);

const ultra = evalIds("ultra");
check("ultra finds the 49 km trail run and not a GPS-long marathon", ultra[0] === 101 && !ultra.includes(111), JSON.stringify(ultra));

const hilliestRun = classifyIntent("hilliest run", testClock);
const hilliest = evalIds("hilliest run", hilliestRun);
check(
  "hilliest run is a run-only sort, so the ski day and the ride drop out",
  hilliestRun.intent?.sport === "run" && hilliestRun.isDeterministic && hilliest[0] === 101 && !hilliest.includes(103) && !hilliest.includes(104),
  JSON.stringify({ intent: hilliestRun.intent, hilliest }),
);

const longestSwim = classifyIntent("longest swim", testClock);
const swims = evalIds("longest swim", longestSwim);
check(
  "longest swim sorts swims only",
  longestSwim.intent?.sport === "swim" && JSON.stringify(swims) === "[109,110]",
  JSON.stringify({ intent: longestSwim.intent, swims }),
);

const hillCode = classifyIntent("hill sprints", testClock);
const hillFilled = applyJevIntent(hillCode, { stimulus: pick("hills", 0.89) });
const hillSprints = evalIds("hill sprints", hillFilled);
check(
  "a Jev hills fill keeps the run named Hill Sprints",
  hillFilled.stimulus?.primary === "hills" && hillFilled.softStimulus === true && hillSprints.includes(105) && hillSprints.includes(106),
  JSON.stringify({ stimulus: hillFilled.stimulus, hillSprints }),
);
const typedHills = evalIds("hills");
check("hills typed by the person stays a hard label filter", JSON.stringify(typedHills) === "[106]", JSON.stringify(typedHills));

const longLa = classifyIntent("long run in LA", testClock);
const la = evalIds("long run in LA", longLa);
check("LA reads as Los Angeles", longLa.place === "los angeles" && JSON.stringify(la) === "[107]", JSON.stringify({ place: longLa.place, la }));
const plagne = classifyIntent("La Plagne", testClock);
check("a bare La is not Los Angeles", plagne.place === null, JSON.stringify(plagne));

const franceSki = classifyIntent("skiing in France", testClock);
const france = searchActivities(evalIndex, "skiing in France", 50, testClock, franceSki);
check(
  "a place no ski day has leaves ski days unlocked for Jev to judge",
  franceSki.intent?.sport === "ski" &&
    franceSki.place === "france" &&
    JSON.stringify(france.map((hit) => hit.activity.id).sort()) === "[103,108]" &&
    france.every((hit) => !hit.locked),
  JSON.stringify({ intent: franceSki.intent, france: france.map((hit) => [hit.activity.id, hit.locked]) }),
);
check(
  "a place activities do have stays a hard, locked filter",
  searchActivities(evalIndex, "long run in LA", 50, testClock, longLa).every((hit) => hit.locked),
);

const marathonPr = classifyIntent("marathon PR", testClock);
check("marathon PR reads as the fastest marathon", marathonPr.intent?.kind === "fastest" && marathonPr.distanceBand?.kind === "marathon", JSON.stringify(marathonPr));
const barePr = classifyIntent("PR", testClock);
check("a bare PR stays a name search", barePr.intent === null && JSON.stringify(barePr.remainingTokens) === '["pr"]', JSON.stringify(barePr));

const shamrock = toActivity({ id: 120, name: "Shamrock Shuffle 8km", sport_type: "Run", start_date_local: "2025-03-23T08:00:00Z", place: "Washington DC", place_source: "name" });
check("toActivity corrects the Shamrock Shuffle to Chicago", shamrock.place === "Chicago", JSON.stringify(shamrock));
const zwift = toActivity({ id: 121, name: "Zwift - Easy Ride in New York", sport_type: "VirtualRide", start_date_local: "2025-01-01T08:00:00Z", place: "New York", place_source: "name" });
check("toActivity drops a virtual ride's game-world place", !("place" in zwift) && !("place_source" in zwift), JSON.stringify(zwift));
const gpsPlace = toActivity({ id: 122, name: "Easy Run", sport_type: "Run", start_date_local: "2025-01-01T08:00:00Z", place: "Chicago", place_source: "gps" });
check("toActivity keeps a GPS place", gpsPlace.place === "Chicago" && gpsPlace.place_source === "gps", JSON.stringify(gpsPlace));

console.log();
if (failures === 0) {
  console.log("✅ All tests pass!");
  process.exit(0);
}
console.log(`❌ ${failures} test${failures === 1 ? "" : "s"} failed`);
process.exit(1);
