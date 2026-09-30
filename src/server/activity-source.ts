// The activity list the functions serve: read live from spencer-brain at request time, so
// /activity-lookup, the Home latest-run card, and the Chicago week tracker pick up grokbot's
// export without a redeploy. Falls back to the snapshot bundled at build time when there is
// no BRAIN_GITHUB_TOKEN or the download fails, so the endpoints always answer.

import snapshot from "../activities.json" with { type: "json" };
import gradeFile from "../activity-grades.json" with { type: "json" };
import { withGrades, type Activity, type ActivityGrades } from "../lib/activitySearch.ts";
import type { ActivitySource } from "../lib/pulse.ts";
import { DEFAULT_ACTIVITIES_PATH, fetchBrainActivities } from "../../scripts/brain-activities.mjs";

declare const process: { env: Record<string, string | undefined> };

// Per instance. The CDN caches responses too (see CACHE_CONTROL), so a warm function reads
// GitHub at most once per TTL and most visitors never reach the function at all.
const TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 6_000;

export const CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";

const grades = gradeFile as ActivityGrades;

const bundled: ActivitySource = {
  exported_at: snapshot.exported_at,
  source: "snapshot",
  activities: withGrades(
    [...(snapshot.activities as Activity[])].sort((a, b) => b.start_date_local.localeCompare(a.start_date_local)),
    grades,
  ),
};

let live: { value: ActivitySource; at: number } | null = null;
let inflight: Promise<ActivitySource> | null = null;

async function readLive(token: string): Promise<ActivitySource> {
  const { activities } = await fetchBrainActivities({
    token,
    path: process.env.BRAIN_ACTIVITIES_PATH || DEFAULT_ACTIVITIES_PATH,
    ref: process.env.BRAIN_REF || undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { exported_at: new Date().toISOString(), source: "live", activities: withGrades(activities, grades) };
}

export async function loadActivities(): Promise<ActivitySource> {
  const token = process.env.BRAIN_GITHUB_TOKEN;
  if (!token) return bundled;
  if (live && Date.now() - live.at < TTL_MS) return live.value;
  inflight ??= readLive(token)
    .then((value) => {
      live = { value, at: Date.now() };
      return value;
    })
    .catch((err) => {
      // An older live copy beats the build snapshot.
      console.error("activity-source: live read failed, serving fallback:", err instanceof Error ? err.message : err);
      return live?.value ?? bundled;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
