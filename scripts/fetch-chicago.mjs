// Builds src/chicago-data.json for /training/chicago from the public Chicago tracker
// export that grokbot keeps in the private Splee9/spencer-brain repo. Runs before every
// Netlify build, on the same path as scripts/fetch-activities.mjs.
//
// The export must be a tracked file: the vault's raw/metrics.db and raw/exports/ are
// gitignored, so the contents API can't serve them.
//
// Env:
//   BRAIN_GITHUB_TOKEN   fine-grained token with Contents: read on spencer-brain
//   BRAIN_CHICAGO_PATH   path inside spencer-brain (default: data/public/chicago-tracker.json)
//   BRAIN_REF            optional branch/tag/sha (default: the repo's default branch)
//
// Without BRAIN_GITHUB_TOKEN it keeps an existing src/chicago-data.json, so local builds
// work offline. With a token, any download or format problem fails the build rather than
// shipping a stale file. The committed JSON is only a fallback — this script does not
// invent race numbers.

import { access, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO = "Splee9/spencer-brain";
const DEFAULT_PATH = "data/public/chicago-tracker.json";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "chicago-data.json");

const TOP_LEVEL = ["meta", "phases", "weeks"];
const META_FIELDS = ["lastUpdated", "daysToRace", "raceDate", "currentWeek"];

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

function validateTracker(data) {
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("chicago tracker must be a JSON object");
  }
  const missing = TOP_LEVEL.filter((key) => !Object.hasOwn(data, key));
  if (missing.length) throw new Error(`missing top-level keys: ${missing.join(", ")}`);
  const { meta, phases, weeks } = data;
  if (meta == null || typeof meta !== "object" || Array.isArray(meta)) {
    throw new Error("meta must be an object");
  }
  if (!Array.isArray(phases) || phases.length === 0) throw new Error("phases must be a non-empty array");
  if (!Array.isArray(weeks) || weeks.length === 0) throw new Error("weeks must be a non-empty array");
  const missingMeta = META_FIELDS.filter((key) => meta[key] == null || meta[key] === "");
  if (missingMeta.length) throw new Error(`meta is missing ${missingMeta.join(", ")}`);
  for (const key of ["lastUpdated", "raceDate"]) {
    if (typeof meta[key] !== "string") throw new Error(`meta.${key} must be a string`);
  }
  for (const key of ["daysToRace", "currentWeek"]) {
    if (typeof meta[key] !== "number" || !Number.isFinite(meta[key])) {
      throw new Error(`meta.${key} must be a finite number`);
    }
  }
}

function parseTracker(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`chicago tracker file is not valid JSON: ${err.message}`);
  }
  validateTracker(data);
  return data;
}

async function main() {
  const { BRAIN_GITHUB_TOKEN: token, BRAIN_REF: ref } = process.env;
  const filePath = process.env.BRAIN_CHICAGO_PATH || DEFAULT_PATH;
  if (!token) {
    try {
      await access(OUT);
    } catch {
      throw new Error(`No BRAIN_GITHUB_TOKEN and no existing ${OUT} to fall back to`);
    }
    console.log(`BRAIN_GITHUB_TOKEN not set; keeping existing ${OUT}`);
    return;
  }
  const body = (await download(token, filePath, ref)).replace(/^\uFEFF/, "").trim();
  const data = parseTracker(body);
  await writeFile(OUT, `${body}\n`);
  console.log(
    `wrote ${OUT} from ${REPO}/${filePath} (lastUpdated ${data.meta.lastUpdated}, daysToRace ${data.meta.daysToRace}, currentWeek ${data.meta.currentWeek})`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
