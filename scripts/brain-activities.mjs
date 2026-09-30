// Downloads the public Strava activities export from the private Splee9/spencer-brain repo
// and maps it to the Activity shape. Shared by fetch-activities.mjs (build time) and
// src/server/activity-source.ts (request time), so both apply the same public-only rules.

import { isPublic, toActivity } from "./strava-activity.mjs";

export const BRAIN_REPO = "Splee9/spencer-brain";
export const DEFAULT_ACTIVITIES_PATH = "data/public/strava-activities.json";

async function download(token, filePath, ref, signal) {
  const url = new URL(
    `https://api.github.com/repos/${BRAIN_REPO}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}`,
  );
  if (ref) url.searchParams.set("ref", ref);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.raw+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "running-tracker",
    },
    signal,
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${BRAIN_REPO}/${filePath}: ${await res.text()}`);
  return res.text();
}

// Accepts a JSON array of Strava activities, an object with an `activities` array, or JSONL.
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

/**
 * Public activities, newest first. Any download or format problem throws rather than
 * returning a stale or partial list.
 */
export async function fetchBrainActivities({ token, path = DEFAULT_ACTIVITIES_PATH, ref, signal }) {
  const records = parseRecords(await download(token, path, ref, signal));
  validate(records);
  const byId = new Map(records.filter(isPublic).map((a) => [a.id, toActivity(a)]));
  const activities = [...byId.values()].sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));
  if (activities.length === 0) throw new Error(`No public activities in ${BRAIN_REPO}/${path}`);
  return { records: records.length, activities };
}
