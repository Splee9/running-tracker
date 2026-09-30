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
// The download, parsing, and public-only mapping live in brain-activities.mjs, shared with
// the /api/activities function.

import { access, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEFAULT_ACTIVITIES_PATH, fetchBrainActivities } from "./brain-activities.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "activities.json");

async function main() {
  const { BRAIN_GITHUB_TOKEN: token, BRAIN_REF: ref } = process.env;
  const filePath = process.env.BRAIN_ACTIVITIES_PATH || DEFAULT_ACTIVITIES_PATH;
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
  const { records, activities } = await fetchBrainActivities({ token, path: filePath, ref });
  await writeFile(
    OUT,
    JSON.stringify({ exported_at: new Date().toISOString(), activities }, null, 0) + "\n",
  );
  console.log(`read ${records} records, wrote ${activities.length} public activities to ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
