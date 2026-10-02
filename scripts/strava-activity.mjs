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

function enrichedPlace(a) {
  return a.place_enriched && typeof a.place_enriched === "object" ? a.place_enriched : null;
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

// GPS names only. Coordinates on place_enriched or a nested place object are dropped.
// place_enriched is the brain export. Flat place_city / place_region / place_country still fill gaps.
function structuredPlace(a, sportType) {
  if (a.trainer || sportType.startsWith("Virtual")) return {};
  const enriched = enrichedPlace(a);
  const nested = nestedPlace(a);
  const city = cleanString(enriched?.city ?? a.place_city ?? a.city ?? nested?.city);
  const region = cleanString(enriched?.region ?? a.place_region ?? a.region ?? nested?.region);
  const country = cleanString(enriched?.country ?? a.place_country ?? a.country ?? nested?.country);
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
  // Band code ("5k", "hm", "m") or a longer label. Not the activity's metre distance.
  const band = cleanString(raw.distance);
  if (band) race.distance = band;
  const officialM = raw.official_distance_m;
  if (typeof officialM === "number" && Number.isFinite(officialM)) race.official_distance_m = officialM;
  const time = raw.result_time_s;
  if (typeof time === "number" && Number.isFinite(time)) race.result_time_s = time;
  if (typeof raw.is_pr === "boolean") race.is_pr = raw.is_pr;
  return Object.keys(race).length > 0 ? race : undefined;
}

function gearFor(a) {
  if (typeof a.gear === "string") return cleanString(a.gear);
  if (Array.isArray(a.gear)) {
    const names = a.gear.map((item) => cleanString(typeof item === "string" ? item : item?.name)).filter(Boolean);
    return names.length > 0 ? names.join(", ") : undefined;
  }
  if (a.gear && typeof a.gear === "object") return cleanString(a.gear.name);
  return undefined;
}

function positiveCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** A published probability. Values outside 0–1 are left off rather than rescaled. */
function unitInterval(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;
}

function primaryConfidenceFor(a) {
  return unitInterval(a.primary_confidence) ?? unitInterval(a.confidence) ?? unitInterval(a.stimulus_confidence);
}

function probabilitiesFor(a) {
  const raw = a.probabilities ?? a.stimulus_probabilities;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== "string" || !key.trim()) continue;
    const n = unitInterval(value);
    if (n === undefined) continue;
    out[key] = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function runnerUpFor(a) {
  return cleanString(a.runner_up) ?? cleanString(a.secondary_stimulus);
}

function companionsFor(a) {
  const withRecord = a.with && typeof a.with === "object" && !Array.isArray(a.with) ? a.with : null;
  const names = Array.isArray(a.with)
    ? a.with.map(cleanString).filter(Boolean)
    : undefined;
  const one = typeof a.with === "string" ? cleanString(a.with) : undefined;
  const count = positiveCount(withRecord?.athlete_count) ?? positiveCount(a.athlete_count);
  return {
    ...(names && names.length > 0 ? { with: names } : {}),
    ...(one ? { with: [one] } : {}),
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
  // Layer A: classification confidence for the stimulus label. `primary_confidence`
  // wins; `confidence` and `stimulus_confidence` are older aliases. Not a fit score.
  const primaryConfidence = primaryConfidenceFor(a);
  if (primaryConfidence !== undefined) base.primary_confidence = primaryConfidence;
  const probabilities = probabilitiesFor(a);
  if (probabilities) base.probabilities = probabilities;
  const runnerUp = runnerUpFor(a);
  if (runnerUp) base.runner_up = runnerUp;
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
