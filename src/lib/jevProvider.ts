// Where Jev requests go. Shared by the Netlify function and the offline grading script.
// Server-side only: keys come from the environment and never reach the browser bundle.

export type JevProvider = { url: string; model: string; key: string; headers: Record<string, string> };

const OPENROUTER_MODEL = "typesafe/jev-1.13-20260917";
const TYPESAFE_MODEL = "jev-1.13.0";

// OpenRouter's Decisions API and TypeSafe's /v1/systemone share the same request
// and response shape; only the URL, model id and key differ. Both ids are pinned:
// a confidence floor is calibrated to one model's distribution.
export function getJevProvider(env: Record<string, string | undefined>): JevProvider | null {
  const openrouter = env.OPENROUTER_API_KEY;
  if (openrouter) {
    return {
      url: env.JEV_API_URL ?? "https://openrouter.ai/api/alpha/decisions",
      model: env.JEV_MODEL ?? OPENROUTER_MODEL,
      key: openrouter,
      headers: { "HTTP-Referer": "https://iamspencerlee.com", "X-Title": "Activity Lookup" },
    };
  }
  const typesafe = env.TYPESAFE_API_KEY;
  if (typesafe) {
    return {
      url: env.JEV_API_URL ?? "https://api.typesafe.ai/v1/systemone",
      model: env.JEV_MODEL ?? TYPESAFE_MODEL,
      key: typesafe,
      headers: {},
    };
  }
  return null;
}
