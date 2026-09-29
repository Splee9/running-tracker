export type Activity = {
  id: number;
  name: string;
  sport_type: string;
  start_date_local: string;
  distance_m: number;
  moving_time_s: number;
  elevation_gain_m: number;
  workout_type: number | null;
  trainer: boolean;
};

export type MatchKind = "keyword" | "fuzzy";

export type SearchHit = {
  activity: Activity;
  score: number;
  kind: MatchKind;
  matched: string[];
};

type IndexedActivity = {
  activity: Activity;
  words: string[];
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Strava workout_type codes: runs 1/2/3, rides 11/12.
const WORKOUT_TAGS: Record<number, string[]> = {
  1: ["race"],
  2: ["long", "long run"],
  3: ["workout", "session"],
  11: ["race"],
  12: ["workout", "session"],
};

export function sportLabel(sport: string): string {
  return sport.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function isRun(a: Activity) {
  return /Run$/.test(a.sport_type);
}

export function isRide(a: Activity) {
  return /Ride$/.test(a.sport_type);
}

function distanceTags(a: Activity): string[] {
  const km = a.distance_m / 1000;
  const tags: string[] = [];
  if (isRun(a)) {
    const near = (target: number, tol: number) => Math.abs(km - target) <= tol;
    if (near(5, 0.3)) tags.push("5k");
    if (near(10, 0.4)) tags.push("10k");
    if (near(21.1, 0.6)) tags.push("half", "half marathon");
    if (near(42.2, 1)) tags.push("marathon");
    if (km >= 25) tags.push("long");
    if (km > 0 && km < 6) tags.push("short");
  }
  if (isRide(a)) {
    if (km >= 100) tags.push("century", "long");
    if (km > 0 && km < 25) tags.push("short");
  }
  return tags;
}

function derivedTags(a: Activity): string[] {
  const d = new Date(a.start_date_local.replace(/Z$/, ""));
  const hour = d.getHours();
  const tags = [
    sportLabel(a.sport_type),
    isRun(a) ? "run running" : "",
    isRide(a) ? "ride riding bike cycling" : "",
    MONTHS[d.getMonth()],
    WEEKDAYS[d.getDay()],
    String(d.getFullYear()),
    hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening",
    ...(WORKOUT_TAGS[a.workout_type ?? -1] ?? []),
    ...distanceTags(a),
  ];
  if (a.trainer || a.sport_type.startsWith("Virtual")) tags.push("indoor", "trainer", "virtual");
  const km = a.distance_m / 1000;
  if (km > 0) {
    const mPerKm = a.elevation_gain_m / km;
    if (mPerKm >= 15) tags.push("hilly", "hills", "climbing");
    else if (mPerKm < 4) tags.push("flat");
  }
  return tags;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function buildIndex(activities: Activity[]): IndexedActivity[] {
  return activities.map((activity) => ({
    activity,
    words: Array.from(new Set(tokenize([activity.name, ...derivedTags(activity)].join(" ")))),
  }));
}

// Optimal string alignment distance with an early exit once `max` is exceeded.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

function scoreToken(token: string, words: string[]): { score: number; fuzzy: boolean } {
  let best = 0;
  let fuzzy = false;
  // Years and distances ("2025", "10k") must not fuzz into their neighbours.
  const maxEdits = /\d/.test(token) ? 0 : token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0;
  for (const w of words) {
    if (w === token) return { score: 1, fuzzy: false };
    if (w.startsWith(token) && token.length >= 2) {
      if (0.85 > best) [best, fuzzy] = [0.85, false];
      continue;
    }
    if (maxEdits === 0 || best >= 0.85) continue;
    const prefix = w.slice(0, token.length + maxEdits);
    const d = Math.min(editDistance(token, w, maxEdits), editDistance(token, prefix, maxEdits));
    if (d <= maxEdits) {
      const s = 0.7 - 0.15 * (d - 1);
      if (s > best) [best, fuzzy] = [s, true];
    }
  }
  return { score: best, fuzzy };
}

export function searchActivities(
  index: IndexedActivity[],
  query: string,
  limit = 200,
): SearchHit[] {
  const tokens = Array.from(new Set(tokenize(query)));
  if (tokens.length === 0) return [];

  const full: SearchHit[] = [];
  const partial: SearchHit[] = [];
  for (const { activity, words } of index) {
    let total = 0;
    let hitCount = 0;
    let anyFuzzy = false;
    const matched: string[] = [];
    for (const t of tokens) {
      const { score, fuzzy } = scoreToken(t, words);
      if (score > 0) {
        hitCount++;
        total += score;
        matched.push(t);
        anyFuzzy ||= fuzzy;
      }
    }
    if (hitCount === 0) continue;
    const hit: SearchHit = {
      activity,
      score: total / tokens.length,
      kind: anyFuzzy ? "fuzzy" : "keyword",
      matched,
    };
    if (hitCount === tokens.length) full.push(hit);
    else if (hitCount * 2 >= tokens.length) partial.push(hit);
  }

  const byScore = (a: SearchHit, b: SearchHit) =>
    b.score - a.score || b.activity.start_date_local.localeCompare(a.activity.start_date_local);
  full.sort(byScore);
  partial.sort(byScore);
  return (full.length >= 10 ? full : [...full, ...partial]).slice(0, limit);
}

export function describeActivity(a: Activity): string {
  const km = a.distance_m / 1000;
  const parts = [
    `"${a.name}"`,
    sportLabel(a.sport_type),
    a.start_date_local.slice(0, 10),
    km > 0 ? `${km.toFixed(1)} km` : "",
    formatDuration(a.moving_time_s),
    a.elevation_gain_m > 0 ? `${a.elevation_gain_m} m climbing` : "",
    ...(WORKOUT_TAGS[a.workout_type ?? -1]?.slice(0, 1) ?? []),
    a.trainer ? "indoor" : "",
  ];
  return parts.filter(Boolean).join(", ");
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
