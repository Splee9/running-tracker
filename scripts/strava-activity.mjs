// Shared by export-activities.mjs and fetch-activities.mjs: which Strava activities are
// public, and how a Strava activity maps to the Activity shape in src/lib/activitySearch.ts.

export function isPublic(a) {
  return !a.private && (a.visibility ?? "everyone") === "everyone";
}

// spencer-brain guesses some places from the activity name. These guesses are wrong.
// The Shamrock Shuffle is a Chicago race, not Washington DC.
const NAME_PLACE_FIXES = [[/\bshamrock shuffle\b/i, "Chicago"]];

function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nestedPlace(a) {
  return a.place && typeof a.place === "object" ? a.place : null;
}

function placeString(a) {
  if (typeof a.place === "string") return a.place;
  return cleanString(nestedPlace(a)?.city);
}

// A virtual or trainer session happens nowhere: Zwift's "New York" is a game world.
function placeFor(a, sportType) {
  const raw = placeString(a);
  if (raw === undefined) return undefined;
  if (a.trainer || sportType.startsWith("Virtual")) return null;
  if (a.place_source === "name") {
    const fix = NAME_PLACE_FIXES.find(([pattern]) => pattern.test(a.name ?? ""));
    if (fix) return fix[1];
  }
  return raw;
}

// GPS names only. Coordinates on a nested place object are dropped.
function structuredPlace(a, sportType) {
  if (a.trainer || sportType.startsWith("Virtual")) return {};
  const nested = nestedPlace(a);
  const city = cleanString(a.place_city ?? a.city ?? nested?.city);
  const region = cleanString(a.place_region ?? a.region ?? nested?.region);
  const country = cleanString(a.place_country ?? a.country ?? nested?.country);
  return {
    ...(city ? { place_city: city } : {}),
    ...(region ? { place_region: region } : {}),
    ...(country ? { place_country: country } : {}),
  };
}

function raceFor(a) {
  const raw = a.race;
  if (!raw || typeof raw !== "object") return undefined;
  const race = {};
  const eventName = cleanString(raw.event_name);
  if (eventName) race.event_name = eventName;
  const distance = cleanString(raw.official_distance ?? raw.distance);
  if (distance) race.official_distance = distance;
  const time = raw.result_time;
  if (typeof time === "number" && Number.isFinite(time)) race.result_time = time;
  else if (typeof time === "string" && time.trim()) race.result_time = time.trim();
  if (typeof raw.is_pr === "boolean") race.is_pr = raw.is_pr;
  return Object.keys(race).length > 0 ? race : undefined;
}

function gearFor(a) {
  if (typeof a.gear === "string") return cleanString(a.gear);
  if (a.gear && typeof a.gear === "object") return cleanString(a.gear.name);
  return undefined;
}

function companionsFor(a) {
  let names;
  if (Array.isArray(a.with)) {
    names = a.with.map(cleanString).filter(Boolean);
  } else {
    const one = cleanString(a.with);
    if (one) names = [one];
  }
  const count = typeof a.athlete_count === "number" && Number.isFinite(a.athlete_count) && a.athlete_count > 0
    ? a.athlete_count
    : undefined;
  return {
    ...(names && names.length > 0 ? { with: names } : {}),
    ...(count != null ? { athlete_count: count } : {}),
  };
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
  const place = placeFor(a, base.sport_type ?? "");
  if (place != null) {
    base.place = place;
    if (a.place_source !== undefined) base.place_source = a.place_source;
    else if (nestedPlace(a)) base.place_source = "gps";
  }
  Object.assign(base, structuredPlace(a, base.sport_type ?? ""));
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
  const race = raceFor(a);
  if (race) base.race = race;
  const structure = cleanString(a.workout_structure);
  if (structure) base.workout_structure = structure;
  const gear = gearFor(a);
  if (gear) base.gear = gear;
  Object.assign(base, companionsFor(a));
  return base;
}
