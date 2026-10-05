// Builds the /training JSON from the snapshots the box publishes to
// Splee9/spencer-brain. Runs before every Vercel build, so the box's deploy hook
// picks up both files together:
//
//   data/public/training-variability.json    → src/training-variability.json
//   data/public/training-weekly-hours.json   → src/training-weekly-hours.json
//
// Env:
//   BRAIN_GITHUB_TOKEN       fine-grained token with Contents: read on spencer-brain
//   BRAIN_TV_PATH            path inside spencer-brain (default above)
//   BRAIN_WEEKLY_HOURS_PATH  path inside spencer-brain (default above)
//   BRAIN_REF                optional branch/tag/sha (default: the repo's default branch)
//
// Without BRAIN_GITHUB_TOKEN it keeps the committed files, so local builds work
// offline. With a token, any download or format problem fails the build, which
// leaves the previous deployment live instead of shipping a broken page. Both
// files are validated before either is written, so a bad download cannot leave
// variability and weekly hours out of step on disk.
//
// scripts/derive_weekly_hours.py can still rebuild the hours file from a local
// variability export. Deploys prefer the vault hours file.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { REPO, download } from "./brain-contents.mjs";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const SPORTS = ["run", "bike", "all"];
const HORIZONS = ["short", "medium", "long"];

const TV_OUT = path.join(SRC, "training-variability.json");
const HOURS_OUT = path.join(SRC, "training-weekly-hours.json");

// The page indexes series/current by sport and horizon (src/lib/training.ts).
export function validateTv(doc, source) {
  const missing = [];
  for (const k of ["as_of", "last_complete_week_end"]) {
    if (typeof doc?.[k] !== "string" || doc[k] === "") missing.push(k);
  }
  for (const k of ["series", "current"]) {
    if (doc?.[k] == null || typeof doc[k] !== "object" || Array.isArray(doc[k])) missing.push(k);
  }
  if (doc?.series != null && typeof doc.series === "object" && !Array.isArray(doc.series)) {
    for (const sport of SPORTS) {
      for (const horizon of HORIZONS) {
        const points = doc.series?.[sport]?.[horizon];
        if (!Array.isArray(points) || points.length === 0) missing.push(`series.${sport}.${horizon}`);
      }
    }
  }
  if (doc?.current != null && typeof doc.current === "object" && !Array.isArray(doc.current)) {
    for (const sport of SPORTS) {
      for (const horizon of HORIZONS) {
        const point = doc.current?.[sport]?.[horizon];
        if (point == null || typeof point !== "object" || Array.isArray(point)) {
          missing.push(`current.${sport}.${horizon}`);
        }
      }
    }
  }
  if (missing.length) throw new Error(`${source} is missing ${missing.join(", ")}`);
}

// weeks and hours are parallel arrays the chart reads together.
export function validateHours(doc, source) {
  const missing = [];
  const weeks = doc?.weeks;
  if (!Array.isArray(weeks) || weeks.length === 0) missing.push("weeks");
  if (doc?.hours == null || typeof doc.hours !== "object" || Array.isArray(doc.hours)) {
    missing.push("hours");
  } else if (Array.isArray(weeks) && weeks.length > 0) {
    for (const sport of SPORTS) {
      const hours = doc.hours[sport];
      const aligned =
        Array.isArray(hours) &&
        hours.length === weeks.length &&
        hours.every((n) => typeof n === "number" && Number.isFinite(n));
      if (!aligned) missing.push(`hours.${sport}`);
    }
  }
  if (missing.length) throw new Error(`${source} is missing ${missing.join(", ")}`);
}

async function main() {
  const { BRAIN_GITHUB_TOKEN: token, BRAIN_REF: ref } = process.env;
  if (!token) {
    console.log(`BRAIN_GITHUB_TOKEN not set; keeping committed ${TV_OUT}`);
    console.log(`BRAIN_GITHUB_TOKEN not set; keeping committed ${HOURS_OUT}`);
    return;
  }

  const tvPath = process.env.BRAIN_TV_PATH || "data/public/training-variability.json";
  const hoursPath = process.env.BRAIN_WEEKLY_HOURS_PATH || "data/public/training-weekly-hours.json";

  const [tvText, hoursText] = await Promise.all([
    download(token, tvPath, ref),
    download(token, hoursPath, ref),
  ]);
  const tv = JSON.parse(tvText);
  const hours = JSON.parse(hoursText);
  validateTv(tv, `${REPO}/${tvPath}`);
  validateHours(hours, `${REPO}/${hoursPath}`);

  await writeFile(TV_OUT, JSON.stringify(tv, null, 2) + "\n");
  await writeFile(HOURS_OUT, JSON.stringify(hours) + "\n");
  console.log(
    `wrote ${TV_OUT} (as_of ${tv.as_of}, last complete week ${tv.last_complete_week_end})`,
  );
  console.log(`wrote ${HOURS_OUT} (${hours.weeks.length} weeks)`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
