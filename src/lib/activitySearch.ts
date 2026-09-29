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
  // v2 enrichment (optional, backward compatible)
  primary_stimulus?: string;
  modifiers?: string[];
  place?: string;
  place_source?: "name" | "gps";
  lap_count?: number;
  hard_lap_count?: number;
  has_intervals?: boolean;
  interval_score?: number;
  // Optional vault labels. Search still works when a field is missing.
  stimulus_cluster?: string;
  modality?: string;
  /** Caveat only. Rank the activity down; do not drop it for this flag alone. */
  low_confidence?: boolean;
  // v3 enrichment (optional, backward compatible)
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed?: number; // m/s
  max_speed?: number; // m/s
  average_watts?: number;
  weighted_average_watts?: number;
  // MMP fields (optional, public-activities-v4 schema)
  best_watts_5s?: number;
  best_watts_1m?: number;
  best_watts_5m?: number;
  best_watts_20m?: number;
  best_watts_60m?: number;
  // Public Strava description. Used only when ranking (Jev); never shown on cards.
  description?: string;
};

export type MatchKind = "keyword" | "fuzzy";

export type ShortlistBranchId =
  | "metric"
  | "date-list"
  | "place-list"
  | "place-longest"
  | "keyword";

export type SearchHit = {
  activity: Activity;
  score: number;
  kind: MatchKind;
  matched: string[];
  /** Which fan-out branch first claimed this activity. */
  branch?: ShortlistBranchId;
  /**
   * Metric, place-longest, and a code-settled list stay in code order.
   * Keyword hits, and a list that exists only because a soft synonym was filled,
   * are unlocked: membership noul is their order.
   */
  locked?: boolean;
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

// Same windows as the distance tags below, so a band filter and a "10k" tag agree.
const RACE_SPECS = [
  { kind: "5k", label: "5k", targetKm: 5, tolKm: 0.3, tags: ["5k"] },
  { kind: "10k", label: "10k", targetKm: 10, tolKm: 0.4, tags: ["10k"] },
  { kind: "half", label: "half marathon", targetKm: 21.1, tolKm: 0.6, tags: ["half", "half marathon"] },
  { kind: "marathon", label: "marathon", targetKm: 42.2, tolKm: 1, tags: ["marathon"] },
] as const;

export type DistanceBand = {
  kind: "5k" | "10k" | "half" | "marathon" | "numeric";
  label: string;
  targetKm: number;
  tolKm: number;
  /** Named race distances are runs unless the query explicitly asks for a ride. */
  runsOnly: boolean;
};

const MI_IN_KM = 1.609344;
const MAX_RANKING_DESCRIPTION = 500;

function withinKm(distanceM: number, targetKm: number, tolKm: number): boolean {
  return distanceM > 0 && Math.abs(distanceM / 1000 - targetKm) <= tolKm;
}

function raceBand(kind: (typeof RACE_SPECS)[number]["kind"]): DistanceBand {
  const spec = RACE_SPECS.find((s) => s.kind === kind)!;
  return {
    kind: spec.kind,
    label: spec.label,
    targetKm: spec.targetKm,
    tolKm: spec.tolKm,
    runsOnly: true,
  };
}

// "6.2 mi" / "10 km" collapse onto the race window when they land on one.
function snapRace(targetKm: number): DistanceBand | null {
  let best: (typeof RACE_SPECS)[number] | null = null;
  let bestDelta = 0.25;
  for (const spec of RACE_SPECS) {
    const delta = Math.abs(targetKm - spec.targetKm);
    if (delta <= bestDelta) {
      best = spec;
      bestDelta = delta;
    }
  }
  return best ? raceBand(best.kind) : null;
}

function numericBand(value: number, unitRaw: string): DistanceBand {
  const miles = unitRaw === "mi" || unitRaw.startsWith("mile");
  // "50k" is race shorthand for a run. "50 km" / "30 mi" stay open to the named sport.
  const raceStyleK = unitRaw === "k";
  const targetKm = miles ? value * MI_IN_KM : value;
  const snapped = snapRace(targetKm);
  if (snapped) return snapped;
  const tolKm = Math.max(0.3, targetKm * 0.03);
  return {
    kind: "numeric",
    label: `${value} ${miles ? "mi" : "km"}`,
    targetKm,
    tolKm,
    runsOnly: raceStyleK,
  };
}

function inDistanceBand(distanceM: number, band: DistanceBand): boolean {
  return withinKm(distanceM, band.targetKm, band.tolKm);
}

// Token spans share indexes with tokenize(), including decimals split on ".".
function tokenSpans(query: string): { start: number; end: number }[] {
  const norm = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const spans: { start: number; end: number }[] = [];
  const re = /[a-z0-9]+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(norm))) {
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

function parseDistanceBand(query: string): { band: DistanceBand | null; consumedIndices: Set<number> } {
  const norm = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const spans = tokenSpans(query);
  const patterns: { re: RegExp; build: (m: RegExpExecArray) => DistanceBand }[] = [
    { re: /\bhalf(?:[-\s]*marathons?)?\b/, build: () => raceBand("half") },
    { re: /\bmarathons?\b/, build: () => raceBand("marathon") },
    { re: /\b5\s*ks?\b/, build: () => raceBand("5k") },
    { re: /\b10\s*ks?\b/, build: () => raceBand("10k") },
    {
      re: /\b(\d+(?:\.\d+)?)\s*(km|kilometers?|mi|miles?|ks?)\b/,
      build: (m) => numericBand(Number(m[1]), m[2].replace(/s$/, "")),
    },
  ];

  let best: { start: number; end: number; band: DistanceBand } | null = null;
  for (const pattern of patterns) {
    const match = pattern.re.exec(norm);
    if (!match) continue;
    if (!best || match.index < best.start) {
      best = { start: match.index, end: match.index + match[0].length, band: pattern.build(match) };
    }
  }
  const consumedIndices = new Set<number>();
  if (!best) return { band: null, consumedIndices };
  spans.forEach((span, index) => {
    if (span.end > best!.start && span.start < best!.end) consumedIndices.add(index);
  });
  return { band: best.band, consumedIndices };
}

function distanceTags(a: Activity): string[] {
  const km = a.distance_m / 1000;
  const tags: string[] = [];
  if (isRun(a)) {
    for (const spec of RACE_SPECS) {
      if (Math.abs(km - spec.targetKm) <= spec.tolKm) tags.push(...spec.tags);
    }
    if (km >= 25) tags.push("long");
    if (km > 0 && km < 6) tags.push("short");
  }
  if (isRide(a)) {
    if (km >= 100) tags.push("century", "long");
    if (km > 0 && km < 25) tags.push("short");
  }
  return tags;
}

function localStart(a: Activity): Date {
  return new Date(a.start_date_local.replace(/Z$/, ""));
}

function derivedTags(a: Activity): string[] {
  const d = localStart(a);
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
  // v2 enrichment tags
  if (a.primary_stimulus) tags.push(a.primary_stimulus);
  if (a.modifiers) tags.push(...a.modifiers);
  if (a.stimulus_cluster) tags.push(...tokenize(a.stimulus_cluster));
  if (a.place) tags.push(...tokenize(a.place));
  if (a.has_intervals) tags.push("intervals", "reps", "repeats");
  // v3 enrichment tags: HR zones, power zones
  if (a.average_heartrate) {
    tags.push("hr", "heartrate", "heart rate");
    if (a.average_heartrate >= 170) tags.push("high hr", "hard effort");
    else if (a.average_heartrate >= 150) tags.push("moderate hr");
  }
  if (a.average_watts || a.weighted_average_watts) {
    tags.push("power", "watts");
    const watts = a.weighted_average_watts ?? a.average_watts ?? 0;
    if (watts >= 250) tags.push("high power");
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

// Parse date window from tokens, returning window and indices to consume
// Uses America/Chicago timezone (Spencer's local timezone) for "today" and relative date calculations.
// Accepts optional `now` parameter for testing with a fixed clock.
function parseDateWindow(tokens: string[], now?: Date): { window: DateWindow | null; consumedIndices: Set<number> } {
  const consumedIndices = new Set<number>();
  
  // Helper to format date as YYYY-MM-DD
  const formatDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Use injected clock for tests, or live local time (America/Chicago).
  // When undefined, defaults to current date at noon Chicago time.
  const today = now ?? new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const currentYear = today.getFullYear();
  
  // Check for "today"
  const todayIdx = tokens.indexOf("today");
  if (todayIdx >= 0) {
    consumedIndices.add(todayIdx);
    return {
      window: { start: formatDate(today), end: formatDate(today) },
      consumedIndices
    };
  }
  
  // Check for "yesterday"
  const yesterdayIdx = tokens.indexOf("yesterday");
  if (yesterdayIdx >= 0) {
    consumedIndices.add(yesterdayIdx);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      window: { start: formatDate(yesterday), end: formatDate(yesterday) },
      consumedIndices
    };
  }
  
  // Check for "this week"
  const thisIdx = tokens.indexOf("this");
  const weekIdx = tokens.indexOf("week");
  if (thisIdx >= 0 && weekIdx === thisIdx + 1) {
    consumedIndices.add(thisIdx);
    consumedIndices.add(weekIdx);
    // "This week" = Monday to today of the current America/Chicago week
    const dayOfWeek = today.getDay();
    const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
    const daysToMonday = isoDayOfWeek - 1;
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - daysToMonday);
    return {
      window: { start: formatDate(weekStart), end: formatDate(today) },
      consumedIndices
    };
  }
  
  // Check for "last week" or "previous week"
  const lastIdx = tokens.indexOf("last");
  const previousIdx = tokens.indexOf("previous");
  const weekIdx2 = tokens.indexOf("week");
  
  const pastIdx = tokens.indexOf("past");
  if (
    (lastIdx >= 0 && weekIdx2 === lastIdx + 1) ||
    (previousIdx >= 0 && weekIdx2 === previousIdx + 1) ||
    (pastIdx >= 0 && weekIdx2 === pastIdx + 1)
  ) {
    if (lastIdx >= 0 && weekIdx2 === lastIdx + 1) {
      consumedIndices.add(lastIdx);
      consumedIndices.add(weekIdx2);
    }
    if (previousIdx >= 0 && weekIdx2 === previousIdx + 1) {
      consumedIndices.add(previousIdx);
      consumedIndices.add(weekIdx2);
    }
    if (pastIdx >= 0 && weekIdx2 === pastIdx + 1) {
      consumedIndices.add(pastIdx);
      consumedIndices.add(weekIdx2);
    }
    // Previous complete Monday–Sunday. On Tue 2026-09-29 that is Sep 21–27,
    // not the week before that.
    const dayOfWeek = today.getDay();
    const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - (isoDayOfWeek - 1));
    const lastWeekStart = new Date(thisMonday);
    lastWeekStart.setDate(thisMonday.getDate() - 7);
    const lastWeekEnd = new Date(thisMonday);
    lastWeekEnd.setDate(thisMonday.getDate() - 1);
    return {
      window: { start: formatDate(lastWeekStart), end: formatDate(lastWeekEnd) },
      consumedIndices
    };
  }
  
  // Check for "last N days"
  const daysIdx = tokens.indexOf("days");
  const dayIdx = tokens.indexOf("day");
  const finalDayIdx = daysIdx >= 0 ? daysIdx : dayIdx;
  
  if (lastIdx >= 0 && finalDayIdx >= 0) {
    // Find number between "last" and "day(s)"
    for (let i = lastIdx + 1; i < finalDayIdx; i++) {
      const num = parseInt(tokens[i], 10);
      if (!isNaN(num) && num > 0 && num <= 365) {
        consumedIndices.add(lastIdx);
        consumedIndices.add(i);
        consumedIndices.add(finalDayIdx);
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - num);
        return {
          window: { start: formatDate(startDate), end: formatDate(today) },
          consumedIndices
        };
      }
    }
  }
  
  // Check for "this year" or "ytd"
  const yearIdx = tokens.indexOf("year");
  const ytdIdx = tokens.indexOf("ytd");
  
  if ((thisIdx >= 0 && yearIdx === thisIdx + 1) || ytdIdx >= 0) {
    if (thisIdx >= 0 && yearIdx === thisIdx + 1) {
      consumedIndices.add(thisIdx);
      consumedIndices.add(yearIdx);
    }
    if (ytdIdx >= 0) {
      consumedIndices.add(ytdIdx);
    }
    return {
      window: { start: `${currentYear}-01-01`, end: formatDate(today) },
      consumedIndices
    };
  }
  
  // Check for "last year"
  if (lastIdx >= 0 && yearIdx === lastIdx + 1) {
    consumedIndices.add(lastIdx);
    consumedIndices.add(yearIdx);
    const lastYear = currentYear - 1;
    return {
      window: { start: `${lastYear}-01-01`, end: `${lastYear}-12-31` },
      consumedIndices
    };
  }
  
  // Check for "this month"
  const monthIdx = tokens.indexOf("month");
  if (thisIdx >= 0 && monthIdx === thisIdx + 1) {
    consumedIndices.add(thisIdx);
    consumedIndices.add(monthIdx);
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    return {
      window: { 
        start: `${year}-${String(month).padStart(2, '0')}-01`, 
        end: formatDate(today)
      },
      consumedIndices
    };
  }
  
  // "last month" / "past month" = the previous calendar month, not a rolling 30 days.
  const monthLead = ["last", "previous", "past"];
  const monthLeadIdx = tokens.findIndex((t, i) => monthLead.includes(t) && tokens[i + 1] === "month");
  if (monthLeadIdx >= 0) {
    consumedIndices.add(monthLeadIdx);
    consumedIndices.add(monthLeadIdx + 1);
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return {
      window: { start: formatDate(start), end: formatDate(end) },
      consumedIndices,
    };
  }

  // Check for "last N months" - must have "last", a number, and "month"/"months"
  let monthsIdx = tokens.indexOf("months");
  if (monthsIdx < 0) monthsIdx = tokens.indexOf("month");
  
  if (lastIdx >= 0 && monthsIdx >= 0) {
    // Find number between "last" and "month(s)"
    for (let i = lastIdx + 1; i < monthsIdx; i++) {
      const num = parseInt(tokens[i], 10);
      if (!isNaN(num) && num > 0 && num <= 24) {
        consumedIndices.add(lastIdx);
        consumedIndices.add(i);
        consumedIndices.add(monthsIdx);
        const startDate = new Date(today);
        startDate.setMonth(startDate.getMonth() - num);
        return {
          window: { start: formatDate(startDate), end: formatDate(today) },
          consumedIndices
        };
      }
    }
  }
  
  // Check for named month + year (e.g., "march 2024") - CHECK THIS BEFORE standalone year
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];
  for (let i = 0; i < tokens.length - 1; i++) {
    const monthNum = monthNames.indexOf(tokens[i]);
    if (monthNum >= 0) {
      const year = parseInt(tokens[i + 1], 10);
      if (tokens[i + 1].length === 4 && year >= 2000 && year <= currentYear + 1) {
        consumedIndices.add(i);
        consumedIndices.add(i + 1);
        const month = monthNum + 1;
        const lastDay = new Date(year, month, 0).getDate();
        return {
          window: { 
            start: `${year}-${String(month).padStart(2, '0')}-01`,
            end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
          },
          consumedIndices
        };
      }
    }
  }
  
  // Check for standalone year (e.g., "2024", "2025")
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const year = parseInt(token, 10);
    if (token.length === 4 && year >= 2000 && year <= currentYear + 1) {
      consumedIndices.add(i);
      // Also consume "in" if it precedes the year
      if (i > 0 && tokens[i - 1] === "in") {
        consumedIndices.add(i - 1);
      }
      return {
        window: { start: `${year}-01-01`, end: `${year}-12-31` },
        consumedIndices
      };
    }
  }
  
  return { window: null, consumedIndices };
}

export type DateWindow = {
  start: string; // ISO date string (YYYY-MM-DD)
  end: string;   // ISO date string (YYYY-MM-DD)
};

export type SuperlativeIntent = {
  kind: "longest" | "fastest" | "most_intervals" | "hilliest" | "highest_hr";
  sport?: "run" | "ride";
} | {
  kind: "place_filter";
  place: string;
  filterType?: "race" | "workout";
  sport?: "run" | "ride";
} | {
  kind: "mmp_power";
  field: "best_watts_5s" | "best_watts_1m" | "best_watts_5m" | "best_watts_20m" | "best_watts_60m";
} | {
  kind: "highest_power";
} | {
  kind: "list";
  sport?: "run" | "ride";
} | null;

export type IntentClassification = {
  intent: SuperlativeIntent;
  dateWindow: DateWindow | null;
  /** Set for fastest/longest when the query names a distance. Other intents leave it null. */
  distanceBand: DistanceBand | null;
  /** "in Chicago" / "near Chicago", or the place on a place filter. */
  place: string | null;
  /** "on a Tuesday" → "tuesday". Null when the query does not name a weekday. */
  weekday: string | null;
  /** Label hard filter. Null when the query does not name a stimulus. */
  stimulus: StimulusConstraint | null;
  remainingTokens: string[];
  isDeterministic: boolean;
};

const SPEED_WORDS = ["fastest", "quickest", "speedy", "fast", "quick", "swift", "rapid"];
const RUN_WORDS = new Set(["run", "runs", "running"]);
const RIDE_WORDS = new Set(["ride", "rides", "bike", "bikes", "cycling"]);
const LIST_SYNONYMS = new Set(["activities", "activity", "workouts", "workout", "session", "sessions"]);
const PLACE_PREPOSITIONS = new Set(["in", "at", "near", "around", "from"]);
// "city" stays: "windy city" is a Chicago alias, not a filler.
const PLACE_FILLERS = new Set(["the", "a", "an", "my", "our", "area", "region"]);
const QUERY_FILLERS = new Set(["the", "a", "an", "my", "our", "me", "show", "find", "please", "some"]);
// Words that stick to a date phrase: "in the last week", "from last month", "during last week".
const DATE_GLUE = new Set(["in", "during", "over", "from", "for", "within", "of"]);
const PLACE_STOP = new Set([
  ...RUN_WORDS,
  ...RIDE_WORDS,
  ...LIST_SYNONYMS,
  ...SPEED_WORDS,
  ...STIMULUS_PLACE_WORDS,
  "longest",
  "farthest",
  "race",
  "races",
]);
// Query aliases. Activity places are canonical city names ("Chicago"), so the
// shortlist has to fold these before filtering.
const PLACE_ALIASES: { canonical: string; phrases: string[][] }[] = [
  {
    canonical: "chicago",
    phrases: [
      ["windy", "city"],
      ["chi", "town"],
      ["chicago"],
      ["chitown"],
      ["chi"],
    ],
  },
];
// Unbanded "fastest run" should not be won by a stride or a short shakeout.
const MIN_UNBANDED_FASTEST_M = 3000;

import {
  isBlockedPlaceName,
  labelConfidence,
  matchesModality,
  matchesPrimary,
  matchesStimulus,
  parseStimulusTokens,
  HARD_MODIFIERS,
  PRIMARY_STIMULI,
  STIMULUS_PLACE_WORDS,
  STIMULUS_VOCAB,
  stimulusFromFacets,
  stimulusSummary,
  winningDistanceBand,
  winningYear,
  JEV_INTENT_CONFIDENCE,
  type PrimaryStimulus,
  type StimulusConstraint,
} from "./stimulus.ts";

function phraseAt(tokens: string[], index: number, phrase: string[]): boolean {
  return phrase.every((word, offset) => tokens[index + offset] === word);
}

function aliasAt(tokens: string[], index: number): { canonical: string; length: number } | null {
  let best: { canonical: string; length: number } | null = null;
  for (const entry of PLACE_ALIASES) {
    for (const phrase of entry.phrases) {
      if (index + phrase.length > tokens.length || !phraseAt(tokens, index, phrase)) continue;
      if (!best || phrase.length > best.length) best = { canonical: entry.canonical, length: phrase.length };
    }
  }
  return best;
}

function canonicalPlaceName(phrase: string): string {
  const tokens = tokenize(phrase).filter((token) => !PLACE_FILLERS.has(token));
  if (tokens.length === 0) return "";
  const hit = aliasAt(tokens, 0);
  if (hit && hit.length === tokens.length) return hit.canonical;
  return tokens.join(" ");
}

function isKnownPlaceTokens(tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const hit = aliasAt(tokens, 0);
  return hit != null && hit.length === tokens.length;
}

function textHasPlace(text: string, place: string): boolean {
  const canonical = canonicalPlaceName(place);
  if (!canonical) return false;
  const alias = PLACE_ALIASES.find((entry) => entry.canonical === canonical);
  const tokens = tokenize(text);
  if (alias) {
    for (let i = 0; i < tokens.length; i++) {
      if (alias.phrases.some((phrase) => phraseAt(tokens, i, phrase))) return true;
    }
    return false;
  }
  const words = canonical.split(" ").filter(Boolean);
  return words.length > 0 && words.every((word) => tokens.includes(word));
}

// "in the last week" — the preposition belongs to the date, not to a place.
function withDateGlue(tokens: string[], consumed: Set<number>): Set<number> {
  if (consumed.size === 0) return consumed;
  const extra = new Set(consumed);
  let i = Math.min(...consumed) - 1;
  if (i >= 0 && !extra.has(i) && tokens[i] === "the") {
    extra.add(i);
    i--;
  }
  if (i >= 0 && !extra.has(i) && DATE_GLUE.has(tokens[i])) extra.add(i);
  return extra;
}

function parsePlacePhrase(
  tokens: string[],
  consumed: Set<number>,
): { place: string | null; consumedIndices: Set<number> } {
  const consumedIndices = new Set<number>();
  const prepIdx = tokens.findIndex((token, i) => !consumed.has(i) && PLACE_PREPOSITIONS.has(token));
  if (prepIdx < 0) return { place: null, consumedIndices };
  const placeTokens: string[] = [];
  const indices = [prepIdx];
  for (let i = prepIdx + 1; i < tokens.length; i++) {
    if (consumed.has(i) || PLACE_STOP.has(tokens[i])) break;
    indices.push(i);
    if (!PLACE_FILLERS.has(tokens[i])) placeTokens.push(tokens[i]);
  }
  if (placeTokens.length === 0) return { place: null, consumedIndices };
  indices.forEach((i) => consumedIndices.add(i));
  return { place: placeTokens.join(" "), consumedIndices };
}

// "speedy Chicago runs" / "chitown runs" have no preposition. Only known aliases,
// so a leftover word like "hilly" does not become a place.
function parseBarePlace(
  tokens: string[],
  consumed: Set<number>,
): { place: string; consumedIndices: Set<number> } | null {
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const hit = aliasAt(tokens, i);
    if (!hit) continue;
    const indices: number[] = [];
    let blocked = false;
    for (let k = 0; k < hit.length; k++) {
      if (consumed.has(i + k)) blocked = true;
      indices.push(i + k);
    }
    if (blocked) continue;
    return { place: hit.canonical, consumedIndices: new Set(indices) };
  }
  return null;
}

function parseWeekday(
  tokens: string[],
  consumed: Set<number>,
): { weekday: string | null; consumedIndices: Set<number> } {
  const consumedIndices = new Set<number>();
  const weekdayIndex = new Map<string, string>();
  WEEKDAYS.forEach((name) => {
    weekdayIndex.set(name, name);
    weekdayIndex.set(`${name}s`, name);
  });
  const idx = tokens.findIndex((token, i) => !consumed.has(i) && weekdayIndex.has(token));
  if (idx < 0) return { weekday: null, consumedIndices };
  consumedIndices.add(idx);
  let cursor = idx - 1;
  while (cursor >= 0 && consumed.has(cursor)) cursor--;
  if (cursor >= 0 && ["a", "an", "the", "every"].includes(tokens[cursor])) {
    consumedIndices.add(cursor);
    cursor--;
    while (cursor >= 0 && consumed.has(cursor)) cursor--;
  }
  if (cursor >= 0 && tokens[cursor] === "on") consumedIndices.add(cursor);
  return { weekday: weekdayIndex.get(tokens[idx]) ?? null, consumedIndices };
}

function activityMatchesPlace(activity: Activity, place: string): boolean {
  return textHasPlace(`${activity.place ?? ""} ${activity.name}`, place);
}

function findSport(
  tokens: string[],
  consumed: Set<number>,
): { sport?: "run" | "ride"; indices: number[] } {
  const indices: number[] = [];
  let sport: "run" | "ride" | undefined;
  tokens.forEach((token, i) => {
    if (consumed.has(i)) return;
    if (RUN_WORDS.has(token)) {
      sport = "run";
      indices.push(i);
    } else if (RIDE_WORDS.has(token)) {
      if (sport !== "run") sport = "ride";
      indices.push(i);
    }
  });
  if (sport === "run") {
    return { sport, indices: indices.filter((i) => RUN_WORDS.has(tokens[i])) };
  }
  return { sport, indices };
}

function listSynonymIndices(tokens: string[], consumed: Set<number>): number[] {
  const indices: number[] = [];
  tokens.forEach((token, i) => {
    if (!consumed.has(i) && LIST_SYNONYMS.has(token)) indices.push(i);
  });
  return indices;
}

function detectSuperlativeIntent(query: string, now?: Date): IntentClassification {
  const tokens = tokenize(query);
  let intent: SuperlativeIntent = null;
  let consumedIndices = new Set<number>();

  // Parse date window first. Glue ("in the", "from", "during") is part of the date phrase.
  const { window: dateWindow, consumedIndices: dateIndices } = parseDateWindow(tokens, now);
  (dateWindow ? withDateGlue(tokens, dateIndices) : dateIndices).forEach(i => consumedIndices.add(i));

  // Detect MMP power queries: "top/best/highest/max" + duration + optional "power/watts"
  // Durations: 5s, 5 sec, 1 min, 5 min, 20 min, 20m, 60 min, 1 hour, ftp (→ 20m)
  const powerTriggers = ["top", "best", "highest", "max"];
  const powerTriggerIdx = tokens.findIndex(t => powerTriggers.includes(t));
  
  if (powerTriggerIdx >= 0) {
    // Hold these until we know it's actually a power query. "best run" is not watts.
    const powerConsumed = new Set<number>([powerTriggerIdx]);
    
    // Look for duration tokens
    let mmpField: "best_watts_5s" | "best_watts_1m" | "best_watts_5m" | "best_watts_20m" | "best_watts_60m" | null = null;
    
    // Check for "ftp" (maps to 20m)
    const ftpIdx = tokens.indexOf("ftp");
    if (ftpIdx >= 0) {
      mmpField = "best_watts_20m";
      powerConsumed.add(ftpIdx);
    }
    
    // Check for duration patterns like "5s", "1m", "20m", "5 sec", "1 min", "20 min", "1 hour"
    for (let i = 0; i < tokens.length; i++) {
      if (powerConsumed.has(i) || consumedIndices.has(i)) continue;
      
      const token = tokens[i];
      const nextToken = i + 1 < tokens.length ? tokens[i + 1] : "";
      
      // Pattern: number + unit (e.g., "5s", "1m", "20m")
      if (/^(\d+)(s|sec|seconds?|m|min|minutes?|h|hour|hours?)$/.test(token)) {
        const match = token.match(/^(\d+)(s|sec|seconds?|m|min|minutes?|h|hour|hours?)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          const unit = match[2];
          
          if ((unit === "s" || unit === "sec" || unit.startsWith("second")) && num === 5) {
            mmpField = "best_watts_5s";
            powerConsumed.add(i);
          } else if ((unit === "m" || unit === "min" || unit.startsWith("minute")) && num === 1) {
            mmpField = "best_watts_1m";
            powerConsumed.add(i);
          } else if ((unit === "m" || unit === "min" || unit.startsWith("minute")) && num === 5) {
            mmpField = "best_watts_5m";
            powerConsumed.add(i);
          } else if ((unit === "m" || unit === "min" || unit.startsWith("minute")) && num === 20) {
            mmpField = "best_watts_20m";
            powerConsumed.add(i);
          } else if ((unit === "m" || unit === "min" || unit.startsWith("minute")) && num === 60) {
            mmpField = "best_watts_60m";
            powerConsumed.add(i);
          } else if ((unit === "h" || unit === "hour" || unit.startsWith("hour")) && num === 1) {
            mmpField = "best_watts_60m";
            powerConsumed.add(i);
          }
        }
      }
      
      // Pattern: number followed by separate unit token (e.g., "5 sec", "1 min", "20 min")
      const num = parseInt(token, 10);
      if (!isNaN(num) && nextToken) {
        if ((nextToken === "s" || nextToken === "sec" || nextToken.startsWith("second")) && num === 5) {
          mmpField = "best_watts_5s";
          powerConsumed.add(i);
          powerConsumed.add(i + 1);
        } else if ((nextToken === "m" || nextToken === "min" || nextToken.startsWith("minute")) && num === 1) {
          mmpField = "best_watts_1m";
          powerConsumed.add(i);
          powerConsumed.add(i + 1);
        } else if ((nextToken === "m" || nextToken === "min" || nextToken.startsWith("minute")) && num === 5) {
          mmpField = "best_watts_5m";
          powerConsumed.add(i);
          powerConsumed.add(i + 1);
        } else if ((nextToken === "m" || nextToken === "min" || nextToken.startsWith("minute")) && num === 20) {
          mmpField = "best_watts_20m";
          powerConsumed.add(i);
          powerConsumed.add(i + 1);
        } else if ((nextToken === "m" || nextToken === "min" || nextToken.startsWith("minute")) && num === 60) {
          mmpField = "best_watts_60m";
          powerConsumed.add(i);
          powerConsumed.add(i + 1);
        } else if ((nextToken === "h" || nextToken === "hour" || nextToken.startsWith("hour")) && num === 1) {
          mmpField = "best_watts_60m";
          powerConsumed.add(i);
          powerConsumed.add(i + 1);
        }
      }
    }
    
    const powerIdx = tokens.indexOf("power");
    const wattsIdx = tokens.indexOf("watts");
    const wattIdx = tokens.indexOf("watt");
    const mentionsPower = powerIdx >= 0 || wattsIdx >= 0 || wattIdx >= 0 || ftpIdx >= 0;
    if (mmpField || mentionsPower) {
      if (powerIdx >= 0) powerConsumed.add(powerIdx);
      if (wattsIdx >= 0) powerConsumed.add(wattsIdx);
      if (wattIdx >= 0) powerConsumed.add(wattIdx);
      powerConsumed.forEach((i) => consumedIndices.add(i));
      intent = mmpField ? { kind: "mmp_power", field: mmpField } : { kind: "highest_power" };
    }
  }

  // Detect longest/farthest (only if no power intent)
  if (!intent) {
    const longestIdx = tokens.findIndex(t => ["longest", "farthest"].includes(t));
    if (longestIdx >= 0) {
      intent = { kind: "longest" };
      consumedIndices.add(longestIdx);
      const sportIdx = tokens.findIndex(t => ["run", "runs", "running"].includes(t));
      if (sportIdx >= 0) {
        intent.sport = "run";
        consumedIndices.add(sportIdx);
      }
      const bikeIdx = tokens.findIndex(t => ["ride", "rides", "bike", "cycling"].includes(t));
      if (bikeIdx >= 0) {
        intent.sport = "ride";
        consumedIndices.add(bikeIdx);
      }
    }
  }

  // Detect most intervals
  if (!intent) {
    const mostIdx = tokens.findIndex(t => t === "most");
    const intervalIdx = tokens.findIndex(t => ["intervals", "reps", "repeats"].includes(t));
    if (mostIdx >= 0 && intervalIdx >= 0) {
      intent = { kind: "most_intervals" };
      consumedIndices.add(mostIdx);
      consumedIndices.add(intervalIdx);
    }
  }

  // Detect fastest
  if (!intent) {
    const fastestIdx = tokens.findIndex(t => SPEED_WORDS.includes(t));
    if (fastestIdx >= 0) {
      intent = { kind: "fastest" };
      consumedIndices.add(fastestIdx);
      const sportIdx = tokens.findIndex(t => ["run", "runs", "running"].includes(t));
      if (sportIdx >= 0) {
        intent.sport = "run";
        consumedIndices.add(sportIdx);
      }
      const bikeIdx = tokens.findIndex(t => ["ride", "rides", "bike", "cycling"].includes(t));
      if (bikeIdx >= 0) {
        intent.sport = "ride";
        consumedIndices.add(bikeIdx);
      }
    }
  }

  // Detect hilliest/most climbing
  if (!intent) {
    const hilliestIdx = tokens.findIndex(t => ["hilliest", "climbing"].includes(t));
    const mostIdx = tokens.findIndex(t => t === "most");
    const mostClimbingIdx = mostIdx >= 0 && tokens.findIndex(t => t === "climbing") >= 0;
    if (hilliestIdx >= 0 || mostClimbingIdx) {
      intent = { kind: "hilliest" };
      if (hilliestIdx >= 0) consumedIndices.add(hilliestIdx);
      if (mostClimbingIdx) {
        consumedIndices.add(mostIdx);
        const climbIdx = tokens.findIndex(t => t === "climbing");
        consumedIndices.add(climbIdx);
      }
    }
  }

  // Detect highest HR (e.g., "highest heart rate", "highest hr", "highest average hr")
  const highestIdx = tokens.findIndex(t => ["highest", "max"].includes(t));
  const hrIdx = tokens.findIndex(t => ["hr", "heartrate", "heart"].includes(t));
  const avgIdx = tokens.findIndex(t => ["avg", "average"].includes(t));
  if (highestIdx >= 0 && hrIdx >= 0) {
    intent = { kind: "highest_hr" };
    consumedIndices.add(highestIdx);
    consumedIndices.add(hrIdx);
    if (avgIdx >= 0) consumedIndices.add(avgIdx);
    // Also consume "rate" if it follows "heart"
    const rateIdx = tokens.findIndex(t => t === "rate");
    if (rateIdx >= 0 && rateIdx === hrIdx + 1) consumedIndices.add(rateIdx);
  }

  // Detect highest power (e.g., "highest power", "highest watts", "highest average watts")
  const powerIdx = tokens.findIndex(t => ["power", "watts", "watt"].includes(t));
  if (highestIdx >= 0 && powerIdx >= 0) {
    intent = { kind: "highest_power" };
    consumedIndices.add(highestIdx);
    consumedIndices.add(powerIdx);
    if (avgIdx >= 0) consumedIndices.add(avgIdx);
    // Also consume "average" or "weighted" before power/watts
    const weightedIdx = tokens.findIndex(t => t === "weighted");
    if (weightedIdx >= 0) consumedIndices.add(weightedIdx);
  }

  // Stimulus words are labels, not places and not name keywords.
  // "most intervals" already consumed its tokens; still apply the interval predicate.
  const parsedStimulus = parseStimulusTokens(tokens, consumedIndices);
  parsedStimulus.indices.forEach((i) => consumedIndices.add(i));
  let stimulus = parsedStimulus.stimulus;
  if (intent?.kind === "most_intervals") {
    stimulus = { intervals: true, modifiers: stimulus?.modifiers ?? [] };
  }

  // Detect place filters (e.g., "Chicago races")
  if (!intent) {
    const raceIdx = tokens.findIndex(t => ["race", "races"].includes(t));
    const workoutIdx = tokens.findIndex(t => ["workout", "workouts", "session", "sessions"].includes(t));
    
    // If we have remaining tokens that could be place names
    const remainingAfterSuperlative = tokens.filter((_, i) => !consumedIndices.has(i));
    if (remainingAfterSuperlative.length > 0 && (raceIdx >= 0 || workoutIdx >= 0)) {
      // Try to extract place: anything that's not race/workout
      const placeTokens = remainingAfterSuperlative.filter(t =>
        !["race", "races", "workout", "workouts", "session", "sessions", "run", "runs", "running", "ride", "rides", "bike", "cycling"].includes(t) &&
        !STIMULUS_PLACE_WORDS.has(t)
      );
      if (placeTokens.length > 0) {
        const place = canonicalPlaceName(placeTokens.join(" "));
        const filterType = raceIdx >= 0 ? "race" as const : workoutIdx >= 0 ? "workout" as const : undefined;
        // "Chicago races" is a city plus a race word. A bare "fartlek session"
        // is not a place: workout/session only keeps a place when it is a known alias.
        const acceptPlace = filterType === "race" || isKnownPlaceTokens(placeTokens);
        if (place && acceptPlace && !isBlockedPlaceName(place)) {
          intent = { kind: "place_filter", place, filterType };
          consumedIndices.add(raceIdx >= 0 ? raceIdx : workoutIdx);
          placeTokens.forEach(pt => {
            const idx = tokens.indexOf(pt);
            if (idx >= 0) consumedIndices.add(idx);
          });
        }
      }
    }
  }

  // "in Chicago", "in the windy city", or a bare alias ("speedy Chicago runs").
  // Canonical form so chi / chitown / windy city share the Chicago pool.
  const parsedPlace = parsePlacePhrase(tokens, consumedIndices);
  let place = parsedPlace.place ? canonicalPlaceName(parsedPlace.place) : "";
  if (place) parsedPlace.consumedIndices.forEach((i) => consumedIndices.add(i));
  if (!place) {
    const bare = parseBarePlace(tokens, consumedIndices);
    if (bare) {
      place = bare.place;
      bare.consumedIndices.forEach((i) => consumedIndices.add(i));
    }
  }

  tokens.forEach((token, i) => {
    if (QUERY_FILLERS.has(token)) consumedIndices.add(i);
  });
  // "week's" tokenizes to week + s. Drop the possessive once the date word is consumed.
  tokens.forEach((token, i) => {
    if (token === "s" && i > 0 && consumedIndices.has(i - 1)) consumedIndices.add(i);
  });

  if (!place && intent?.kind === "place_filter") place = canonicalPlaceName(intent.place);
  // "interval" is a workout word. It must not survive as a place after the detector.
  if (place && isBlockedPlaceName(place)) {
    place = "";
    if (intent?.kind === "place_filter") intent = null;
  }

  const parsedWeekday = parseWeekday(tokens, consumedIndices);
  const weekday = parsedWeekday.weekday;
  parsedWeekday.consumedIndices.forEach((i) => consumedIndices.add(i));

  // "runs" / "run" selects the run pool once the rest of the query is a date, a place,
  // or a metric. A bare "runs" stays a keyword search.
  const sportHit = findSport(tokens, consumedIndices);
  if (
    sportHit.sport &&
    intent &&
    (intent.kind === "fastest" || intent.kind === "longest" || intent.kind === "place_filter")
  ) {
    if (!intent.sport) intent.sport = sportHit.sport;
    sportHit.indices.forEach((i) => consumedIndices.add(i));
  }

  if (!intent && (dateWindow || place || stimulus)) {
    const synonyms = listSynonymIndices(tokens, consumedIndices);
    const pending = tokens.filter(
      (_, i) => !consumedIndices.has(i) && !sportHit.indices.includes(i) && !synonyms.includes(i),
    );
    if (pending.length === 0 && (dateWindow || sportHit.sport || stimulus)) {
      sportHit.indices.forEach((i) => consumedIndices.add(i));
      synonyms.forEach((i) => consumedIndices.add(i));
      intent = { kind: "list", sport: sportHit.sport };
    } else if (pending.length === 0 && place) {
      intent = { kind: "place_filter", place };
    }
  }

  const resolvedPlace = place || null;

  // Consume a distance band only for fastest/longest, so a plain "10k" search
  // still matches the tag instead of becoming an empty list query.
  const parsedBand = parseDistanceBand(query);
  let distanceBand: DistanceBand | null = null;
  if (
    parsedBand.band &&
    intent &&
    (intent.kind === "fastest" || intent.kind === "longest")
  ) {
    distanceBand = parsedBand.band;
    parsedBand.consumedIndices.forEach((i) => consumedIndices.add(i));
    if (distanceBand.runsOnly && !intent.sport) intent.sport = "run";
  }

  let remainingTokens = tokens.filter((_, i) => !consumedIndices.has(i));
  // "runs on a Tuesday" has no date or place, so the list detector above skips it.
  if (!intent && weekday) {
    const listWord = (token: string) => RUN_WORDS.has(token) || RIDE_WORDS.has(token) || LIST_SYNONYMS.has(token);
    if (remainingTokens.every(listWord)) {
      const sport: "run" | "ride" | undefined = remainingTokens.some((token) => RUN_WORDS.has(token))
        ? "run"
        : remainingTokens.some((token) => RIDE_WORDS.has(token))
          ? "ride"
          : undefined;
      tokens.forEach((token, i) => {
        if (listWord(token)) consumedIndices.add(i);
      });
      remainingTokens = [];
      intent = { kind: "list", sport };
    }
  }
  // Deterministic if we have an intent and no remaining semantic tokens
  const isDeterministic = intent !== null && remainingTokens.length === 0;
  return { intent, dateWindow, distanceBand, place: resolvedPlace, weekday, stimulus, remainingTokens, isDeterministic };
}

export function classifyIntent(query: string, now?: Date): IntentClassification {
  return detectSuperlativeIntent(query, now);
}

function sportFromRemaining(tokens: string[]): "run" | "ride" | undefined {
  if (tokens.some((token) => RUN_WORDS.has(token))) return "run";
  if (tokens.some((token) => RIDE_WORDS.has(token))) return "ride";
  return undefined;
}

/** Stable identity for "did Jev change the hard filters?" Refetches only when this changes. */
export function intentHardKey(c: IntentClassification): string {
  const sport = c.intent && "sport" in c.intent ? c.intent.sport ?? "" : "";
  const placeFilter = c.intent?.kind === "place_filter" ? `${c.intent.place}:${c.intent.filterType ?? ""}` : "";
  const field = c.intent?.kind === "mmp_power" ? c.intent.field : "";
  return [
    c.intent?.kind ?? "",
    sport,
    placeFilter,
    field,
    c.place ?? "",
    c.weekday ?? "",
    c.dateWindow ? `${c.dateWindow.start}:${c.dateWindow.end}` : "",
    c.distanceBand?.kind ?? "",
    c.distanceBand?.label ?? "",
    c.stimulus?.intervals ? "intervals" : "",
    c.stimulus?.primary ?? "",
    (c.stimulus?.modifiers ?? []).join("+"),
  ].join("|");
}

/**
 * Fill gaps in an incomplete parse from parallel Jev answers.
 * A deterministic code parse is already a hard filter: those answers are discarded.
 * has_place and has_date_window carry no value code can apply, so they are discarded too.
 */
export function applyJevIntent(
  base: IntentClassification,
  facets: Record<string, number> | undefined,
): IntentClassification {
  if (!facets || Object.keys(facets).length === 0) return base;
  const blocked = base.place != null && isBlockedPlaceName(base.place);
  if (base.isDeterministic && !blocked) return base;

  let next = base;
  const edit = (): IntentClassification => {
    if (next !== base) return next;
    next = {
      ...base,
      intent: base.intent ? { ...base.intent } : null,
      stimulus: base.stimulus
        ? { intervals: base.stimulus.intervals, primary: base.stimulus.primary, modifiers: [...base.stimulus.modifiers] }
        : null,
    };
    return next;
  };

  if (blocked) {
    const edited = edit();
    edited.place = null;
    if (edited.intent?.kind === "place_filter") {
      edited.intent = { kind: "list", sport: edited.intent.sport };
    }
  }
  if (base.isDeterministic) return next;

  if (!base.stimulus) {
    const stimulus = stimulusFromFacets(facets);
    if (stimulus) {
      const edited = edit();
      edited.stimulus = stimulus;
      if (!edited.intent) {
        edited.intent = { kind: "list", sport: sportFromRemaining(edited.remainingTokens) };
      }
    }
  }

  if (!base.intent || base.intent.kind === "list") {
    const fast = facets.is_fastest ?? 0;
    const long = facets.is_longest ?? 0;
    if (Math.max(fast, long) >= JEV_INTENT_CONFIDENCE && Math.abs(fast - long) >= 0.1) {
      const edited = edit();
      const existing = edited.intent && "sport" in edited.intent ? edited.intent.sport : undefined;
      edited.intent = {
        kind: fast > long ? "fastest" : "longest",
        sport: existing ?? sportFromRemaining(edited.remainingTokens),
      };
    }
  }

  if (!base.dateWindow && (next.stimulus || next.intent)) {
    const year = winningYear(facets);
    if (year) {
      const edited = edit();
      edited.dateWindow = { start: `${year}-01-01`, end: `${year}-12-31` };
      if (!edited.intent) edited.intent = { kind: "list", sport: sportFromRemaining(edited.remainingTokens) };
    }
  }

  if (!base.place && (facets.place_chicago ?? 0) >= JEV_INTENT_CONFIDENCE) {
    const edited = edit();
    edited.place = "chicago";
  }

  const kind = next.intent?.kind;
  if (!base.distanceBand && (kind === "fastest" || kind === "longest")) {
    const band = winningDistanceBand(facets);
    if (band) {
      const edited = edit();
      edited.distanceBand = raceBand(band);
      if (edited.distanceBand.runsOnly && edited.intent && "sport" in edited.intent && !edited.intent.sport) {
        edited.intent.sport = "run";
      }
    }
  }

  if (next.stimulus && next.intent && "sport" in next.intent && !next.intent.sport) {
    const run = facets.is_run ?? 0;
    const ride = facets.is_ride ?? 0;
    const pick = run >= JEV_INTENT_CONFIDENCE && ride <= 0.25 && run - ride >= 0.4
      ? "run"
      : ride >= JEV_INTENT_CONFIDENCE && run <= 0.25 && ride - run >= 0.4
        ? "ride"
        : null;
    if (pick) {
      const edited = edit();
      if (edited.intent && "sport" in edited.intent) edited.intent.sport = pick;
    }
  }

  return next;
}

export type SettledIntentPayload = {
  stimulus?: { intervals?: boolean; primary?: string; modifiers?: string[] } | null;
  place?: string | null;
  dateWindow?: { start?: string; end?: string } | null;
  sport?: "run" | "ride" | null;
  kind?: string | null;
};

/** What the browser already settled, so the next packed call can condition membership. */
export function settledIntentPayload(c: IntentClassification): SettledIntentPayload {
  const sport = c.intent && "sport" in c.intent ? c.intent.sport ?? null : null;
  return {
    stimulus: c.stimulus
      ? {
          intervals: c.stimulus.intervals,
          primary: c.stimulus.primary,
          modifiers: [...c.stimulus.modifiers],
        }
      : null,
    place: c.place,
    dateWindow: c.dateWindow ? { start: c.dateWindow.start, end: c.dateWindow.end } : null,
    sport,
    kind: c.intent?.kind ?? null,
  };
}

function validGapStimulus(raw: unknown): StimulusConstraint | null {
  if (!raw || typeof raw !== "object") return null;
  const stimulus = raw as { intervals?: unknown; primary?: unknown; modifiers?: unknown };
  const intervals = stimulus.intervals === true;
  const primary = typeof stimulus.primary === "string" && (PRIMARY_STIMULI as readonly string[]).includes(stimulus.primary)
    ? stimulus.primary as PrimaryStimulus
    : undefined;
  const modifiers = Array.isArray(stimulus.modifiers)
    ? stimulus.modifiers.filter((mod): mod is string =>
        typeof mod === "string" && (HARD_MODIFIERS as readonly string[]).includes(mod))
    : [];
  if (!intervals && !primary && modifiers.length === 0) return null;
  if (intervals) return { intervals: true, modifiers };
  return { intervals: false, primary, modifiers };
}

function validGapYear(raw: unknown, now?: Date): DateWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const start = (raw as { start?: unknown }).start;
  const end = (raw as { end?: unknown }).end;
  if (typeof start !== "string" || typeof end !== "string") return null;
  const match = /^(\d{4})-01-01$/.exec(start);
  if (!match || end !== `${match[1]}-12-31`) return null;
  const year = Number(match[1]);
  const current = chicagoClock(now).getFullYear();
  if (year < current - 6 || year > current + 1) return null;
  return { start, end };
}

function validGapPlace(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const canonical = canonicalPlaceName(raw);
  if (!canonical || isBlockedPlaceName(canonical) || !isKnownPlaceTokens(tokenize(canonical))) return null;
  return canonical;
}

type ParsedGap = {
  stimulus: StimulusConstraint | null;
  place: string | null;
  dateWindow: DateWindow | null;
  sport: "run" | "ride" | null;
  kind: "fastest" | "longest" | null;
};

function parseSettledPayload(raw: unknown, now?: Date): ParsedGap | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const stimulus = validGapStimulus(body.stimulus);
  const place = validGapPlace(body.place);
  const dateWindow = validGapYear(body.dateWindow, now);
  const sport = body.sport === "run" || body.sport === "ride" ? body.sport : null;
  const kind = body.kind === "fastest" || body.kind === "longest" ? body.kind : null;
  if (!stimulus && !place && !dateWindow && !sport && !kind) return null;
  return { stimulus, place, dateWindow, sport, kind };
}

/**
 * Use a client gap-fill on the next Jev call. A deterministic code parse is kept.
 * Only vocab values can land: known stimuli, a full calendar year, Chicago, fastest, longest.
 */
export function resolveInterpretation(query: string, settled: unknown, now?: Date): IntentClassification {
  const base = classifyIntent(query, now);
  if (base.isDeterministic && !(base.place && isBlockedPlaceName(base.place))) return base;
  const gap = parseSettledPayload(settled, now);
  if (!gap) return base;

  let next = base;
  const edit = (): IntentClassification => {
    if (next !== base) return next;
    next = {
      ...base,
      intent: base.intent ? { ...base.intent } : null,
      stimulus: base.stimulus
        ? { intervals: base.stimulus.intervals, primary: base.stimulus.primary, modifiers: [...base.stimulus.modifiers] }
        : null,
    };
    return next;
  };

  if (base.place && isBlockedPlaceName(base.place)) {
    const edited = edit();
    edited.place = null;
    if (edited.intent?.kind === "place_filter") {
      edited.intent = { kind: "list", sport: edited.intent.sport };
    }
  }
  if (base.isDeterministic) return next;

  if (!base.stimulus && gap.stimulus) {
    const edited = edit();
    edited.stimulus = {
      intervals: gap.stimulus.intervals,
      primary: gap.stimulus.primary,
      modifiers: [...gap.stimulus.modifiers],
    };
    if (!edited.intent) {
      edited.intent = { kind: "list", sport: sportFromRemaining(edited.remainingTokens) };
    }
  }

  if ((!base.intent || base.intent.kind === "list") && (gap.kind === "fastest" || gap.kind === "longest")) {
    const edited = edit();
    const existing = edited.intent && "sport" in edited.intent ? edited.intent.sport : undefined;
    edited.intent = {
      kind: gap.kind,
      sport: existing ?? sportFromRemaining(edited.remainingTokens),
    };
  }

  if (!base.dateWindow && gap.dateWindow && (next.stimulus || next.intent)) {
    const edited = edit();
    edited.dateWindow = gap.dateWindow;
    if (!edited.intent) edited.intent = { kind: "list", sport: sportFromRemaining(edited.remainingTokens) };
  }

  if (!base.place && gap.place) {
    const edited = edit();
    edited.place = gap.place;
  }

  if (next.stimulus && next.intent && "sport" in next.intent && !next.intent.sport && gap.sport) {
    const edited = edit();
    if (edited.intent && "sport" in edited.intent) edited.intent.sport = gap.sport;
  }

  return next;
}

// Short gloss for Jev so "speedy", "last month", and "in Chicago" are explicit.
export function describeIntent(c: IntentClassification): string {
  const bits: string[] = [];
  const intent = c.intent;
  if (intent?.kind === "fastest") {
    bits.push(
      c.distanceBand
        ? `fastest ${c.distanceBand.label}, shorter moving time is a better match`
        : "fastest pace; a fast pace is a strong match and an easy pace is not",
    );
  } else if (intent?.kind === "longest") {
    bits.push("longest distance; a long effort is a strong match and a short one is not");
  } else if (intent?.kind === "list") {
    bits.push("list of matching activities, most recent first; every activity that fits the sport, place, and dates is a match");
  } else if (intent?.kind === "place_filter") {
    bits.push(intent.filterType ? `${intent.filterType}s in this place` : "activities in this place");
  } else if (intent?.kind) {
    bits.push(intent.kind.replaceAll("_", " "));
  }
  if (intent && "sport" in intent && intent.sport) bits.push(`${intent.sport}s only`);
  const stimulusBit = stimulusSummary(c.stimulus);
  if (stimulusBit) bits.push(`stimulus ${stimulusBit}`);
  if (c.place) bits.push(`in ${c.place}`);
  if (c.weekday) bits.push(`on ${c.weekday}`);
  if (c.dateWindow) bits.push(`dated ${c.dateWindow.start} through ${c.dateWindow.end}`);
  return bits.join("; ");
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
  // "10ks" is the same tag as "10k". Digits are exact, so the plural would otherwise miss.
  if (/^\d+ks$/.test(token)) token = token.slice(0, -1);
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

type ShortlistBranch = {
  id: ShortlistBranchId;
  dateWindow: DateWindow | null;
  place: string | null;
  weekday: string | null;
  sport?: "run" | "ride";
  stimulus: StimulusConstraint | null;
  distanceBand: DistanceBand | null;
  filterType?: "race" | "workout";
  intent: SuperlativeIntent;
  tokens: string[];
};

function intentSport(intent: SuperlativeIntent): "run" | "ride" | undefined {
  return intent && "sport" in intent ? intent.sport : undefined;
}

function isLoosenedMetric(intent: SuperlativeIntent): boolean {
  return intent?.kind === "fastest" || intent?.kind === "longest";
}

// One query, several plausible pools. Date, place, weekday, sport, and stimulus
// labels are hard on every branch. Band, pace floor, and keyword leftovers are not:
// a too-narrow metric branch must not be the only way an activity can appear.
function buildShortlistBranches(c: IntentClassification, query: string): ShortlistBranch[] {
  const sport = intentSport(c.intent);
  const branches: ShortlistBranch[] = [];
  const shared = {
    dateWindow: c.dateWindow,
    place: c.place,
    weekday: c.weekday,
    sport,
    stimulus: c.stimulus,
  };
  const metric = c.intent && c.intent.kind !== "list" && c.intent.kind !== "place_filter" ? c.intent : null;

  if (metric) {
    branches.push({
      ...shared,
      id: "metric",
      distanceBand: c.distanceBand,
      intent: metric,
      tokens: [],
    });
  }

  // "Fastest in Chicago" can also mean the longest Chicago run. Same hard place.
  // Ahead of the date list so an empty distance band falls open onto it.
  if (c.place && c.intent?.kind === "fastest") {
    branches.push({
      ...shared,
      id: "place-longest",
      distanceBand: null,
      intent: { kind: "longest", sport },
      tokens: [],
    });
  }

  if (c.dateWindow && (c.intent?.kind === "list" || isLoosenedMetric(c.intent))) {
    branches.push({
      ...shared,
      id: "date-list",
      distanceBand: null,
      intent: { kind: "list", sport },
      tokens: [],
    });
  }

  if (c.place && !c.dateWindow && (c.intent?.kind === "list" || c.intent?.kind === "place_filter" || isLoosenedMetric(c.intent))) {
    branches.push({
      ...shared,
      id: "place-list",
      dateWindow: null,
      distanceBand: null,
      filterType: c.intent?.kind === "place_filter" ? c.intent.filterType : undefined,
      intent: c.intent?.kind === "place_filter" ? c.intent : { kind: "list", sport },
      tokens: [],
    });
  }

  // "runs on a Tuesday" is a list with no date and no place.
  if (!c.dateWindow && !c.place && c.intent?.kind === "list") {
    branches.push({
      ...shared,
      id: "place-list",
      distanceBand: null,
      intent: { kind: "list", sport },
      tokens: [],
    });
  }

  const keywordTokens = c.remainingTokens.length > 0
    ? Array.from(new Set(c.remainingTokens))
    : branches.length === 0
      ? Array.from(new Set(tokenize(query)))
      : [];
  if (keywordTokens.length > 0) {
    branches.push({
      ...shared,
      id: "keyword",
      distanceBand: null,
      intent: null,
      tokens: keywordTokens,
    });
  }

  return branches;
}

export function planShortlist(query: string, now?: Date): ShortlistBranchId[] {
  return buildShortlistBranches(classifyIntent(query, now), query).map((branch) => branch.id);
}

function inWindow(activity: Activity, window: DateWindow): boolean {
  const activityDate = activity.start_date_local.slice(0, 10);
  return activityDate >= window.start && activityDate <= window.end;
}

function matchesSportChoice(activity: Activity, sport: "run" | "ride" | undefined): boolean {
  if (!sport) return true;
  return matchesModality(activity, sport);
}

function compareRecency(a: Activity, b: Activity): number {
  return labelConfidence(a) - labelConfidence(b) || b.start_date_local.localeCompare(a.start_date_local);
}

function applyBranchFilters(index: IndexedActivity[], branch: ShortlistBranch): IndexedActivity[] {
  let candidates = index;
  if (branch.dateWindow) {
    const window = branch.dateWindow;
    candidates = candidates.filter(({ activity }) => inWindow(activity, window));
  }
  if (branch.weekday) {
    const dayIndex = WEEKDAYS.indexOf(branch.weekday);
    if (dayIndex >= 0) {
      candidates = candidates.filter(({ activity }) => localStart(activity).getDay() === dayIndex);
    }
  }
  if (branch.intent?.kind === "mmp_power") {
    const field = branch.intent.field;
    candidates = candidates.filter(({ activity }) => isRide(activity) && activity[field] != null);
  } else if (branch.intent?.kind === "highest_power") {
    candidates = candidates.filter(({ activity }) =>
      isRide(activity) && (activity.average_watts != null || activity.weighted_average_watts != null));
  } else if (branch.sport) {
    candidates = candidates.filter(({ activity }) => matchesSportChoice(activity, branch.sport));
  }
  if (branch.stimulus) {
    const stimulus = branch.stimulus;
    candidates = candidates.filter(({ activity }) => matchesStimulus(activity, stimulus));
  }
  if (branch.place) {
    candidates = candidates.filter(({ activity }) => activityMatchesPlace(activity, branch.place!));
  }
  if (branch.filterType === "race") {
    candidates = candidates.filter(({ activity }) => matchesPrimary(activity, "race"));
  } else if (branch.filterType === "workout") {
    candidates = candidates.filter(({ activity }) => activity.workout_type === 3 || activity.workout_type === 12);
  }
  if (branch.distanceBand && branch.intent && (branch.intent.kind === "fastest" || branch.intent.kind === "longest")) {
    const band = branch.distanceBand;
    const sport = branch.sport;
    candidates = candidates.filter(({ activity }) => {
      if (!inDistanceBand(activity.distance_m, band)) return false;
      if (band.runsOnly && sport !== "ride" && !isRun(activity)) return false;
      return true;
    });
  }
  return candidates;
}

const RACE_DISTANCE_TOKENS = new Set(["5k", "10k", "half", "marathon"]);

// Named-race keywords ("Chicago Marathon", "10k this year") were ranking recent
// training miles first because keyword score ties break on recency. A race-labeled
// activity whose name is that race, or any race when the only leftover token is the
// distance, sorts ahead of those miles. Membership re-rank can still reorder after.
function raceNameBoost(activity: Activity, tokens: string[]): number {
  const raceTokens = tokens.filter((token) => RACE_DISTANCE_TOKENS.has(token));
  if (raceTokens.length === 0 || !matchesPrimary(activity, "race")) return 0;
  const name = new Set(tokenize(activity.name));
  const named = raceTokens.every((token) => name.has(token));
  const distanceOnly = tokens.every((token) => RACE_DISTANCE_TOKENS.has(token));
  if (named || distanceOnly) return 2;
  return 0;
}

function keywordHits(candidates: IndexedActivity[], tokens: string[]): SearchHit[] {
  const full: SearchHit[] = [];
  const partial: SearchHit[] = [];
  for (const { activity, words } of candidates) {
    let total = 0;
    let hitCount = 0;
    let anyFuzzy = false;
    const matched: string[] = [];
    for (const token of tokens) {
      const { score, fuzzy } = scoreToken(token, words);
      if (score > 0) {
        hitCount++;
        total += score;
        matched.push(token);
        anyFuzzy ||= fuzzy;
      }
    }
    if (hitCount === 0) continue;
    const hit: SearchHit = {
      activity,
      // low_confidence sinks the hit. It does not remove it.
      score: total / tokens.length - 0.2 * labelConfidence(activity) + raceNameBoost(activity, tokens),
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
  return full.length >= 10 ? full : [...full, ...partial];
}

function runShortlistBranch(index: IndexedActivity[], branch: ShortlistBranch, limit: number): SearchHit[] {
  const candidates = applyBranchFilters(index, branch);
  if (branch.id === "keyword") {
    return keywordHits(candidates, branch.tokens).slice(0, limit);
  }
  const hits = candidates.map((entry): SearchHit => ({
    activity: entry.activity,
    score: 1,
    kind: "keyword",
    matched: [],
  }));
  if (branch.intent?.kind === "place_filter") {
    return hits.sort((a, b) => compareRecency(a.activity, b.activity)).slice(0, limit);
  }
  return applySuperlativeSorting(hits, branch.intent, limit, branch.distanceBand);
}

export function searchActivities(
  index: IndexedActivity[],
  query: string,
  limit = 200,
  now?: Date,
  classification: IntentClassification = detectSuperlativeIntent(query, now),
): SearchHit[] {
  const branches = buildShortlistBranches(classification, query);
  const seen = new Set<number>();
  const merged: SearchHit[] = [];
  for (const branch of branches) {
    if (merged.length >= limit) break;
    // A code-settled list stays locked. A list opened by a soft leftover
    // ("fartlek" filled as intervals) stays unlocked so membership can order it.
    const softFill = !classification.isDeterministic && classification.remainingTokens.length > 0;
    const locked = branch.id === "metric"
      || branch.id === "place-longest"
      || (!softFill && branch.id !== "keyword");
    for (const hit of runShortlistBranch(index, branch, limit)) {
      if (seen.has(hit.activity.id)) continue;
      seen.add(hit.activity.id);
      merged.push({ ...hit, branch: branch.id, locked });
      if (merged.length >= limit) break;
    }
  }
  return merged;
}

/**
 * Cookbook re-rank floor. A noul below this is a weak yes (Jev 1.13 sits near
 * 0.26–0.40 when the proposition is unclear). Demote those unlocked rows behind
 * stronger yeses. Do not drop them: an all-weak shortlist should still show,
 * in noul order. Locked rows are not passed through this sort.
 * https://docs.typesafe.ai/cookbooks/rerank_typesafe
 */
export const MEMBERSHIP_DEMOTE_BELOW = 0.3;

export type MembershipCompanions = Record<number, { stimulus?: number; place?: number } | undefined>;

/**
 * Unlocked shortlist order is the membership noul, highest first.
 * Stimulus-fit and place-fit companions only break ties. Locked rows stay
 * in the code order they already have, ahead of the re-ranked tail.
 */
export function rerankUnlockedHits<T extends { activity: { id: number }; locked?: boolean }>(
  hits: T[],
  scores: Record<number, number>,
  companions?: MembershipCompanions,
): T[] {
  const open = hits.filter((hit) => hit.locked === false);
  if (open.length === 0) return hits;
  const locked = hits.filter((hit) => hit.locked !== false);
  const scored = open.filter((hit) => typeof scores[hit.activity.id] === "number");
  const unscored = open.filter((hit) => typeof scores[hit.activity.id] !== "number");
  const tie = (id: number) => {
    const extra = companions?.[id];
    if (!extra) return 0;
    return (extra.stimulus ?? 0) + (extra.place ?? 0);
  };
  scored.sort((a, b) => {
    const left = scores[a.activity.id];
    const right = scores[b.activity.id];
    const demoteLeft = left < MEMBERSHIP_DEMOTE_BELOW ? 1 : 0;
    const demoteRight = right < MEMBERSHIP_DEMOTE_BELOW ? 1 : 0;
    if (demoteLeft !== demoteRight) return demoteLeft - demoteRight;
    if (right !== left) return right - left;
    return tie(b.activity.id) - tie(a.activity.id);
  });
  return [...locked, ...scored, ...unscored];
}

function applySuperlativeSorting(
  hits: SearchHit[],
  intent: SuperlativeIntent,
  limit: number,
  distanceBand: DistanceBand | null,
): SearchHit[] {
  if (!intent || intent.kind === "place_filter") return hits.slice(0, limit);

  const sorted = [...hits];
  
  if (intent.kind === "longest") {
    sorted.sort((a, b) => b.activity.distance_m - a.activity.distance_m);
  } else if (intent.kind === "fastest") {
    if (distanceBand) {
      // Inside a fixed band, the shorter moving time is the faster effort.
      // Pace would still prefer a slightly short GPS file over the quicker clocking.
      sorted.sort((a, b) => {
        const timeA = a.activity.moving_time_s > 0 ? a.activity.moving_time_s : Infinity;
        const timeB = b.activity.moving_time_s > 0 ? b.activity.moving_time_s : Infinity;
        return timeA - timeB || b.activity.distance_m - a.activity.distance_m;
      });
    } else {
      // No band: pace is the only comparison that isn't "shortest workout".
      // Drop strides and short shakeouts so "fastest run" is a real run.
      const paced = sorted.filter((hit) => hit.activity.distance_m >= MIN_UNBANDED_FASTEST_M);
      const pool = paced.length > 0 ? paced : sorted;
      pool.sort((a, b) => {
        const paceA = a.activity.distance_m > 0 ? a.activity.moving_time_s / a.activity.distance_m : Infinity;
        const paceB = b.activity.distance_m > 0 ? b.activity.moving_time_s / b.activity.distance_m : Infinity;
        return paceA - paceB;
      });
      return pool.slice(0, limit);
    }
  } else if (intent.kind === "most_intervals") {
    // Sort by interval_score (desc), then hard_lap_count (desc), then has_intervals
    sorted.sort((a, b) => {
      const scoreA = a.activity.interval_score ?? 0;
      const scoreB = b.activity.interval_score ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      
      const lapsA = a.activity.hard_lap_count ?? 0;
      const lapsB = b.activity.hard_lap_count ?? 0;
      if (lapsB !== lapsA) return lapsB - lapsA;
      
      const hasA = a.activity.has_intervals ? 1 : 0;
      const hasB = b.activity.has_intervals ? 1 : 0;
      return hasB - hasA;
    });
  } else if (intent.kind === "hilliest") {
    sorted.sort((a, b) => b.activity.elevation_gain_m - a.activity.elevation_gain_m);
  } else if (intent.kind === "highest_hr") {
    // Sort by average heart rate (desc), filter out activities without HR data
    const withHr = sorted.filter(h => h.activity.average_heartrate !== undefined);
    withHr.sort((a, b) => (b.activity.average_heartrate ?? 0) - (a.activity.average_heartrate ?? 0));
    return withHr.slice(0, limit);
  } else if (intent.kind === "mmp_power") {
    // Sort by MMP field descending
    sorted.sort((a, b) => {
      const valA = a.activity[intent.field] ?? 0;
      const valB = b.activity[intent.field] ?? 0;
      return valB - valA;
    });
  } else if (intent.kind === "highest_power") {
    // Sort by weighted average watts (or average watts if weighted not available), filter out activities without power data
    const withPower = sorted.filter(h => 
      h.activity.average_watts !== undefined || h.activity.weighted_average_watts !== undefined
    );
    withPower.sort((a, b) => {
      const powerA = a.activity.weighted_average_watts ?? a.activity.average_watts ?? 0;
      const powerB = b.activity.weighted_average_watts ?? b.activity.average_watts ?? 0;
      return powerB - powerA;
    });
    return withPower.slice(0, limit);
  } else if (intent.kind === "list") {
    sorted.sort((a, b) => compareRecency(a.activity, b.activity));
  }

  return sorted.slice(0, limit);
}

function chicagoClock(now?: Date): Date {
  return now ?? new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
}

function formatISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysAgoLabel(activityDate: string, now?: Date): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(activityDate)) return "";
  const today = formatISODate(chicagoClock(now));
  const [ys, ms, ds] = activityDate.split("-").map(Number);
  const [ye, me, de] = today.split("-").map(Number);
  const diff = Math.round((Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / 86_400_000);
  if (!Number.isFinite(diff)) return "";
  if (diff <= 0) return "today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

function weekdayName(a: Activity): string {
  const name = WEEKDAYS[localStart(a).getDay()];
  if (!name) return "";
  return name.replace(/^./, (letter) => letter.toUpperCase());
}

function runPaceParts(a: Activity): { text: string; pace: string; label: string } | null {
  if (!isRun(a) || a.distance_m <= 0 || a.moving_time_s <= 0) return null;
  const speedMps = a.average_speed && a.average_speed > 0
    ? a.average_speed
    : a.distance_m / a.moving_time_s;
  if (!Number.isFinite(speedMps) || speedMps <= 0) return null;
  const secondsPerMile = Math.round(1609.344 / speedMps);
  const label = secondsPerMile <= 7 * 60 + 30 ? "fast pace" : secondsPerMile <= 9 * 60 ? "moderate pace" : "easy pace";
  const pace = `${formatDuration(secondsPerMile)} /mi`;
  return { text: `${pace}, ${label}`, pace, label };
}

function clippedDescription(description: string | undefined): string {
  if (!description) return "";
  const clean = description.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > MAX_RANKING_DESCRIPTION
    ? `${clean.slice(0, MAX_RANKING_DESCRIPTION - 3)}...`
    : clean;
}

function rankingDescription(description: string | undefined): string {
  const clipped = clippedDescription(description);
  return clipped ? `description: ${clipped}` : "";
}

export type ActivityFacts = {
  name: string;
  sport: string;
  date: string;
  weekday?: string;
  year?: string;
  days_ago?: string;
  distance_km?: number;
  moving_time?: string;
  pace?: string;
  pace_label?: string;
  climbing_m?: number;
  workout?: string;
  indoor?: true;
  stimulus?: string;
  stimulus_cluster?: string;
  modality?: string;
  low_confidence?: true;
  modifiers?: string[];
  place?: string;
  intervals?: string;
  heart_rate?: string;
  power?: string;
  best_20min_watts?: number;
  description?: string;
};

/** Structured activity fields for one packed Jev call. Empty fields are omitted. */
export function activityFacts(a: Activity, now?: Date): ActivityFacts {
  const date = a.start_date_local.slice(0, 10);
  const year = date.slice(0, 4);
  const km = a.distance_m / 1000;
  const pace = runPaceParts(a);
  const weekday = weekdayName(a);
  const daysAgo = daysAgoLabel(date, now);
  const notes = clippedDescription(a.description);
  const facts: ActivityFacts = {
    name: a.name,
    sport: sportLabel(a.sport_type),
    date,
  };
  if (weekday) facts.weekday = weekday;
  if (/^\d{4}$/.test(year)) facts.year = year;
  if (daysAgo) facts.days_ago = daysAgo;
  if (km > 0) facts.distance_km = Math.round(km * 10) / 10;
  if (a.moving_time_s > 0) facts.moving_time = formatDuration(a.moving_time_s);
  if (pace) {
    facts.pace = pace.pace;
    facts.pace_label = pace.label;
  }
  if (a.elevation_gain_m > 0) facts.climbing_m = a.elevation_gain_m;
  const workout = WORKOUT_TAGS[a.workout_type ?? -1]?.[0];
  if (workout) facts.workout = workout;
  if (a.trainer) facts.indoor = true;
  if (a.primary_stimulus) facts.stimulus = a.primary_stimulus;
  if (a.stimulus_cluster) facts.stimulus_cluster = a.stimulus_cluster;
  if (a.modality) facts.modality = a.modality;
  if (a.low_confidence || a.primary_stimulus === "low_confidence") facts.low_confidence = true;
  if (a.modifiers && a.modifiers.length > 0) facts.modifiers = a.modifiers.slice(0, 3);
  if (a.place) facts.place = a.place;
  if (a.has_intervals) facts.intervals = a.hard_lap_count ? `${a.hard_lap_count} hard laps` : "intervals";
  if (a.average_heartrate) {
    facts.heart_rate = a.max_heartrate
      ? `${Math.round(a.average_heartrate)} bpm avg (max ${Math.round(a.max_heartrate)})`
      : `${Math.round(a.average_heartrate)} bpm avg`;
  }
  if (a.average_watts || a.weighted_average_watts) {
    const watts = Math.round(a.weighted_average_watts ?? a.average_watts ?? 0);
    facts.power = a.weighted_average_watts ? `${watts}W weighted avg` : `${watts}W avg`;
  }
  if (a.best_watts_20m) facts.best_20min_watts = Math.round(a.best_watts_20m);
  if (notes) facts.description = notes;
  return facts;
}

export type JevNoul = {
  type: "noul";
  instructions: string;
  criteria: { true: string; false: string };
};

// Dates come from interpreted_query. Last-month's window and whether a
// neighborhood counts as the city are still open against main, so this rubric
// does not assert either one.
const HOW_TO_JUDGE =
  "Sport, place, weekday, and dates must fit the interpreted query. The dates in interpreted_query are the window; do not substitute a different month. Last week is the previous Monday–Sunday. Speedy, fast, and quick mean a fast pace: trust a fast pace label, or a run around 7:30/mi or quicker. An easy pace is not speedy. Fastest matches a genuinely quick effort. Longest matches a long effort, well over 20 km for a run. A city counts when the place or the name matches that city. A list or date-window query matches every activity of the right sport inside that window. A race is marked race, not merely mentioned. Stimulus words are label filters already applied before this score. low_confidence is a caveat, not by itself a mismatch.";

function facetNoul(instructions: string, yes: string, no: string): JevNoul {
  return { type: "noul", instructions, criteria: { true: yes, false: no } };
}

// Speculative intent questions. They share state with the membership noul and
// cannot see each other. Code discards the ones it does not use.
function intentFacetQuestions(now?: Date): Record<string, JevNoul> {
  const year = chicagoClock(now).getFullYear();
  const yes = "The query asks for this.";
  const no = "The query does not ask for this.";
  const questions: Record<string, JevNoul> = {
    is_easy: facetNoul(
      "Using only search_query and vocab, the user wants primary_stimulus easy. Not an easy pace inside a fastest query.",
      yes,
      no,
    ),
    is_intervals: facetNoul(
      "Using only search_query and vocab, the user wants interval workouts, repeats, reps, fartlek, or speed play. vocab.synonyms maps fartlek, speed play, and speedwork onto intervals. Do not invent a new primary_stimulus. Interval is a workout kind, never a place.",
      "The query asks for intervals or a vocab synonym of intervals.",
      "The query does not ask for interval work.",
    ),
    is_quality: facetNoul(
      "Using only search_query and vocab, the user wants quality sessions and is not specifically asking for intervals.",
      yes,
      no,
    ),
    is_long: facetNoul(
      "Using only search_query and vocab, the user wants long-run stimulus, not the single longest activity.",
      yes,
      no,
    ),
    is_race: facetNoul("Using only search_query and vocab, the user wants races.", yes, no),
    is_recovery: facetNoul("Using only search_query and vocab, the user wants recovery stimulus.", yes, no),
    is_probe: facetNoul("Using only search_query and vocab, the user wants probe stimulus.", yes, no),
    is_hills: facetNoul(
      "Using only search_query and vocab, the user wants hills stimulus, not the hilliest activity.",
      yes,
      no,
    ),
    is_tempo: facetNoul("Using only search_query and vocab, the user wants tempo.", yes, no),
    is_marathon_pace: facetNoul("Using only search_query and vocab, the user wants marathon pace.", yes, no),
    is_fastest: facetNoul("Using only search_query and vocab, the user wants the fastest pace or shortest time.", yes, no),
    is_longest: facetNoul("Using only search_query and vocab, the user wants the longest distance.", yes, no),
    is_run: facetNoul("Using only search_query and vocab, the user restricts modality to run.", yes, no),
    is_ride: facetNoul("Using only search_query and vocab, the user restricts modality to bike or ride.", yes, no),
    place_chicago: facetNoul(
      "Using only search_query and vocab, the user names Chicago (Chi, Chitown, or Windy City) as the place.",
      yes,
      no,
    ),
    // Discarded in code: a yes does not name which place or which dates.
    has_place: facetNoul(
      "Using only search_query, the user names a place. A workout word such as interval is not a place.",
      yes,
      no,
    ),
    has_date_window: facetNoul(
      "Using only search_query, the user restricts dates. Code computes the window.",
      yes,
      no,
    ),
    band_5k: facetNoul("Using only search_query, the user asks for a 5k distance.", yes, no),
    band_10k: facetNoul("Using only search_query, the user asks for a 10k distance.", yes, no),
    band_half: facetNoul("Using only search_query, the user asks for a half marathon distance.", yes, no),
    band_marathon: facetNoul("Using only search_query, the user asks for a marathon distance.", yes, no),
  };
  for (let y = year - 6; y <= year; y++) {
    questions[`year_${y}`] = facetNoul(
      `Using only search_query, the user refers to calendar year ${y}.`,
      yes,
      no,
    );
  }
  return questions;
}

export type JevAnswerMap = Record<string, { noul?: number }>;

export type JevCompanions = Record<number, { stimulus?: number; place?: number }>;

/** Membership keys are a{id}. a{id}s / a{id}p are companion nouls. Everything else is an intent facet. */
export function splitJevAnswers(answers: JevAnswerMap): {
  scores: Record<number, number>;
  facets: Record<string, number>;
  companions: JevCompanions;
} {
  const scores: Record<number, number> = {};
  const facets: Record<string, number> = {};
  const companions: JevCompanions = {};
  for (const [key, answer] of Object.entries(answers)) {
    if (typeof answer?.noul !== "number") continue;
    const membership = /^a(\d+)$/.exec(key);
    const stimulus = /^a(\d+)s$/.exec(key);
    const place = /^a(\d+)p$/.exec(key);
    if (membership) scores[Number(membership[1])] = answer.noul;
    else if (stimulus) {
      const id = Number(stimulus[1]);
      companions[id] = { ...companions[id], stimulus: answer.noul };
    } else if (place) {
      const id = Number(place[1]);
      companions[id] = { ...companions[id], place: answer.noul };
    } else facets[key] = answer.noul;
  }
  return { scores, facets, companions };
}

function metricKind(c: IntentClassification): boolean {
  const kind = c.intent?.kind;
  return kind === "fastest" || kind === "longest" || kind === "most_intervals" || kind === "hilliest"
    || kind === "highest_hr" || kind === "highest_power" || kind === "mmp_power";
}

/** One membership proposition, with the settled filters written into the yes/no boundary. */
function membershipCriteria(query: string, c: IntentClassification): { true: string; false: string } {
  const must: string[] = [];
  if (c.stimulus?.intervals) must.push("an interval workout, including fartlek or speed play");
  else if (c.stimulus?.primary) must.push(`primary stimulus ${c.stimulus.primary}`);
  if (c.stimulus && c.stimulus.modifiers.length > 0) must.push(`modifier ${c.stimulus.modifiers.join(" and ")}`);
  if (c.place) must.push(`in ${c.place}`);
  if (c.weekday) must.push(`on ${c.weekday}`);
  if (c.dateWindow) must.push(`dated ${c.dateWindow.start} through ${c.dateWindow.end}`);
  if (c.intent && "sport" in c.intent && c.intent.sport) must.push(`${c.intent.sport}s only`);

  const tokens = tokenize(query);
  const raceTokens = tokens.filter((token) => RACE_DISTANCE_TOKENS.has(token));
  const raceNamed = raceTokens.length > 0 && !metricKind(c);
  const best = tokens.includes("best") && !metricKind(c);
  const hilly = tokens.some((token) => token === "hilly" || token === "hill") && c.stimulus?.primary !== "hills";

  const yes = ["This activity matches the query under how_to_judge."];
  const no = ["A required part of the query does not fit this activity."];
  if (must.length > 0) {
    yes.push(`It satisfies: ${must.join("; ")}.`);
    no.push(`It misses: ${must.join("; ")}.`);
  }
  if (raceNamed) {
    yes.push("A race-labeled activity whose name is that race, or a race at that distance, is a yes.");
    no.push("A training run, commute, or quality session that only shares the city or a nearby distance is not the race.");
  }
  if (best) {
    yes.push("Best means a standout effort: a race, a notably fast run, or a memorable long run. The newest easy run is not automatically best.");
    no.push("An ordinary recent easy or quality run is not a standout.");
  }
  if (hilly) {
    yes.push("Hilly means substantial climbing for that sport.");
    no.push("A flat activity is not hilly.");
  }
  return { true: yes.join(" "), false: no.join(" ") };
}

function companionQuestions(activity: Activity, c: IntentClassification): Record<string, JevNoul> {
  const questions: Record<string, JevNoul> = {};
  const key = `a${activity.id}`;
  if (c.stimulus) {
    const label = stimulusSummary(c.stimulus) || "the settled stimulus";
    questions[`${key}s`] = {
      type: "noul",
      instructions: `Does activities.${key} fit the settled stimulus (${label})? Ignore every other activity.`,
      criteria: {
        true: `The activity's stimulus, cluster, or modifiers agree with ${label}.`,
        false: "The activity is a different kind of session.",
      },
    };
  }
  if (c.place) {
    questions[`${key}p`] = {
      type: "noul",
      instructions: `Does activities.${key} take place in ${c.place}? Ignore every other activity.`,
      criteria: {
        true: "The place field or the activity name matches that place.",
        false: "The activity is somewhere else.",
      },
    };
  }
  return questions;
}

/** One shared state. Intent facets, membership, and optional companion nouls run in parallel. */
export function buildJevRequest(query: string, activities: Activity[], now?: Date, settled?: unknown): {
  state: {
    search_query: string;
    vocab: typeof STIMULUS_VOCAB;
    interpreted_query: string;
    how_to_judge: string;
    activities: Record<string, ActivityFacts>;
  };
  questions: Record<string, JevNoul>;
} {
  const interpreted = resolveInterpretation(query, settled, now);
  const criteria = membershipCriteria(query, interpreted);
  const packed: Record<string, ActivityFacts> = {};
  const questions: Record<string, JevNoul> = { ...intentFacetQuestions(now) };
  for (const activity of activities) {
    const key = `a${activity.id}`;
    packed[key] = activityFacts(activity, now);
    questions[key] = {
      type: "noul",
      instructions: `Does activities.${key} match interpreted_query? Apply how_to_judge. Ignore every other activity. Ignore the intent facet questions.`,
      criteria,
    };
    Object.assign(questions, companionQuestions(activity, interpreted));
  }
  return {
    state: {
      search_query: query,
      vocab: STIMULUS_VOCAB,
      interpreted_query: describeIntent(interpreted),
      how_to_judge: HOW_TO_JUDGE,
      activities: packed,
    },
    questions,
  };
}

export function describeActivity(a: Activity, now?: Date): string {
  const km = a.distance_m / 1000;
  const date = a.start_date_local.slice(0, 10);
  const year = date.slice(0, 4);
  const parts = [
    `"${a.name}"`,
    sportLabel(a.sport_type),
    date,
    weekdayName(a),
    /^\d{4}$/.test(year) ? `year ${year}` : "",
    daysAgoLabel(date, now),
    km > 0 ? `${km.toFixed(1)} km` : "",
    formatDuration(a.moving_time_s),
    runPaceParts(a)?.text ?? "",
    a.elevation_gain_m > 0 ? `${a.elevation_gain_m} m climbing` : "",
    ...(WORKOUT_TAGS[a.workout_type ?? -1]?.slice(0, 1) ?? []),
    a.trainer ? "indoor" : "",
  ];
  // v2 enrichment for Jev
  if (a.primary_stimulus) parts.push(a.primary_stimulus);
  if (a.stimulus_cluster) parts.push(a.stimulus_cluster);
  if (a.low_confidence || a.primary_stimulus === "low_confidence") parts.push("low confidence");
  if (a.modifiers && a.modifiers.length > 0) {
    parts.push(a.modifiers.slice(0, 3).join(", "));
  }
  if (a.place) parts.push(a.place);
  if (a.has_intervals) {
    const intervalDesc = a.hard_lap_count 
      ? `${a.hard_lap_count} hard laps`
      : "intervals";
    parts.push(intervalDesc);
  }
  // v3 enrichment for Jev
  if (a.average_heartrate) {
    const hrDesc = a.max_heartrate 
      ? `${Math.round(a.average_heartrate)} bpm avg (max ${Math.round(a.max_heartrate)})`
      : `${Math.round(a.average_heartrate)} bpm avg`;
    parts.push(hrDesc);
  }
  if (a.average_watts || a.weighted_average_watts) {
    const watts = Math.round(a.weighted_average_watts ?? a.average_watts ?? 0);
    const powerDesc = a.weighted_average_watts 
      ? `${watts}W weighted avg`
      : `${watts}W avg`;
    parts.push(powerDesc);
  }
  // MMP data (show best 20m when present)
  if (a.best_watts_20m) parts.push(`${Math.round(a.best_watts_20m)}W 20min`);
  const notes = rankingDescription(a.description);
  if (notes) parts.push(notes);
  return parts.filter(Boolean).join(", ");
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
