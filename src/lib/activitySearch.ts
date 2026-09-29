import {
  calendarLabel,
  calendarSearchTags,
  holidayOf,
  isSeasonTag,
  matchesCalendarTag,
  parseCalendarPhrase,
  type CalendarTag,
} from "./calendar.ts";

/**
 * Additive public-export fields. `toActivity` maps the spencer-brain export
 * (`place_enriched`, `race.distance` / `official_distance_m` / `result_time_s`,
 * `with.athlete_count`) onto these. Missing fields stay unset.
 */
export type ActivityRace = {
  event_name?: string;
  /** Band code from the export: "5k", "10k", "hm", "m", or a longer label. */
  distance?: string;
  /** Official race distance in metres. */
  official_distance_m?: number;
  /** Official result time in seconds. */
  result_time_s?: number;
  is_pr?: boolean;
};

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
  /**
   * GPS-derived place names. No coordinates.
   * When city or country is set, place matching uses these instead of the activity name
   * and the legacy `place` string (which may be a name guess).
   */
  place_city?: string;
  place_region?: string;
  place_country?: string;
  race?: ActivityRace;
  /** e.g. "8×400m". Keyword search only; it does not change a locked metric sort. */
  workout_structure?: string;
  /** Gear name, e.g. "Nike Vaporfly". */
  gear?: string;
  /** Companion names, when the export sends them. Brain's `with` is a count, mapped to `athlete_count`. */
  with?: string[];
  /** From `with.athlete_count` or a top-level `athlete_count`. */
  athlete_count?: number;
  /** Offline Jev Score, 0 (routine) to 3 (standout). From src/activity-grades.json; see scripts/grade-activities.mjs. */
  standout?: number;
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
    // Past any GPS-long marathon.
    if (km >= 45) tags.push("ultra", "ultramarathon");
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
  if (a.place && !hasStructuredPlace(a)) tags.push(...tokenize(a.place));
  if (a.has_intervals) tags.push("intervals", "reps", "repeats");
  tags.push(...calendarSearchTags(a.start_date_local));
  if (a.place_city) tags.push(...tokenize(a.place_city));
  if (a.place_region) tags.push(...tokenize(a.place_region));
  if (a.place_country) tags.push(...tokenize(a.place_country));
  if (a.race?.event_name) tags.push(...tokenize(a.race.event_name));
  tags.push(...raceBandTags(a.race?.distance));
  if (a.race?.is_pr) tags.push("pr", "prs", "pb", "pbs");
  if (a.workout_structure) tags.push(...workoutStructureTags(a.workout_structure));
  if (a.gear) tags.push(...tokenize(a.gear));
  if (a.with) {
    for (const name of a.with) tags.push(...tokenize(name));
  }
  if ((a.athlete_count ?? 0) > 1) tags.push("group");
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

/** "hm" and "m" are band codes, not the letters themselves. "m" must not become a keyword. */
function raceDistanceLabel(distance: string | undefined): string {
  if (!distance) return "";
  const code = distance.toLowerCase();
  if (code === "hm") return "half marathon";
  if (code === "m") return "marathon";
  return distance;
}

function raceBandTags(distance: string | undefined): string[] {
  if (!distance) return [];
  const code = distance.toLowerCase();
  if (code === "5k" || code === "10k") return [code];
  if (code === "hm") return ["hm", "half", "marathon"];
  if (code === "m") return ["marathon"];
  return tokenize(distance);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/×/g, "x")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * "8×400m" matches `8x400` and `400 repeats`. The rep distance and the compact
 * form are both indexed. "repeats" is only added when a structure is present.
 */
function workoutStructureTags(structure: string): string[] {
  const tags = new Set<string>(tokenize(structure));
  const compact = structure.toLowerCase().replace(/×/g, "x").replace(/[^a-z0-9x]/g, "");
  if (compact) tags.add(compact);
  const noUnit = compact.replace(/m/g, "");
  if (noUnit) tags.add(noUnit);
  for (const match of compact.matchAll(/x(\d+)/g)) {
    tags.add(match[1]);
    tags.add(`${match[1]}m`);
  }
  tags.add("repeats");
  tags.add("reps");
  return [...tags];
}

/** "400 repeats" / "8x400" stay on the keyword path. "repeats" alone is still intervals. */
function workoutStructureIndices(tokens: string[]): Set<number> {
  const skip = new Set<number>();
  const repWords = new Set(["repeats", "repeat", "reps", "rep"]);
  for (let i = 0; i < tokens.length; i++) {
    const compact = tokens[i].replace(/×/g, "x").replace(/m$/, "");
    if (/^\d+x\d+$/.test(compact)) skip.add(i);
    if (/^\d+m?$/.test(tokens[i]) && repWords.has(tokens[i + 1] ?? "")) {
      skip.add(i);
      skip.add(i + 1);
    }
    if (repWords.has(tokens[i]) && /^\d+m?$/.test(tokens[i + 1] ?? "")) {
      skip.add(i);
      skip.add(i + 1);
    }
    if (/^\d+$/.test(tokens[i]) && tokens[i + 1] === "x" && /^\d+m?$/.test(tokens[i + 2] ?? "")) {
      skip.add(i);
      skip.add(i + 1);
      skip.add(i + 2);
    }
  }
  return skip;
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
  sport?: Sport;
} | {
  kind: "place_filter";
  place: string;
  filterType?: "race" | "workout";
  sport?: Sport;
} | {
  kind: "mmp_power";
  field: "best_watts_5s" | "best_watts_1m" | "best_watts_5m" | "best_watts_20m" | "best_watts_60m";
} | {
  kind: "highest_power";
} | {
  kind: "list";
  sport?: Sport;
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
  /** The stimulus came from Jev, not the query's own words: it must not drop name matches. */
  softStimulus?: true;
  /**
   * Holiday or season settled from the query text. The activity date supplies the match.
   * Jev is not asked which day Christmas is.
   */
  calendar: CalendarTag | null;
  remainingTokens: string[];
  isDeterministic: boolean;
};

const SPEED_WORDS = ["fastest", "quickest", "speedy", "fast", "quick", "swift", "rapid"];
// "marathon PR" is the fastest marathon. Without a distance, "PR" stays a name search:
// the races are named PR.
const PR_WORDS = ["pr", "prs", "pb", "pbs"];
const RUN_WORDS = new Set(["run", "runs", "running"]);
const RIDE_WORDS = new Set(["ride", "rides", "bike", "bikes", "cycling"]);
// Sports without their own pool logic. They filter on Strava sport_type.
const OTHER_SPORT_WORDS: Record<string, Exclude<Sport, "run" | "ride">> = {
  swim: "swim",
  swims: "swim",
  swimming: "swim",
  ski: "ski",
  skis: "ski",
  skiing: "ski",
  hike: "hike",
  hikes: "hike",
  hiking: "hike",
  walk: "walk",
  walks: "walk",
  walking: "walk",
};
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
  ...Object.keys(OTHER_SPORT_WORDS),
  ...LIST_SYNONYMS,
  ...SPEED_WORDS,
  ...STIMULUS_PLACE_WORDS,
  "longest",
  "farthest",
  "race",
  "races",
]);
// Query aliases. Activity places are canonical city names ("Chicago"), so the
// shortlist has to fold these before filtering. queryOnly phrases are too short to
// look for in activity names ("La Plagne" is not LA) and need a preposition in the query.
const PLACE_ALIASES: { canonical: string; phrases: string[][]; queryOnly?: string[][] }[] = [
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
  { canonical: "los angeles", phrases: [["los", "angeles"]], queryOnly: [["la"]] },
  { canonical: "new york", phrases: [["new", "york"], ["nyc"]], queryOnly: [["ny"]] },
  { canonical: "washington dc", phrases: [["washington", "dc"]], queryOnly: [["dc"]] },
];
// Unbanded "fastest run" should not be won by a stride or a short shakeout.
const MIN_UNBANDED_FASTEST_M = 3000;

import {
  isBlockedPlaceName,
  type Sport,
  labelConfidence,
  matchesModality,
  matchesPrimary,
  matchesStimulus,
  parseStimulusTokens,
  HARD_MODIFIERS,
  PRIMARY_STIMULI,
  STIMULUS_PLACE_WORDS,
  STIMULUS_VOCAB,
  confidentPick,
  stimulusFromChoice,
  stimulusSummary,
  JEV_INTENT_CONFIDENCE,
  STIMULUS_CHOICE_OPTIONS,
  type FacetPick,
  type PrimaryStimulus,
  type StimulusConstraint,
} from "./stimulus.ts";

function phraseAt(tokens: string[], index: number, phrase: string[]): boolean {
  return phrase.every((word, offset) => tokens[index + offset] === word);
}

function aliasAt(
  tokens: string[],
  index: number,
  includeQueryOnly = true,
): { canonical: string; length: number } | null {
  let best: { canonical: string; length: number } | null = null;
  for (const entry of PLACE_ALIASES) {
    const phrases = includeQueryOnly ? [...entry.phrases, ...(entry.queryOnly ?? [])] : entry.phrases;
    for (const phrase of phrases) {
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
    const hit = aliasAt(tokens, i, false);
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

function hasStructuredPlace(activity: Activity): boolean {
  return Boolean(activity.place_city || activity.place_country);
}

function companionText(activity: Activity): string {
  const names = (activity.with ?? []).map((name) => name.trim()).filter(Boolean);
  if (names.length > 0) {
    const extra = activity.athlete_count && activity.athlete_count > names.length
      ? ` (${activity.athlete_count} athletes)`
      : "";
    return `with ${names.join(", ")}${extra}`;
  }
  if (activity.athlete_count != null && activity.athlete_count > 1) return `${activity.athlete_count} athletes`;
  return "";
}

function occasionLabels(activity: Activity): string[] {
  const labels: string[] = [];
  const holiday = holidayOf(activity.start_date_local);
  if (holiday) labels.push(calendarLabel(holiday));
  const tags = calendarSearchTags(activity.start_date_local);
  const season = tags.find((tag) => isSeasonTag(tag));
  if (season) labels.push(calendarLabel(season));
  return labels;
}

/** City / region / country when the export sent them. Empty when it did not. */
export function structuredPlaceText(activity: Activity): string {
  if (!activity.place_city && !activity.place_region && !activity.place_country) return "";
  return [activity.place_city, activity.place_region, activity.place_country].filter(Boolean).join(", ");
}

function activityMatchesPlace(activity: Activity, place: string): boolean {
  // GPS names win over a title that merely mentions the city.
  if (hasStructuredPlace(activity)) return textHasPlace(structuredPlaceText(activity), place);
  return textHasPlace(`${activity.place ?? ""} ${activity.name}`, place);
}

function sportOfToken(token: string): Sport | undefined {
  if (RUN_WORDS.has(token)) return "run";
  if (RIDE_WORDS.has(token)) return "ride";
  return OTHER_SPORT_WORDS[token];
}

// Run wins over ride ("run and bike" is a run query); both win over the other sports.
function sportRank(sport: Sport): number {
  return sport === "run" ? 2 : sport === "ride" ? 1 : 0;
}

function findSport(
  tokens: string[],
  consumed: Set<number>,
): { sport?: Sport; indices: number[] } {
  const found: { sport: Sport; index: number }[] = [];
  tokens.forEach((token, i) => {
    if (consumed.has(i)) return;
    const sport = sportOfToken(token);
    if (sport) found.push({ sport, index: i });
  });
  if (found.length === 0) return { indices: [] };
  const sport = found.reduce((best, hit) => (sportRank(hit.sport) > sportRank(best.sport) ? hit : best)).sport;
  // Words for a losing sport stay as keywords.
  const indices = found.filter((hit) => hit.sport === sport).map((hit) => hit.index);
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
    let fastestIdx = tokens.findIndex(t => SPEED_WORDS.includes(t));
    if (fastestIdx < 0 && parseDistanceBand(query).band) {
      fastestIdx = tokens.findIndex(t => PR_WORDS.includes(t));
    }
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
  // "400 repeats" / "8x400" are a workout-structure keyword, not an interval hard filter.
  const parsedStimulus = parseStimulusTokens(tokens, new Set([...consumedIndices, ...workoutStructureIndices(tokens)]));
  parsedStimulus.indices.forEach((i) => consumedIndices.add(i));
  let stimulus = parsedStimulus.stimulus;
  if (intent?.kind === "most_intervals") {
    stimulus = { intervals: true, modifiers: stimulus?.modifiers ?? [] };
  }

  // Holidays and seasons settle in code from the activity date. Consumed before place
  // detection so "Christmas races" is not a place named Christmas.
  const parsedCalendar = parseCalendarPhrase(tokens, consumedIndices);
  const calendar = parsedCalendar.tag;
  parsedCalendar.consumedIndices.forEach((i) => consumedIndices.add(i));

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

  // A sport word ("runs", "swim", "skiing") selects that pool once the rest of the query
  // is a date, a place, or a metric. A bare "runs" stays a keyword search.
  const sportHit = findSport(tokens, consumedIndices);
  if (sportHit.sport && intent && intent.kind !== "mmp_power" && intent.kind !== "highest_power") {
    if (!intent.sport) intent.sport = sportHit.sport;
    sportHit.indices.forEach((i) => consumedIndices.add(i));
  }

  if (!intent && (dateWindow || place || stimulus || calendar)) {
    const synonyms = listSynonymIndices(tokens, consumedIndices);
    const pending = tokens.filter(
      (_, i) => !consumedIndices.has(i) && !sportHit.indices.includes(i) && !synonyms.includes(i),
    );
    if (pending.length === 0 && (dateWindow || sportHit.sport || stimulus || calendar)) {
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
    const listWord = (token: string) => sportOfToken(token) !== undefined || LIST_SYNONYMS.has(token);
    if (remainingTokens.every(listWord)) {
      const sport = sportFromRemaining(remainingTokens);
      tokens.forEach((token, i) => {
        if (listWord(token)) consumedIndices.add(i);
      });
      remainingTokens = [];
      intent = { kind: "list", sport };
    }
  }
  // Deterministic if we have an intent and no remaining semantic tokens
  const isDeterministic = intent !== null && remainingTokens.length === 0;
  return { intent, dateWindow, distanceBand, place: resolvedPlace, weekday, stimulus, calendar, remainingTokens, isDeterministic };
}

export function classifyIntent(query: string, now?: Date): IntentClassification {
  return detectSuperlativeIntent(query, now);
}

function sportFromRemaining(tokens: string[]): Sport | undefined {
  return findSport(tokens, new Set()).sport;
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
    c.calendar ?? "",
    c.dateWindow ? `${c.dateWindow.start}:${c.dateWindow.end}` : "",
    c.distanceBand?.kind ?? "",
    c.distanceBand?.label ?? "",
    c.stimulus?.intervals ? "intervals" : "",
    c.stimulus?.primary ?? "",
    (c.stimulus?.modifiers ?? []).join("+"),
  ].join("|");
}

/**
 * Intent answers from one packed Jev call. Pick-one facets are Choices with an explicit
 * no-match option; Chicago is a yes/no Noul.
 */
export type IntentFacets = {
  stimulus?: FacetPick;
  superlative?: FacetPick;
  year?: FacetPick;
  distance?: FacetPick;
  sport?: FacetPick;
  place_chicago?: number;
};

const FACET_CHOICE_KEYS = ["stimulus", "superlative", "year", "distance", "sport"] as const;

/** Years the year facet offers. Code owns the window; Jev only names which year. */
function facetYears(now?: Date): number[] {
  const year = chicagoClock(now).getFullYear();
  return Array.from({ length: 7 }, (_, i) => year - 6 + i);
}

function facetYear(pick: FacetPick | undefined): number | null {
  const choice = confidentPick(pick, "none");
  return choice && /^\d{4}$/.test(choice) ? Number(choice) : null;
}

/**
 * Fill gaps in an incomplete parse from parallel Jev answers.
 * A deterministic code parse is already a hard filter: those answers are discarded.
 * has_place and has_date_window carry no value code can apply, so they are discarded too.
 */
export function applyJevIntent(
  base: IntentClassification,
  answers: IntentFacets | undefined,
): IntentClassification {
  const facets: IntentFacets = answers ?? {};
  const blocked = base.place != null && isBlockedPlaceName(base.place);
  // A blocked place is cleared in code, so it must not wait on facets a deterministic query no longer asks.
  if (!blocked && Object.keys(facets).length === 0) return base;
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
    const stimulus = stimulusFromChoice(facets.stimulus);
    if (stimulus) {
      const edited = edit();
      edited.stimulus = stimulus;
      edited.softStimulus = true;
      if (!edited.intent) {
        edited.intent = { kind: "list", sport: sportFromRemaining(edited.remainingTokens) };
      }
    }
  }

  if (!base.intent || base.intent.kind === "list") {
    const superlative = confidentPick(facets.superlative, "none");
    if (superlative === "fastest" || superlative === "longest") {
      const edited = edit();
      const existing = edited.intent && "sport" in edited.intent ? edited.intent.sport : undefined;
      edited.intent = {
        kind: superlative,
        sport: existing ?? sportFromRemaining(edited.remainingTokens),
      };
    }
  }

  if (!base.dateWindow && (next.stimulus || next.intent)) {
    const year = facetYear(facets.year);
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
    const band = confidentPick(facets.distance, "none");
    if (band === "5k" || band === "10k" || band === "half" || band === "marathon") {
      const edited = edit();
      edited.distanceBand = raceBand(band);
      if (edited.distanceBand.runsOnly && edited.intent && "sport" in edited.intent && !edited.intent.sport) {
        edited.intent.sport = "run";
      }
    }
  }

  if (next.stimulus && next.intent && "sport" in next.intent && !next.intent.sport) {
    const pick = confidentPick(facets.sport, "any");
    if (pick === "run" || pick === "ride") {
      const edited = edit();
      if (edited.intent && "sport" in edited.intent) edited.intent.sport = pick;
    }
  }

  return next;
}

/** Parts of a parse a person can remove from the "Read as" row. */
export const INTENT_PART_KEYS = ["sort", "sport", "distance", "stimulus", "place", "weekday", "dates", "words"] as const;
export type IntentPartKey = (typeof INTENT_PART_KEYS)[number];

export function parseRemovedParts(raw: unknown): IntentPartKey[] {
  if (!Array.isArray(raw)) return [];
  return INTENT_PART_KEYS.filter((key) => raw.includes(key));
}

/**
 * The parse with the parts a person removed. Removing the sort keeps the filters as a
 * most-recent list; removing a place from a place filter does the same.
 */
export function withoutParts(c: IntentClassification, removed: readonly IntentPartKey[]): IntentClassification {
  if (removed.length === 0) return c;
  const drop = new Set(removed);
  let intent: SuperlativeIntent = c.intent ? { ...c.intent } : null;
  const sport = intent && "sport" in intent ? intent.sport : undefined;
  if (drop.has("sort") && intent) {
    intent = intent.kind === "place_filter" ? { kind: "place_filter", place: intent.place, sport } : { kind: "list", sport };
  }
  if (drop.has("place") && intent?.kind === "place_filter") intent = { kind: "list", sport: intent.sport };
  if (drop.has("sport") && intent && "sport" in intent) intent = { ...intent, sport: undefined };
  return {
    ...c,
    intent,
    distanceBand: drop.has("distance") || drop.has("sort") ? null : c.distanceBand,
    stimulus: drop.has("stimulus") ? null : c.stimulus,
    place: drop.has("place") ? null : c.place,
    weekday: drop.has("weekday") ? null : c.weekday,
    calendar: drop.has("dates") ? null : c.calendar,
    dateWindow: drop.has("dates") ? null : c.dateWindow,
    remainingTokens: drop.has("words") ? [] : c.remainingTokens,
  };
}

/** applyJevIntent discards every facet for a deterministic parse, so only an open parse asks them. */
export function needsIntentFacets(c: IntentClassification): boolean {
  return !c.isDeterministic;
}

/**
 * Server cache scope for membership. The criteria depend on the interpreted query,
 * and activity facts carry days_ago, so neither the raw query nor a stale day may share an entry.
 */
export function jevCacheScope(
  query: string,
  settled: unknown,
  now?: Date,
  removed: readonly IntentPartKey[] = [],
): { day: string; interpreted: string } {
  return {
    day: formatISODate(chicagoClock(now)),
    interpreted: describeIntent(withoutParts(resolveInterpretation(query, settled, now), removed)),
  };
}

export type SettledIntentPayload = {
  stimulus?: { intervals?: boolean; primary?: string; modifiers?: string[] } | null;
  place?: string | null;
  dateWindow?: { start?: string; end?: string } | null;
  sport?: Sport | null;
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
  sport: Sport | null;
  kind: "fastest" | "longest" | null;
};

function parseSettledPayload(raw: unknown, now?: Date): ParsedGap | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const stimulus = validGapStimulus(body.stimulus);
  const place = validGapPlace(body.place);
  const dateWindow = validGapYear(body.dateWindow, now);
  const sport = typeof body.sport === "string" ? sportOfToken(body.sport) ?? null : null;
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
    edited.softStimulus = true;
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
  if (c.calendar) {
    const label = calendarLabel(c.calendar);
    bits.push(isSeasonTag(c.calendar) ? `in ${label}` : `on ${label}`);
  }
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
  calendar: CalendarTag | null;
  sport?: Sport;
  stimulus: StimulusConstraint | null;
  distanceBand: DistanceBand | null;
  filterType?: "race" | "workout";
  intent: SuperlativeIntent;
  tokens: string[];
};

function intentSport(intent: SuperlativeIntent): Sport | undefined {
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
    calendar: c.calendar,
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
      // "hill sprints" filled as hills must still find the run named Hill Sprints.
      stimulus: c.softStimulus ? null : c.stimulus,
      id: "keyword",
      distanceBand: null,
      intent: null,
      tokens: compactWorkoutQueryTokens(keywordTokens),
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

function matchesSportChoice(activity: Activity, sport: Sport | undefined): boolean {
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
  if (branch.calendar) {
    const tag = branch.calendar;
    candidates = candidates.filter(({ activity }) => matchesCalendarTag(activity.start_date_local, tag));
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

function compactWorkoutQueryTokens(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (/^\d+$/.test(tokens[i]) && tokens[i + 1] === "x" && /^\d+m?$/.test(tokens[i + 2] ?? "")) {
      out.push(`${tokens[i]}x${tokens[i + 2].replace(/m$/, "")}`);
      i += 2;
      continue;
    }
    out.push(tokens[i]);
  }
  return out;
}

/** Keyword-only. Locked metric sorts never call this. */
function metadataBoost(activity: Activity, tokens: string[]): number {
  let boost = 0;
  if (activity.race?.is_pr && tokens.some((token) => PR_WORDS.includes(token))) boost += 3;
  if (activity.gear) {
    const gear = new Set(tokenize(activity.gear));
    if (tokens.some((token) => gear.has(token))) boost += 2;
  }
  if (activity.workout_structure) {
    const structure = new Set(workoutStructureTags(activity.workout_structure));
    if (tokens.some((token) => structure.has(token))) boost += 2;
  }
  if (activity.race?.event_name) {
    const name = new Set(tokenize(activity.race.event_name));
    if (tokens.some((token) => name.has(token) && !RACE_DISTANCE_TOKENS.has(token))) boost += 1;
  }
  return boost;
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
      score: total / tokens.length - 0.2 * labelConfidence(activity) + raceNameBoost(activity, tokens) + metadataBoost(activity, tokens),
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
  const hits = shortlistHits(index, query, limit, classification, false);
  if (hits.length > 0 || !classification.place) return hits;
  // Nothing of this kind carries the place ("skiing in France": ski days have no place,
  // only resort names). Drop it rather than show nothing, and leave every row unlocked:
  // the place stays in the interpreted query for Jev to judge.
  return shortlistHits(index, query, limit, withoutParts(classification, ["place"]), true);
}

function shortlistHits(
  index: IndexedActivity[],
  query: string,
  limit: number,
  classification: IntentClassification,
  openPlace: boolean,
): SearchHit[] {
  const branches = buildShortlistBranches(classification, query);
  const seen = new Set<number>();
  const merged: SearchHit[] = [];
  for (const branch of branches) {
    if (merged.length >= limit) break;
    // A code-settled list stays locked. A list opened by a soft leftover
    // ("fartlek" filled as intervals) stays unlocked so membership can order it.
    const softFill = !classification.isDeterministic && classification.remainingTokens.length > 0;
    const locked = !openPlace && (
      branch.id === "metric"
      || branch.id === "place-longest"
      || (!softFill && branch.id !== "keyword"));
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
 * Membership floor. An unlocked row whose noul is below this is ranked after the rows
 * above it. It is not dropped: an all-weak shortlist should still show, in noul order.
 * Locked rows are not passed through this sort.
 *
 * The rerank cookbook sorts by the noul alone and sets no floor; this value is our own
 * starting point, not a TypeSafe number. Tune it with scripts/eval-jev.mjs on labeled
 * queries (docs.typesafe.ai: validate thresholds on your own data).
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
  grade?: (activity: T["activity"]) => number | undefined,
  floor = MEMBERSHIP_DEMOTE_BELOW,
): T[] {
  const open = hits.filter((hit) => hit.locked === false);
  if (open.length === 0) return hits;
  const locked = hits.filter((hit) => hit.locked !== false);
  const scored = open.filter((hit) => typeof scores[hit.activity.id] === "number");
  const unscored = open.filter((hit) => typeof scores[hit.activity.id] !== "number");
  // A graded row sorts ahead of an ungraded one; two ungraded rows keep their order.
  const compareGrade = (a: T, b: T) => {
    if (!grade) return 0;
    const left = grade(a.activity);
    const right = grade(b.activity);
    if (left === undefined || right === undefined) return (left === undefined ? 1 : 0) - (right === undefined ? 1 : 0);
    return right - left;
  };
  const tie = (id: number) => {
    const extra = companions?.[id];
    if (!extra) return 0;
    return (extra.stimulus ?? 0) + (extra.place ?? 0);
  };
  scored.sort((a, b) => {
    const left = scores[a.activity.id];
    const right = scores[b.activity.id];
    const demoteLeft = left < floor ? 1 : 0;
    const demoteRight = right < floor ? 1 : 0;
    if (demoteLeft !== demoteRight) return demoteLeft - demoteRight;
    // The noul gates; a graded dimension (standout, climbing) orders what passes.
    const byGrade = compareGrade(a, b);
    if (byGrade !== 0) return byGrade;
    if (right !== left) return right - left;
    return tie(b.activity.id) - tie(a.activity.id);
  });
  if (grade) unscored.sort(compareGrade);
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

export type ClimbingLabel = "flat" | "rolling" | "hilly" | "mountainous";

/** Metres climbed per kilometre. Code owns this number; Jev only ever sees the named bucket. */
export function climbPerKm(a: Activity): number | undefined {
  if (a.distance_m <= 0) return undefined;
  return a.elevation_gain_m / (a.distance_m / 1000);
}

// Rides spread the same climbing over more distance, so their buckets are tighter.
const CLIMB_BUCKETS: Record<"run" | "ride", [number, number, number]> = {
  run: [5, 12, 25],
  ride: [4, 8, 15],
};

export function climbingLabel(a: Activity): ClimbingLabel | undefined {
  const rate = climbPerKm(a);
  if (rate === undefined || a.trainer) return undefined;
  const [rolling, hilly, mountainous] = CLIMB_BUCKETS[isRide(a) ? "ride" : "run"];
  if (rate >= mountainous) return "mountainous";
  if (rate >= hilly) return "hilly";
  if (rate >= rolling) return "rolling";
  return "flat";
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
  climbing?: ClimbingLabel;
  workout?: string;
  indoor?: true;
  stimulus?: string;
  stimulus_cluster?: string;
  modality?: string;
  low_confidence?: true;
  modifiers?: string[];
  place?: string;
  place_city?: string;
  place_region?: string;
  place_country?: string;
  intervals?: string;
  heart_rate?: string;
  power?: string;
  best_20min_watts?: number;
  description?: string;
  race_name?: string;
  race_distance?: string;
  official_distance_m?: number;
  race_time?: string;
  race_pr?: true;
  workout_structure?: string;
  gear?: string;
  with?: string[];
  athlete_count?: number;
  /** Holiday and season settled from the date, e.g. "Christmas", "winter". */
  occasions?: string[];
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
  const climbing = climbingLabel(a);
  if (climbing) facts.climbing = climbing;
  const workout = WORKOUT_TAGS[a.workout_type ?? -1]?.[0];
  if (workout) facts.workout = workout;
  if (a.trainer) facts.indoor = true;
  if (a.primary_stimulus) facts.stimulus = a.primary_stimulus;
  if (a.stimulus_cluster) facts.stimulus_cluster = a.stimulus_cluster;
  if (a.modality) facts.modality = a.modality;
  if (a.low_confidence || a.primary_stimulus === "low_confidence") facts.low_confidence = true;
  if (a.modifiers && a.modifiers.length > 0) facts.modifiers = a.modifiers.slice(0, 3);
  const where = structuredPlaceText(a);
  if (hasStructuredPlace(a) && where) facts.place = where;
  else if (a.place) facts.place = a.place;
  else if (where) facts.place = where;
  if (a.place_city) facts.place_city = a.place_city;
  if (a.place_region) facts.place_region = a.place_region;
  if (a.place_country) facts.place_country = a.place_country;
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
  if (a.race?.event_name) facts.race_name = a.race.event_name;
  const raceDistance = raceDistanceLabel(a.race?.distance);
  if (raceDistance) facts.race_distance = raceDistance;
  if (a.race?.official_distance_m != null) facts.official_distance_m = a.race.official_distance_m;
  if (a.race?.result_time_s != null) facts.race_time = formatDuration(Math.round(a.race.result_time_s));
  if (a.race?.is_pr) facts.race_pr = true;
  if (a.workout_structure) facts.workout_structure = a.workout_structure;
  if (a.gear) facts.gear = a.gear;
  if (a.with && a.with.length > 0) facts.with = a.with.slice(0, 4);
  if (a.athlete_count != null && a.athlete_count > 0) facts.athlete_count = a.athlete_count;
  const occasions = occasionLabels(a);
  if (occasions.length > 0) facts.occasions = occasions;
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
  "Sport, place, weekday, and dates must fit the interpreted query. The dates in interpreted_query are the window; do not substitute a different month. Last week is the previous Monday–Sunday. Holiday and season words are already settled from the activity date: do not invent a different holiday. Speedy, fast, and quick mean a fast pace: trust a fast pace label, or a run around 7:30/mi or quicker. An easy pace is not speedy. Fastest matches a genuinely quick effort. Longest matches a long effort, well over 20 km for a run. When place_city or place_country is set, that structured place is the location. Otherwise a city counts when the place or the name matches that city. A list or date-window query matches every activity of the right sport inside that window. A race is marked race, or has a race record, not merely mentioned. Stimulus words are label filters already applied before this score. low_confidence is a caveat, not by itself a mismatch.";

function facetNoul(instructions: string, yes: string, no: string): JevNoul {
  return { type: "noul", instructions, criteria: { true: yes, false: no } };
}

type JevChoice = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string | null>;
};

type JevQuestion = JevNoul | JevChoice;

// Speculative intent questions. They share state with the membership noul and cannot
// see each other. Pick-one facets are Choices with a no-match option, so Jev compares
// the options instead of answering each yes/no alone. Code discards what it does not use.
function intentFacetQuestions(now?: Date): Record<string, JevQuestion> {
  const years: Record<string, string | null> = {};
  for (const year of facetYears(now)) years[String(year)] = null;
  years.none = "The query does not name a calendar year.";
  return {
    stimulus: {
      type: "choice",
      instructions:
        "Using only search_query and vocab, which kind of workout does the user ask for? Do not invent a new primary_stimulus. Interval is a workout kind, never a place.",
      criteria: { ...STIMULUS_CHOICE_OPTIONS },
    },
    superlative: {
      type: "choice",
      instructions: "Using only search_query and vocab, does the user ask for the single fastest or the single longest activity?",
      criteria: {
        fastest: "The fastest pace or the shortest time.",
        longest: "The longest distance.",
        none: "Neither. The query does not ask for a fastest or longest activity.",
      },
    },
    year: {
      type: "choice",
      instructions: "Using only search_query, which calendar year does the user restrict to?",
      criteria: years,
    },
    distance: {
      type: "choice",
      instructions: "Using only search_query, which race distance does the user ask for?",
      criteria: {
        "5k": "5 kilometres.",
        "10k": "10 kilometres.",
        half: "Half marathon.",
        marathon: "Marathon.",
        none: "The query does not name a race distance.",
      },
    },
    sport: {
      type: "choice",
      instructions: "Using only search_query and vocab, which sport does the user restrict to?",
      criteria: {
        run: "Runs only.",
        ride: "Bike rides only.",
        any: "The query does not restrict the sport.",
      },
    },
    place_chicago: facetNoul(
      "Using only search_query and vocab, the user names Chicago (Chi, Chitown, or Windy City) as the place.",
      "The query asks for this.",
      "The query does not ask for this.",
    ),
  };
}

export type JevAnswerMap = Record<string, { type?: string; noul?: number; choice?: string; confidence?: number }>;

export type JevCompanions = Record<number, { stimulus?: number; place?: number }>;

/** Membership keys are a{id}. a{id}s / a{id}p are companion nouls. Named keys are intent facets. */
export function splitJevAnswers(answers: JevAnswerMap): {
  scores: Record<number, number>;
  facets: IntentFacets;
  companions: JevCompanions;
} {
  const scores: Record<number, number> = {};
  const facets: IntentFacets = {};
  const companions: JevCompanions = {};
  for (const [key, answer] of Object.entries(answers)) {
    if ((FACET_CHOICE_KEYS as readonly string[]).includes(key)) {
      if (typeof answer?.choice === "string" && typeof answer.confidence === "number") {
        facets[key as (typeof FACET_CHOICE_KEYS)[number]] = { choice: answer.choice, confidence: answer.confidence };
      }
      continue;
    }
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
    } else if (key === "place_chicago") facets.place_chicago = answer.noul;
  }
  return { scores, facets, companions };
}

function metricKind(c: IntentClassification): boolean {
  const kind = c.intent?.kind;
  return kind === "fastest" || kind === "longest" || kind === "most_intervals" || kind === "hilliest"
    || kind === "highest_hr" || kind === "highest_power" || kind === "mmp_power";
}

/**
 * One membership proposition, with the settled filters written into the yes/no boundary.
 * When every activity carries an offline standout Score, "best" is ordered by that Score
 * and the noul only judges fit, so the standout wording is left out.
 */
function membershipCriteria(
  query: string,
  c: IntentClassification,
  standoutGraded = false,
): { true: string; false: string } {
  const must: string[] = [];
  // A stimulus Jev filled in is a guess at the words, not the person's own label.
  const stimulusParts: string[] = [];
  if (c.stimulus?.intervals) stimulusParts.push("an interval workout, including fartlek or speed play");
  else if (c.stimulus?.primary) stimulusParts.push(`primary stimulus ${c.stimulus.primary}`);
  if (c.stimulus && c.stimulus.modifiers.length > 0) stimulusParts.push(`modifier ${c.stimulus.modifiers.join(" and ")}`);
  if (!c.softStimulus) must.push(...stimulusParts);
  if (c.place) must.push(`in ${c.place}`);
  if (c.weekday) must.push(`on ${c.weekday}`);
  if (c.calendar) {
    const label = calendarLabel(c.calendar);
    must.push(isSeasonTag(c.calendar) ? `in ${label}` : `on ${label}`);
  }
  if (c.dateWindow) must.push(`dated ${c.dateWindow.start} through ${c.dateWindow.end}`);
  if (c.intent && "sport" in c.intent && c.intent.sport) must.push(`${c.intent.sport}s only`);

  const tokens = tokenize(query);
  const raceTokens = tokens.filter((token) => RACE_DISTANCE_TOKENS.has(token));
  const raceNamed = raceTokens.length > 0 && !metricKind(c);
  const best = tokens.includes("best") && !metricKind(c) && !standoutGraded;
  const hilly = tokens.some((token) => token === "hilly" || token === "hill") && c.stimulus?.primary !== "hills";

  const yes = ["This activity matches the query under how_to_judge."];
  const no = ["A required part of the query does not fit this activity."];
  if (must.length > 0) {
    yes.push(`It satisfies: ${must.join("; ")}.`);
    no.push(`It misses: ${must.join("; ")}.`);
  }
  if (c.softStimulus && stimulusParts.length > 0) {
    yes.push(`${stimulusParts.join(" with ")} fits, and so does an activity whose name is what the query asks for, whatever its stimulus label.`);
  }
  if (raceNamed) {
    yes.push("A race-labeled activity, or one with a race record, whose name is that race, or a race at that distance, is a yes.");
    no.push("A training run, commute, or quality session that only shares the city or a nearby distance is not the race.");
  }
  if (best) {
    yes.push("Best means a standout effort: a race, a notably fast run, or a memorable long run. The newest easy run is not automatically best.");
    no.push("An ordinary recent easy or quality run is not a standout.");
  }
  if (hilly) {
    yes.push("Hilly means the climbing field is hilly or mountainous.");
    no.push("A flat or rolling activity is not hilly.");
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
        true: "The place field or the activity name matches that place. When place_city or place_country is set, those names are the place.",
        false: "The activity is somewhere else.",
      },
    };
  }
  return questions;
}

/**
 * One shared state. Intent facets, membership, and optional companion nouls run in parallel.
 * Facets are left out when code already settled the parse or the caller has them cached.
 */
export function buildJevRequest(
  query: string,
  activities: Activity[],
  now?: Date,
  settled?: unknown,
  options: { includeFacets?: boolean; removed?: readonly IntentPartKey[] } = {},
): {
  state: {
    search_query: string;
    vocab: typeof STIMULUS_VOCAB;
    interpreted_query: string;
    how_to_judge: string;
    activities: Record<string, ActivityFacts>;
  };
  questions: Record<string, JevQuestion>;
} {
  const base = classifyIntent(query, now);
  const interpreted = withoutParts(resolveInterpretation(query, settled, now), options.removed ?? []);
  const standoutGraded = activities.length > 0 && activities.every((activity) => activity.standout !== undefined);
  const criteria = membershipCriteria(query, interpreted, standoutGraded);
  const includeFacets = options.includeFacets ?? needsIntentFacets(base);
  // Code-parsed stimulus and place are hard filters, so every shortlisted activity already fits them.
  // Companions only earn their questions for a value Jev filled in.
  const filled: IntentClassification = {
    ...interpreted,
    stimulus: base.stimulus ? null : interpreted.stimulus,
    place: base.place ? null : interpreted.place,
  };
  const packed: Record<string, ActivityFacts> = {};
  const questions: Record<string, JevQuestion> = includeFacets ? { ...intentFacetQuestions(now) } : {};
  for (const activity of activities) {
    const key = `a${activity.id}`;
    packed[key] = activityFacts(activity, now);
    questions[key] = {
      type: "noul",
      instructions: `Does activities.${key} match interpreted_query? Apply how_to_judge. Ignore every other activity. Ignore the intent facet questions.`,
      criteria,
    };
    Object.assign(questions, companionQuestions(activity, filled));
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
  const where = structuredPlaceText(a);
  if (hasStructuredPlace(a) && where) parts.push(where);
  else if (a.place) parts.push(a.place);
  else if (where) parts.push(where);
  if (a.race?.event_name) parts.push(`race ${a.race.event_name}`);
  const raceDistance = raceDistanceLabel(a.race?.distance);
  if (raceDistance) parts.push(raceDistance);
  if (a.race?.result_time_s != null) parts.push(formatDuration(Math.round(a.race.result_time_s)));
  if (a.race?.is_pr) parts.push("PR");
  if (a.workout_structure) parts.push(a.workout_structure);
  if (a.gear) parts.push(`gear ${a.gear}`);
  const companions = companionText(a);
  if (companions) parts.push(companions);
  const occasions = occasionLabels(a);
  if (occasions.length > 0) parts.push(occasions.join(", "));
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

export type RankGrade = {
  /** Shown in the status line: "by standout", "by climbing". */
  label: string;
  value: (activity: Activity) => number | undefined;
};

/**
 * A graded dimension for an unlocked list, when the query asks for a degree rather than a
 * yes/no: "best" orders by the offline standout Score, "hilly" by climbing per km in code.
 */
export function rankGradeFor(
  query: string,
  c: IntentClassification | null,
  standoutGraded: boolean,
): RankGrade | null {
  if (!c || metricKind(c)) return null;
  const tokens = tokenize(query);
  // Until scripts/grade-activities.mjs has run, "best" stays with the membership noul.
  if (tokens.includes("best")) return standoutGraded ? { label: "standout", value: (activity) => activity.standout } : null;
  if (tokens.some((token) => token === "hilly" || token === "hill") && c.stimulus?.primary !== "hills") {
    return { label: "climbing", value: climbPerKm };
  }
  return null;
}

export type ActivityGrades = {
  /** Model that produced the grades. A new model regrades everything. */
  model: string | null;
  grades: Record<string, { standout: number }>;
};

/** Attach offline grades to the snapshot. Activities without a grade are left as they are. */
export function withGrades(activities: Activity[], file: ActivityGrades): Activity[] {
  return activities.map((activity) => {
    const grade = file.grades[String(activity.id)];
    return grade ? { ...activity, standout: grade.standout } : activity;
  });
}

// Levels describe a single session so each one can be judged on its own, one activity
// per request. Whether it was a personal best is a comparison, so it is left out.
export const STANDOUT_LEVELS = [
  "Routine: an easy, recovery, commute, or ordinary training session.",
  "Solid: a workout or long run that looks like planned training.",
  "Notable: a hard workout, a key long run, or a tune-up race.",
  "Standout: a goal race or a milestone effort the athlete would want to find again.",
];

type JevScore = { type: "score"; instructions: string; criteria: string[] };

/** One offline Score request for one activity. Query-independent, so it is asked once and stored. */
export function buildGradeRequest(a: Activity): { state: { activity: ActivityFacts }; questions: { standout: JevScore } } {
  const { days_ago: _daysAgo, ...facts } = activityFacts(a);
  return {
    state: { activity: facts },
    questions: {
      standout: {
        type: "score",
        instructions: "As a single session, how much does `activity` stand out in this athlete's training?",
        criteria: STANDOUT_LEVELS,
      },
    },
  };
}

export function readStandout(answers: Record<string, { type?: string; score?: number }> | undefined): number | null {
  const score = answers?.standout?.score;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
