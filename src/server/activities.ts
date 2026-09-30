// GET /api/activities → ActivitySource
// The full public activity list for /activity-lookup, graded and newest first.

import { CACHE_CONTROL, json, loadActivities } from "./activity-source.ts";

export const maxDuration = 10;

export async function GET() {
  return json(await loadActivities(), 200, { "Cache-Control": CACHE_CONTROL });
}
