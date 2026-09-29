// Shared by export-activities.mjs and fetch-activities.mjs: which Strava activities are
// public, and how a Strava activity maps to the Activity shape in src/lib/activitySearch.ts.

export function isPublic(a) {
  return !a.private && (a.visibility ?? "everyone") === "everyone";
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
  if (a.place !== undefined) base.place = a.place;
  if (a.place_source !== undefined) base.place_source = a.place_source;
  if (a.lap_count !== undefined) base.lap_count = a.lap_count;
  if (a.hard_lap_count !== undefined) base.hard_lap_count = a.hard_lap_count;
  if (a.has_intervals !== undefined) base.has_intervals = a.has_intervals;
  if (a.interval_score !== undefined) base.interval_score = a.interval_score;
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
  return base;
}
