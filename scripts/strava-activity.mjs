// Shared by export-activities.mjs and fetch-activities.mjs: which Strava activities are
// public, and how a Strava activity maps to the Activity shape in src/lib/activitySearch.ts.

export function isPublic(a) {
  return !a.private && (a.visibility ?? "everyone") === "everyone";
}

// spencer-brain guesses some places from the activity name. These guesses are wrong.
// The Shamrock Shuffle is a Chicago race, not Washington DC.
const NAME_PLACE_FIXES = [[/\bshamrock shuffle\b/i, "Chicago"]];

// A virtual or trainer session happens nowhere: Zwift's "New York" is a game world.
function placeFor(a, sportType) {
  if (a.place === undefined) return undefined;
  if (a.trainer || sportType.startsWith("Virtual")) return null;
  if (a.place_source === "name") {
    const fix = NAME_PLACE_FIXES.find(([pattern]) => pattern.test(a.name ?? ""));
    if (fix) return fix[1];
  }
  return a.place;
}

export function toActivity(a) {
  const base = {
    id: a.id,
    name: a.name,
    sport_type: a.sport_type ?? a.type,
    start_date_local: a.start_date_local,
    distance_m: Math.round(a.distance ?? 0),
    moving_time_s: a.moving_time ?? 0,
    elevation_gain_m: Math.round(a.total_elevation_gain ?? 0),
    workout_type: a.workout_type ?? null,
    trainer: Boolean(a.trainer),
  };
  // v2 enrichment (omit undefined fields to keep backward compatibility)
  if (a.primary_stimulus !== undefined) base.primary_stimulus = a.primary_stimulus;
  if (Array.isArray(a.modifiers) && a.modifiers.length > 0) base.modifiers = a.modifiers;
  const virtual = Boolean(a.trainer) || (base.sport_type ?? "").startsWith("Virtual");
  const place = placeFor(a, base.sport_type ?? "");
  if (place != null) {
    base.place = place;
    if (a.place_source !== undefined) base.place_source = a.place_source;
  }
  if (a.lap_count !== undefined) base.lap_count = a.lap_count;
  if (a.hard_lap_count !== undefined) base.hard_lap_count = a.hard_lap_count;
  if (a.has_intervals !== undefined) base.has_intervals = a.has_intervals;
  if (a.interval_score !== undefined) base.interval_score = a.interval_score;
  if (a.stimulus_cluster !== undefined && a.stimulus_cluster !== "") base.stimulus_cluster = a.stimulus_cluster;
  if (a.modality !== undefined && a.modality !== "") base.modality = a.modality;
  if (a.low_confidence) base.low_confidence = true;
  // v3 enrichment (omit undefined fields to keep backward compatibility)
  if (a.average_heartrate !== undefined) base.average_heartrate = a.average_heartrate;
  if (a.max_heartrate !== undefined) base.max_heartrate = a.max_heartrate;
  if (a.average_speed !== undefined) base.average_speed = a.average_speed;
  if (a.max_speed !== undefined) base.max_speed = a.max_speed;
  if (a.average_watts !== undefined) base.average_watts = a.average_watts;
  if (a.weighted_average_watts !== undefined) base.weighted_average_watts = a.weighted_average_watts;
  // MMP fields (public-activities-v4 schema)
  if (a.best_watts_5s !== undefined) base.best_watts_5s = a.best_watts_5s;
  if (a.best_watts_1m !== undefined) base.best_watts_1m = a.best_watts_1m;
  if (a.best_watts_5m !== undefined) base.best_watts_5m = a.best_watts_5m;
  if (a.best_watts_20m !== undefined) base.best_watts_20m = a.best_watts_20m;
  if (a.best_watts_60m !== undefined) base.best_watts_60m = a.best_watts_60m;
  // Public description only. Ranking text for Jev — the lookup cards do not render it.
  // Leave out GPS, polylines, and streams; those stay off the public site.
  if (typeof a.description === "string" && a.description.trim()) {
    base.description = a.description.trim();
  }
  // public-activities-v5 enrichment. Only names and numbers: the export already drops
  // coordinates and gear ids, and these copies keep it that way.
  const placeEnriched = virtual ? null : placeNames(a.place_enriched);
  if (placeEnriched) base.place_enriched = placeEnriched;
  const race = raceResult(a.race);
  if (race) base.race = race;
  if (typeof a.workout_structure === "string" && a.workout_structure.trim()) {
    base.workout_structure = a.workout_structure.trim();
  }
  if (Array.isArray(a.gear)) {
    const gear = a.gear.filter((g) => typeof g === "string" && g.trim()).map((g) => g.trim());
    if (gear.length > 0) base.gear = gear;
  }
  const count = a.with?.athlete_count;
  if (Number.isInteger(count) && count > 1) base.athlete_count = count;
  return base;
}

function placeNames(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const key of ["city", "region", "country"]) {
    if (typeof raw[key] === "string" && raw[key].trim()) out[key] = raw[key].trim();
  }
  return Object.keys(out).length > 0 ? out : null;
}

// The export writes short codes for some official distances.
const RACE_DISTANCE_CODES = { m: "marathon", hm: "half" };

function raceResult(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  if (typeof raw.event_name === "string" && raw.event_name.trim()) out.event_name = raw.event_name.trim();
  if (typeof raw.distance === "string" && raw.distance.trim()) {
    const code = raw.distance.trim().toLowerCase();
    out.distance = RACE_DISTANCE_CODES[code] ?? code;
  }
  if (Number.isFinite(raw.official_distance_m)) out.official_distance_m = raw.official_distance_m;
  if (Number.isFinite(raw.result_time_s)) out.result_time_s = raw.result_time_s;
  if (typeof raw.is_pr === "boolean") out.is_pr = raw.is_pr;
  return Object.keys(out).length > 0 ? out : null;
}
