// Measures Activity Lookup ranking on hand-labeled queries, so the membership floor
// (MEMBERSHIP_DEMOTE_BELOW) and the Choice confidence bar are set from your own data.
//
// Run: npm run eval:jev -- [--dry-run] [--labels eval/jev-labels.json]
//
// Labels: a JSON array of { "query": "...", "relevant": [activity ids] }. Start from
// eval/jev-labels.example.json. Replays what the page and function do: code parse, shortlist,
// one packed Jev call, facet gap-fill (and a second call when it changes the filters), then
// the rerank at each floor. Jev responses are cached in eval/.cache, so reruns are free.
// --dry-run skips Jev and reports whether the shortlist contains the labeled activities at all.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import gradeFile from "../src/activity-grades.json" with { type: "json" };
import {
  applyJevIntent,
  buildIndex,
  buildJevRequest,
  classifyIntent,
  intentHardKey,
  MEMBERSHIP_DEMOTE_BELOW,
  rankGradeFor,
  rerankUnlockedHits,
  searchActivities,
  settledIntentPayload,
  splitJevAnswers,
  withGrades,
} from "../src/lib/activitySearch.ts";
import { getJevProvider } from "../src/lib/jevProvider.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "eval", ".cache");
const CANDIDATES = 25;
const FLOORS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const labelsAt = args.indexOf("--labels");
const labelsPath = path.resolve(ROOT, labelsAt >= 0 ? args[labelsAt + 1] : "eval/jev-labels.json");

async function readJson(file, missing) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    console.error(missing);
    process.exit(1);
  }
}

const snapshot = await readJson(path.join(ROOT, "src", "activities.json"), "Missing src/activities.json. Run scripts/fetch-activities.mjs first.");
const labels = await readJson(labelsPath, `Missing ${path.relative(ROOT, labelsPath)}. Copy eval/jev-labels.example.json and label your own queries.`);
const activities = withGrades(snapshot.activities, gradeFile);
const standoutGraded = activities.some((a) => a.standout !== undefined);
const byId = new Map(activities.map((a) => [a.id, a]));
const index = buildIndex(activities);
const provider = getJevProvider(process.env);
if (!dryRun && !provider) {
  console.error("Set TYPESAFE_API_KEY or OPENROUTER_API_KEY, or pass --dry-run.");
  process.exit(1);
}

async function askJev(request) {
  // Like the function: no candidates and no facets to ask means nothing to send.
  if (Object.keys(request.questions).length === 0) return { answers: {} };
  const body = JSON.stringify({ model: provider.model, state: request.state, questions: request.questions });
  const file = path.join(CACHE, `${createHash("sha256").update(body).digest("hex").slice(0, 32)}.json`);
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    // Not cached yet.
  }
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json", ...provider.headers },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(data));
  return data;
}

function shortlist(query, classification) {
  return searchActivities(index, query, 500, undefined, classification);
}

async function judge(query) {
  const code = classifyIntent(query);
  let classification = code;
  let hits = shortlist(query, code);
  const pack = (list, c, includeFacets) =>
    buildJevRequest(
      query,
      list.slice(0, CANDIDATES).map((h) => byId.get(h.activity.id)),
      undefined,
      settledIntentPayload(c),
      includeFacets === undefined ? {} : { includeFacets },
    );
  let split = splitJevAnswers((await askJev(pack(hits, code))).answers ?? {});
  const facets = split.facets;
  const merged = applyJevIntent(code, facets);
  if (intentHardKey(merged) !== intentHardKey(code)) {
    classification = merged;
    hits = shortlist(query, merged);
    split = splitJevAnswers((await askJev(pack(hits, merged, false))).answers ?? {});
  }
  return { classification, hits, scores: split.scores, companions: split.companions, facets };
}

function firstRelevantRank(ranked, relevant) {
  const at = ranked.findIndex((hit) => relevant.has(hit.activity.id));
  return at < 0 ? null : at + 1;
}

const results = [];
for (const { query, relevant: ids } of labels) {
  const relevant = new Set(ids);
  if (dryRun) {
    const hits = shortlist(query, classifyIntent(query));
    const rank = firstRelevantRank(hits, relevant);
    const inShortlist = hits.slice(0, CANDIDATES).filter((h) => relevant.has(h.activity.id)).length;
    console.log(`${query}: first labeled at ${rank ?? "missing"}, ${inShortlist}/${relevant.size} in the Jev shortlist`);
    continue;
  }
  const judged = await judge(query);
  const grade = rankGradeFor(query, judged.classification, standoutGraded)?.value;
  const ranks = {};
  for (const floor of FLOORS) {
    ranks[floor] = firstRelevantRank(rerankUnlockedHits(judged.hits, judged.scores, judged.companions, grade, floor), relevant);
  }
  const baseline = firstRelevantRank(grade ? rerankUnlockedHits(judged.hits, {}, undefined, grade) : judged.hits, relevant);
  results.push({ query, baseline, ranks });
  const picks = Object.entries(judged.facets)
    .map(([key, value]) => (typeof value === "number" ? `${key}=${value.toFixed(2)}` : `${key}=${value.choice}@${value.confidence.toFixed(2)}`))
    .join(" ");
  console.log(`${query}: code order ${baseline ?? "-"}, Jev ${ranks[MEMBERSHIP_DEMOTE_BELOW] ?? "-"}${picks ? `  [${picks}]` : ""}`);
}

if (!dryRun && results.length > 0) {
  const summarize = (rankOf) => {
    const ranks = results.map(rankOf);
    const within = (k) => ranks.filter((r) => r !== null && r <= k).length / ranks.length;
    const mrr = ranks.reduce((sum, r) => sum + (r ? 1 / r : 0), 0) / ranks.length;
    return { top1: within(1), top5: within(5), top10: within(10), mrr };
  };
  const pct = (x) => `${Math.round(x * 100)}%`.padStart(5);
  const row = (label, m) => console.log(`${label.padEnd(12)} ${pct(m.top1)} ${pct(m.top5)} ${pct(m.top10)}  ${m.mrr.toFixed(3)}`);
  console.log(`\n${results.length} labeled queries\n${"".padEnd(12)}  top1  top5 top10  MRR`);
  row("code order", summarize((r) => r.baseline));
  let best = null;
  for (const floor of FLOORS) {
    const metrics = summarize((r) => r.ranks[floor]);
    row(`floor ${floor.toFixed(1)}${floor === MEMBERSHIP_DEMOTE_BELOW ? "*" : ""}`, metrics);
    if (!best || metrics.mrr > best.metrics.mrr) best = { floor, metrics };
  }
  console.log(`\n* current MEMBERSHIP_DEMOTE_BELOW. Best MRR here: floor ${best.floor.toFixed(1)}.`);
  if (results.length < 30) console.log("Fewer than 30 queries: treat the winner as a hint, not a setting.");
}
