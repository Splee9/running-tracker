// GET /api/pulse → Pulse
// The newest activities only, for the Home latest-run card and the Chicago "this week"
// stat. Small enough to load on every page view; the week is summed in the browser so it
// follows the viewer's calendar.

import type { Pulse } from "../lib/pulse.ts";
import { CACHE_CONTROL, json, loadActivities } from "./activity-source.ts";

export const maxDuration = 10;

// Covers well over a week even on double days and bike commutes.
const RECENT = 60;

export async function GET() {
  const { exported_at, source, activities } = await loadActivities();
  const body: Pulse = { exported_at, source, recent: activities.slice(0, RECENT) };
  return json(body, 200, { "Cache-Control": CACHE_CONTROL });
}
