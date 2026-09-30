// POST /api/jev-rerank  { query: string, ids: number[], settled?, removed? }
//   → { scores: { [id]: p }, facets: IntentFacets, companions }
// One packed Jev call. State is the query, the closed stimulus vocab, and the
// shortlist. Intent facets and per-activity membership noul run in parallel.
// Code applies a facet only when it fills a gap. Membership re-ranks unlocked
// branches on the client. Locked metric and date order stay in code.

import {
  buildJevRequest,
  classifyIntent,
  jevCacheScope,
  needsIntentFacets,
  parseRemovedParts,
  splitJevAnswers,
  type Activity,
  type IntentFacets,
  type JevCompanions,
} from "../lib/activitySearch.ts";
import { getJevProvider } from "../lib/jevProvider.ts";
import { loadActivities } from "./activity-source.ts";

declare const process: { env: Record<string, string | undefined> };

const MAX_CANDIDATES = 25;
const MAX_QUERY_LENGTH = 120;
// The abort covers the Jev request only. A cold start happens before this runs,
// and the function's 15s maxDuration leaves room for it.
const TIMEOUT_MS = 4_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

export const maxDuration = 15;

// Same list the page searched, so a shortlist that includes a new activity can be scored.
let indexed: { list: Activity[]; byId: Map<number, Activity> } | null = null;

async function activityById() {
  const { activities } = await loadActivities();
  if (indexed?.list !== activities) indexed = { list: activities, byId: new Map(activities.map((a) => [a.id, a])) };
  return indexed.byId;
}

type CachedJudgment = { membership: number; stimulus?: number; place?: number };

// Per-instance state: good enough to blunt abuse and repeat typing, not a global limit.
const cache = new Map<string, CachedJudgment>();
const CACHE_MAX = 5_000;
const hits = new Map<string, { count: number; start: number }>();

// Membership criteria follow the interpreted query, and facts carry days_ago.
// The same raw query under a new interpretation or a new day is a different question.
function cacheKey(model: string, day: string, interpreted: string, query: string, id: number) {
  return `${model}\u0000${day}\u0000${interpreted}\u0000${query}\u0000${id}`;
}

function remember(key: string, value: CachedJudgment) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}

function rateLimited(ip: string) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    hits.set(ip, { count: 1, start: now });
    return false;
  }
  entry.count++;
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

type JevResponse = {
  model?: string;
  answers?: Record<string, { noul?: number }>;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
};

const facetCache = new Map<string, IntentFacets>();
const FACET_CACHE_MAX = 500;

function rememberFacets(key: string, value: IntentFacets) {
  if (facetCache.size >= FACET_CACHE_MAX) facetCache.delete(facetCache.keys().next().value as string);
  facetCache.set(key, value);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  const provider = getJevProvider(process.env);
  if (!provider) return json({ error: "Jev is not configured" }, 503);
  if (rateLimited(clientIp(request))) return json({ error: "Too many requests" }, 429);

  const body = (await request.json().catch(() => null)) as
    | { query?: unknown; ids?: unknown; settled?: unknown; removed?: unknown }
    | null;
  const query = typeof body?.query === "string" ? body.query.trim().toLowerCase() : "";
  const ids = Array.isArray(body?.ids) ? body.ids : [];
  if (
    !query ||
    query.length > MAX_QUERY_LENGTH ||
    ids.length > MAX_CANDIDATES ||
    !ids.every((id) => Number.isInteger(id))
  ) {
    return json({ error: "Invalid request" }, 400);
  }

  // Parts removed from the "Read as" row are left out of the membership question too.
  const removed = parseRemovedParts(body?.removed);
  const { day, interpreted } = jevCacheScope(query, body?.settled, undefined, removed);
  const needFacets = needsIntentFacets(classifyIntent(query));
  const scores: Record<number, number> = {};
  const companions: JevCompanions = {};
  const pending: Activity[] = [];
  const byId = await activityById();
  for (const id of ids as number[]) {
    const activity = byId.get(id);
    if (!activity) continue;
    const cached = cache.get(cacheKey(provider.model, day, interpreted, query, id));
    if (cached !== undefined) {
      scores[id] = cached.membership;
      if (cached.stimulus !== undefined || cached.place !== undefined) {
        companions[id] = {};
        if (cached.stimulus !== undefined) companions[id].stimulus = cached.stimulus;
        if (cached.place !== undefined) companions[id].place = cached.place;
      }
    } else pending.push(activity);
  }

  // Facet questions name calendar years, so the day is part of their key too.
  const facetKey = `${provider.model}\u0000${day}\u0000${query}\u0000facets`;
  const cachedFacets = facetCache.get(facetKey);
  const askFacets = needFacets && !cachedFacets;
  if (pending.length === 0 && !askFacets) return json({ scores, facets: cachedFacets ?? {}, companions });

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const packed = buildJevRequest(query, pending, undefined, body?.settled, { includeFacets: askFacets, removed });
    const res = await fetch(provider.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.key}`,
        "Content-Type": "application/json",
        ...provider.headers,
      },
      body: JSON.stringify({
        model: provider.model,
        state: packed.state,
        questions: packed.questions,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      console.error(JSON.stringify({ msg: "jev.http_error", status: res.status, detail }));
      return json({ error: "Jev unavailable" }, 502);
    }
    const data = (await res.json()) as JevResponse;
    if (data.model && data.model !== provider.model) {
      console.warn(JSON.stringify({ msg: "jev.model_drift", expected: provider.model, got: data.model }));
    }
    const split = splitJevAnswers(data.answers ?? {});
    for (const [id, score] of Object.entries(split.scores)) {
      const numeric = Number(id);
      const companion = split.companions[numeric];
      scores[numeric] = score;
      if (companion) companions[numeric] = companion;
      remember(cacheKey(provider.model, day, interpreted, query, numeric), {
        membership: score,
        stimulus: companion?.stimulus,
        place: companion?.place,
      });
    }
    if (askFacets) rememberFacets(facetKey, split.facets);
    console.log(JSON.stringify({
      msg: "jev.decision",
      model: data.model ?? provider.model,
      input_tokens: data.usage?.input_tokens ?? null,
      latency_ms: Date.now() - started,
      query,
      scores,
      facets: split.facets,
      facets_asked: askFacets,
      questions: Object.keys(packed.questions).length,
    }));
  } catch (err) {
    const aborted = controller.signal.aborted;
    console.error(JSON.stringify({
      msg: "jev.unavailable",
      aborted,
      latency_ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    }));
    return json({ error: "Jev unavailable" }, aborted ? 504 : 502);
  } finally {
    clearTimeout(timer);
  }
  return json({ scores, facets: facetCache.get(facetKey) ?? {}, companions });
}
