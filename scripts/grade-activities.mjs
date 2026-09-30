// Grades every activity once with a query-independent Jev Score ("how much does this session
// stand out") and stores the result in src/activity-grades.json, which is committed. Activity
// Lookup orders "best" searches by it without a Jev call at search time.
//
// Run: npm run grade -- [--dry-run] [--limit N]
//
// Env: TYPESAFE_API_KEY or OPENROUTER_API_KEY (same as the Vercel function), optional
// JEV_MODEL / JEV_API_URL. Needs src/activities.json (scripts/fetch-activities.mjs).
//
// Only ungraded activities are sent, one activity per request so no state carries another
// session's details. Grades from a different model are discarded and redone: levels are
// calibrated to one model.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildGradeRequest, readStandout } from "../src/lib/activitySearch.ts";
import { getJevProvider } from "../src/lib/jevProvider.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACTIVITIES = path.join(ROOT, "src", "activities.json");
const GRADES = path.join(ROOT, "src", "activity-grades.json");
const CONCURRENCY = 6;
const TIMEOUT_MS = 15_000;
const RETRY_STATUSES = new Set([429, 529]);
const SAVE_EVERY = 50;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitAt = args.indexOf("--limit");
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function save(file) {
  const sorted = Object.fromEntries(
    Object.entries(file.grades).sort(([a], [b]) => Number(a) - Number(b)),
  );
  await writeFile(GRADES, `${JSON.stringify({ model: file.model, grades: sorted }, null, 2)}\n`);
}

async function grade(provider, activity) {
  const request = buildGradeRequest(activity);
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(provider.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json", ...provider.headers },
        body: JSON.stringify({ model: provider.model, state: request.state, questions: request.questions }),
        signal: controller.signal,
      });
      if (RETRY_STATUSES.has(res.status) && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const score = readStandout(data.answers);
      if (score === null) throw new Error("response had no standout score");
      return score;
    } finally {
      clearTimeout(timer);
    }
  }
}

const snapshot = await readJson(ACTIVITIES).catch(() => {
  console.error(`Missing ${path.relative(ROOT, ACTIVITIES)}. Run scripts/fetch-activities.mjs first.`);
  process.exit(1);
});
const file = await readJson(GRADES).catch(() => ({ model: null, grades: {} }));
const provider = getJevProvider(process.env);

if (provider && file.model && file.model !== provider.model && Object.keys(file.grades).length > 0) {
  console.log(`Grades came from ${file.model}; regrading everything with ${provider.model}.`);
  file.grades = {};
}

const todo = snapshot.activities.filter((a) => file.grades[String(a.id)] === undefined).slice(0, limit);
console.log(`${snapshot.activities.length} activities, ${todo.length} to grade.`);

if (dryRun) {
  if (todo[0]) console.log(JSON.stringify(buildGradeRequest(todo[0]), null, 2));
  process.exit(0);
}
if (!provider) {
  console.error("Set TYPESAFE_API_KEY or OPENROUTER_API_KEY to grade.");
  process.exit(1);
}
if (todo.length === 0) process.exit(0);

file.model = provider.model;
let done = 0;
let failed = 0;
let next = 0;
let saving = Promise.resolve();
async function worker() {
  while (next < todo.length) {
    const activity = todo[next++];
    try {
      file.grades[String(activity.id)] = { standout: Math.round((await grade(provider, activity)) * 100) / 100 };
      done++;
      if (done % SAVE_EVERY === 0) {
        // Chain saves so two workers never write the file at once.
        saving = saving.then(() => save(file));
        await saving;
        console.log(`${done}/${todo.length}`);
      }
    } catch (err) {
      failed++;
      console.error(`${activity.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await saving;
await save(file);
console.log(`Graded ${done}; ${failed} failed and will be retried on the next run.`);
if (failed > 0) process.exitCode = 1;
