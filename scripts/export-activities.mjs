// Exports Strava activity history into src/activities.json for /activity-lookup.
//
// Auth (first match wins):
//   STRAVA_ACCESS_TOKEN
//   STRAVA_CLIENT_ID + STRAVA_CLIENT_SECRET + STRAVA_REFRESH_TOKEN
//
// Usage: node scripts/export-activities.mjs [--full]
//   Default: fetch only activities newer than the existing snapshot and merge them in
//   (usually a single API request). --full re-downloads the whole history, which costs
//   one request per 200 activities against Strava's per-app rate limit.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isPublic, toActivity } from "./strava-activity.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "activities.json");

async function getToken() {
  if (process.env.STRAVA_ACCESS_TOKEN) return process.env.STRAVA_ACCESS_TOKEN;
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = process.env;
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_REFRESH_TOKEN) {
    throw new Error("Set STRAVA_ACCESS_TOKEN or STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET/STRAVA_REFRESH_TOKEN");
  }
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      refresh_token: STRAVA_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  return (await res.json()).access_token;
}

async function readSnapshot() {
  try {
    return JSON.parse(await readFile(OUT, "utf8")).activities ?? [];
  } catch {
    return [];
  }
}

async function main() {
  const full = process.argv.includes("--full");
  const existing = full ? [] : await readSnapshot();
  // start_date_local is wall-clock time; back off a day so timezone skew can't drop activities.
  const after = existing[0]
    ? Math.floor(new Date(existing[0].start_date_local).getTime() / 1000) - 86_400
    : undefined;
  console.log(after ? `incremental update since ${existing[0].start_date_local}` : "full export");
  const token = await getToken();
  const all = [];
  for (let page = 1; ; page++) {
    const url = new URL("https://www.strava.com/api/v3/athlete/activities");
    url.searchParams.set("per_page", "200");
    url.searchParams.set("page", String(page));
    if (after) url.searchParams.set("after", String(after));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) {
      // Strava's short-term limit resets on 15-minute clock boundaries.
      const wait = 15 * 60_000 - (Date.now() % (15 * 60_000)) + 5_000;
      console.log(`\nrate limited, waiting ${Math.round(wait / 1000)}s`);
      await new Promise((r) => setTimeout(r, wait));
      page--;
      continue;
    }
    if (!res.ok) throw new Error(`Strava ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    if (batch.length === 0) break;
    all.push(...batch);
    process.stdout.write(`\rfetched ${all.length}`);
  }
  const fetchedIds = new Set(all.map((a) => a.id));
  const fresh = all.filter(isPublic).map(toActivity);
  const activities = [...fresh, ...existing.filter((a) => !fetchedIds.has(a.id))].sort((a, b) =>
    b.start_date_local.localeCompare(a.start_date_local),
  );
  await writeFile(
    OUT,
    JSON.stringify({ exported_at: new Date().toISOString(), activities }, null, 0) + "\n",
  );
  console.log(
    `\nfetched ${all.length}, wrote ${activities.length} public activities (${activities.length - existing.length >= 0 ? "+" : ""}${activities.length - existing.length}) to ${OUT}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
