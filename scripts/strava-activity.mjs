// Shared by export-activities.mjs and fetch-activities.mjs: which Strava activities are
// public, and how a Strava activity maps to the Activity shape in src/lib/activitySearch.ts.

export function isPublic(a) {
  return !a.private && (a.visibility ?? "everyone") === "everyone";
}

export function toActivity(a) {
  return {
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
}
