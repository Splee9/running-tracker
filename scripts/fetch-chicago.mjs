// Builds src/chicago-data.json for /training/chicago from the Chicago race-build snapshot
// that the box publishes to Splee9/spencer-brain (scripts/publish_running_tracker_chicago.py
// there). Runs before every Vercel build, so the box's deploy hook picks up the new file.
//
// Env:
//   BRAIN_GITHUB_TOKEN  fine-grained token with Contents: read on spencer-brain
//   BRAIN_CHICAGO_PATH  path inside spencer-brain (default: data/public/chicago-tracker.json)
//   BRAIN_REF           optional branch/tag/sha (default: the repo's default branch)
//
// Without BRAIN_GITHUB_TOKEN it keeps the committed src/chicago-data.json, so local builds
// work offline. With a token, any download or format problem fails the build, which leaves
// the previous deployment live instead of shipping a broken page.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { REPO, download } from "./brain-contents.mjs";

const DEFAULT_PATH = "data/public/chicago-tracker.json";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "chicago-data.json");

// The page reads these keys directly (src/lib/chicago-data.ts); refuse a file without them.
function validate(doc, source) {
  const missing = [];
  for (const k of ["meta", "crossBuild", "typeLabels", "trainingVariability"]) {
    if (doc?.[k] == null || typeof doc[k] !== "object") missing.push(k);
  }
  for (const k of ["phases", "weeks", "typeOrder"]) {
    if (!Array.isArray(doc?.[k]) || doc[k].length === 0) missing.push(k);
  }
  for (const k of ["raceDate", "currentWeek", "lastUpdated"]) {
    if (doc?.meta?.[k] == null) missing.push(`meta.${k}`);
  }
  if (missing.length) throw new Error(`${source} is missing ${missing.join(", ")}`);
}

async function main() {
  const { BRAIN_GITHUB_TOKEN: token, BRAIN_REF: ref } = process.env;
  const filePath = process.env.BRAIN_CHICAGO_PATH || DEFAULT_PATH;
  if (!token) {
    console.log(`BRAIN_GITHUB_TOKEN not set; keeping committed ${OUT}`);
    return;
  }
  const doc = JSON.parse(await download(token, filePath, ref));
  validate(doc, `${REPO}/${filePath}`);
  await writeFile(OUT, JSON.stringify(doc, null, 2) + "\n");
  console.log(
    `wrote ${OUT} (lastUpdated ${doc.meta.lastUpdated}, week ${doc.meta.currentWeek}, ${doc.weeks.length} weeks)`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
