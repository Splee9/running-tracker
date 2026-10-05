// Builds src/data.json for / and /miles from the lifetime mileage snapshot the box
// publishes to Splee9/spencer-brain (data/public/miles-tracker.json). Runs before
// every Vercel build, so the box's deploy hook picks up the new file.
//
// Env:
//   BRAIN_GITHUB_TOKEN  fine-grained token with Contents: read on spencer-brain
//   BRAIN_MILES_PATH    path inside spencer-brain (default: data/public/miles-tracker.json)
//   BRAIN_REF           optional branch/tag/sha (default: the repo's default branch)
//
// Without BRAIN_GITHUB_TOKEN it keeps the committed src/data.json, so local builds
// work offline. With a token, any download or format problem fails the build, which
// leaves the previous deployment live instead of shipping a broken page.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { REPO, download } from "./brain-contents.mjs";

const DEFAULT_PATH = "data/public/miles-tracker.json";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "data.json");

// The page reads these keys directly (src/lib/data.ts); refuse a file without them.
export function validate(doc, source) {
  const missing = [];
  for (const k of ["years", "monthly", "raceEvents", "marathonResults"]) {
    const emptyRequired = (k === "years" || k === "monthly") && doc?.[k]?.length === 0;
    if (!Array.isArray(doc?.[k]) || emptyRequired) missing.push(k);
  }
  if (typeof doc?.firstRun !== "string" || doc.firstRun === "") missing.push("firstRun");
  if (typeof doc?.lastUpdated !== "string" || doc.lastUpdated === "") missing.push("lastUpdated");
  if (typeof doc?.ytdFraction !== "number" || !Number.isFinite(doc.ytdFraction)) missing.push("ytdFraction");
  if (missing.length) throw new Error(`${source} is missing ${missing.join(", ")}`);
}

async function main() {
  const { BRAIN_GITHUB_TOKEN: token, BRAIN_REF: ref } = process.env;
  const filePath = process.env.BRAIN_MILES_PATH || DEFAULT_PATH;
  if (!token) {
    console.log(`BRAIN_GITHUB_TOKEN not set; keeping committed ${OUT}`);
    return;
  }
  const doc = JSON.parse(await download(token, filePath, ref));
  validate(doc, `${REPO}/${filePath}`);
  await writeFile(OUT, JSON.stringify(doc, null, 2) + "\n");
  console.log(
    `wrote ${OUT} (lastUpdated ${doc.lastUpdated}, ${doc.years.length} years, ${doc.monthly.length} months)`,
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
