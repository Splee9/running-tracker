// POST /.netlify/functions/jev-rerank  { query: string, ids: number[] } → { scores: { [id]: p } }
// Reranks an Activity Lookup shortlist with Jev: one noul per (query, activity) pair,
// whose calibrated probability is comparable across candidates and used as the sort key.

import snapshot from "../../src/activities.json" with { type: "json" };
import { describeActivity, type Activity } from "../../src/lib/activitySearch.ts";

const MAX_CANDIDATES = 25;
const MAX_QUERY_LENGTH = 120;
const CONCURRENCY = 8;
const TIMEOUT_MS = 4_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

type Provider = { url: string; model: string; key: string; headers: Record<string, string> };

// OpenRouter's Decisions API and TypeSafe's /v1/systemone share the same request
// and response shape; only the URL, model id and key differ.
function getProvider(): Provider | null {
  const env = (name: string) => process.env[name];
  const openrouter = env("OPENROUTER_API_KEY");
  if (openrouter) {
    return {
      url: env("JEV_API_URL") ?? "https://openrouter.ai/api/alpha/decisions",
      model: env("JEV_MODEL") ?? "typesafe/jev-1.13",
      key: openrouter,
      headers: { "HTTP-Referer": "https://iamspencerlee.com", "X-Title": "Activity Lookup" },
    };
  }
  const typesafe = env("TYPESAFE_API_KEY");
  if (typesafe) {
    return {
      url: env("JEV_API_URL") ?? "https://api.typesafe.ai/v1/systemone",
      model: env("JEV_MODEL") ?? "jev-latest",
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

async function scorePair(
  provider: Provider,
  query: string,
  activity: Activity,
  signal: AbortSignal,
): Promise<number> {
  const res = await fetch(provider.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.key}`,
      "Content-Type": "application/json",
      ...provider.headers,
    },
    body: JSON.stringify({
      model: provider.model,
      state: { search_query: query, activity: describeActivity(activity) },
      questions: {
        matches: {
          type: "noul",
          instructions:
            "An athlete is searching their own training log. Is this activity one they are looking for with this search query?",
          criteria: {
            true: "The activity fits what the query describes: its name, sport, date, distance, effort, terrain or occasion match the intent, allowing for typos and loose wording.",
            false: "The activity only shares an incidental word with the query, or its sport, date, distance or type contradicts what the query asks for.",
          },
        },
      },
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { answers: Record<string, { noul: number }> };
  return data.answers.matches.noul;
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
    ids.length === 0 ||
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
    const cached = cache.get(`${query}\u0000${id}`);
    if (cached !== undefined) scores[id] = cached;
    else pending.push(activity);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let next = 0;
    const worker = async () => {
      while (next < pending.length) {
        const a = pending[next++];
        try {
          const p = await scorePair(provider, query, a, controller.signal);
          scores[a.id] = p;
          remember(`${query}\u0000${a.id}`, p);
        } catch (err) {
          if (controller.signal.aborted) return;
          console.error("[jev-rerank] scoring failed", a.id, err);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  } finally {
    clearTimeout(timer);
  }
  return json({ scores });
};
