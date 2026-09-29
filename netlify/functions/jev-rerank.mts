// POST /.netlify/functions/jev-rerank  { query: string, ids: number[] }
//   → { scores: { [id]: p }, facets: { [question]: p } }
// One packed Jev call. State is the query, the closed stimulus vocab, and the
// shortlist. Intent facets and per-activity membership noul run in parallel.
// Code applies a facet only when it fills a gap. Membership does not reorder
// locked branches.

import snapshot from "../../src/activities.json" with { type: "json" };
import { buildJevRequest, splitJevAnswers, type Activity } from "../../src/lib/activitySearch.ts";

const MAX_CANDIDATES = 25;
const MAX_QUERY_LENGTH = 120;
const TIMEOUT_MS = 1_500;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const OPENROUTER_MODEL = "typesafe/jev-1.13-20260917";
const TYPESAFE_MODEL = "jev-1.13.0";

type Provider = { url: string; model: string; key: string; headers: Record<string, string> };

// OpenRouter's Decisions API and TypeSafe's /v1/systemone share the same request
// and response shape; only the URL, model id and key differ. Both ids are pinned:
// a confidence floor is calibrated to one model's distribution.
function getProvider(): Provider | null {
  const env = (name: string) => process.env[name];
  const openrouter = env("OPENROUTER_API_KEY");
  if (openrouter) {
    return {
      url: env("JEV_API_URL") ?? "https://openrouter.ai/api/alpha/decisions",
      model: env("JEV_MODEL") ?? OPENROUTER_MODEL,
      key: openrouter,
      headers: { "HTTP-Referer": "https://iamspencerlee.com", "X-Title": "Activity Lookup" },
    };
  }
  const typesafe = env("TYPESAFE_API_KEY");
  if (typesafe) {
    return {
      url: env("JEV_API_URL") ?? "https://api.typesafe.ai/v1/systemone",
      model: env("JEV_MODEL") ?? TYPESAFE_MODEL,
      key: typesafe,
      headers: {},
    };
  }
  return null;
}

const byId = new Map((snapshot.activities as Activity[]).map((a) => [a.id, a]));

// Per-instance state: good enough to blunt abuse and repeat typing, not a global limit.
const cache = new Map<string, number>();
const CACHE_MAX = 5_000;
const hits = new Map<string, { count: number; start: number }>();

function cacheKey(model: string, query: string, id: number) {
  return `${model}\u0000${query}\u0000${id}`;
}

function remember(key: string, value: number) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
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

const facetCache = new Map<string, Record<string, number>>();
const FACET_CACHE_MAX = 500;

function rememberFacets(key: string, value: Record<string, number>) {
  if (facetCache.size >= FACET_CACHE_MAX) facetCache.delete(facetCache.keys().next().value as string);
  facetCache.set(key, value);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req: Request, context: { ip?: string }) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const provider = getProvider();
  if (!provider) return json({ error: "Jev is not configured" }, 503);
  if (rateLimited(context.ip ?? "unknown")) return json({ error: "Too many requests" }, 429);

  const body = (await req.json().catch(() => null)) as { query?: unknown; ids?: unknown } | null;
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

  const scores: Record<number, number> = {};
  const pending: Activity[] = [];
  for (const id of ids as number[]) {
    const activity = byId.get(id);
    if (!activity) continue;
    const cached = cache.get(cacheKey(provider.model, query, id));
    if (cached !== undefined) scores[id] = cached;
    else pending.push(activity);
  }

  const facetKey = `${provider.model}\u0000${query}\u0000facets`;
  const cachedFacets = facetCache.get(facetKey);
  if (pending.length === 0 && cachedFacets) return json({ scores, facets: cachedFacets });

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const packed = buildJevRequest(query, pending);
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
      scores[numeric] = score;
      remember(cacheKey(provider.model, query, numeric), score);
    }
    rememberFacets(facetKey, split.facets);
    console.log(JSON.stringify({
      msg: "jev.decision",
      model: data.model ?? provider.model,
      input_tokens: data.usage?.input_tokens ?? null,
      latency_ms: Date.now() - started,
      query,
      scores,
      facets: split.facets,
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
  return json({ scores, facets: facetCache.get(facetKey) ?? {} });
};
