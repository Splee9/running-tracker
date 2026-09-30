// Builds src/activities.json for /activity-lookup from the public Strava activities export
// that grokbot keeps up to date in the private Splee9/spencer-brain repo. Runs before every
// Vercel build.
//
// The export must be a tracked file: the vault's raw/metrics.db and raw/exports/ are
// gitignored, so the contents API can't serve them.
//
// Env:
//   BRAIN_GITHUB_TOKEN     fine-grained token with Contents: read on spencer-brain
//   BRAIN_ACTIVITIES_PATH  path inside spencer-brain (default: data/public/strava-activities.json)
//   BRAIN_REF              optional branch/tag/sha (default: the repo's default branch)
//
// Without BRAIN_GITHUB_TOKEN it keeps an existing src/activities.json, so local builds work
// offline; if there is none it writes an empty placeholder (except on Vercel, where that
// would ship an empty lookup, so it fails instead). With a token, any download or format problem fails the build rather than
// shipping a stale or partial list.
//
// Accepts a JSON array of Strava activities, an object with an `activities` array, or JSONL.

import { access, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isPublic, toActivity } from "./strava-activity.mjs";

const REPO = "Splee9/spencer-brain";
const DEFAULT_PATH = "data/public/strava-activities.json";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "activities.json");

async function download(token, filePath, ref) {
  const url = new URL(
    `https://api.github.com/repos/${REPO}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}`,
  );
  if (ref) url.searchParams.set("ref", ref);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.raw+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "running-tracker-build",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${REPO}/${filePath}: ${await res.text()}`);
  return res.text();
}

function parseRecords(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed);
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.activities)) return data.activities;
      if (data.id != null) return [data];
      throw new Error("expected an array or an object with an `activities` array");
    } catch (err) {
      if (!trimmed.startsWith("{") || !(err instanceof SyntaxError)) throw err;
    }
  }
  return trimmed
    .split("\n")
    .filter((line) => line.trim())
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`line ${i + 1} is not valid JSON`);
      }
    });
}

// isPublic treats a record with no visibility fields as public, so refuse any record that
// carries neither: it would mean the file isn't raw Strava data and private activities
// could end up on the public site.
function validate(records) {
  records.forEach((a, i) => {
    const missing = ["id", "name", "start_date_local"].filter((k) => a?.[k] == null);
    if (a?.sport_type == null && a?.type == null) missing.push("sport_type|type");
    if (a?.private === undefined && a?.visibility === undefined) missing.push("private|visibility");
    if (missing.length) throw new Error(`record ${i} (id ${a?.id}) is missing ${missing.join(", ")}`);
  });
}

async function main() {
  const { BRAIN_GITHUB_TOKEN: token, BRAIN_REF: ref } = process.env;
  const filePath = process.env.BRAIN_ACTIVITIES_PATH || DEFAULT_PATH;
  if (!token) {
    try {
      await access(OUT);
      console.log(`BRAIN_GITHUB_TOKEN not set; keeping existing ${OUT}`);
      return;
    } catch {
      // A deploy without the token must not ship an empty /activity-lookup.
      if (process.env.VERCEL) {
        throw new Error(`No BRAIN_GITHUB_TOKEN and no existing ${OUT} to fall back to`);
      }
    }
    // Fresh clones and CI: an empty list lets the site type-check and build.
    await writeFile(OUT, JSON.stringify({ exported_at: null, activities: [] }) + "\n");
    console.log(`BRAIN_GITHUB_TOKEN not set; wrote an empty placeholder ${OUT}`);
    return;
  }
  const records = parseRecords(await download(token, filePath, ref));
  validate(records);
  const byId = new Map(records.filter(isPublic).map((a) => [a.id, toActivity(a)]));
  const activities = [...byId.values()].sort((a, b) =>
    b.start_date_local.localeCompare(a.start_date_local),
  );
  if (activities.length === 0) throw new Error(`No public activities in ${REPO}/${filePath}`);
  await writeFile(
    OUT,
    JSON.stringify({ exported_at: new Date().toISOString(), activities }, null, 0) + "\n",
  );
  console.log(`read ${records.length} records, wrote ${activities.length} public activities to ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
