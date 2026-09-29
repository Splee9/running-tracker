// Plain-language view of an Activity Lookup search: what the query was read as,
// how the list is ordered, and totals for the matches. No ranking logic lives here.

import { isRun, type Activity, type IntentClassification, type SearchHit, type ShortlistBranchId } from "./activitySearch.ts";
import { stimulusSummary } from "./stimulus.ts";

export type InterpretationPart = {
  key: "sort" | "sport" | "distance" | "stimulus" | "place" | "weekday" | "dates" | "words";
  label: string;
  value: string;
  /** True when Jev filled this in; code did not parse it from the query. */
  fromJev: boolean;
};

export type JevView = {
  /** False once the function reports Jev is not configured. */
  available: boolean;
  scored: boolean;
  pending: boolean;
  error: boolean;
};

const MMP_LABELS: Record<string, string> = {
  best_watts_5s: "5s",
  best_watts_1m: "1min",
  best_watts_5m: "5min",
  best_watts_20m: "20min",
  best_watts_60m: "60min",
};

const SORT_NAMES: Record<string, string> = {
  longest: "Longest",
  fastest: "Fastest",
  most_intervals: "Most intervals",
  hilliest: "Hilliest",
  highest_hr: "Highest heart rate",
  highest_power: "Highest power",
};

const METRIC_KINDS = new Set(["fastest", "longest", "most_intervals", "hilliest", "highest_hr", "highest_power", "mmp_power"]);

function capitalize(word: string): string {
  return word.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatWindow(start: string, end: string): string {
  const startYear = start.slice(0, 4);
  const endYear = end.slice(0, 4);
  if (start.endsWith("-01-01") && end === `${startYear}-12-31`) return startYear;
  if (startYear === endYear) return `${shortDate(start)} – ${shortDate(end)}, ${startYear}`;
  return `${shortDate(start)}, ${startYear} – ${shortDate(end)}, ${endYear}`;
}

function partValues(c: IntentClassification): Map<InterpretationPart["key"], { label: string; value: string }> {
  const values = new Map<InterpretationPart["key"], { label: string; value: string }>();
  const intent = c.intent;
  if (intent?.kind === "mmp_power") {
    values.set("sort", { label: "Sort", value: `Best ${MMP_LABELS[intent.field]} power` });
  } else if (intent && SORT_NAMES[intent.kind]) {
    values.set("sort", { label: "Sort", value: SORT_NAMES[intent.kind] });
  }
  if (intent?.kind === "place_filter" && intent.filterType) {
    values.set("sort", { label: "Type", value: `${capitalize(intent.filterType)}s` });
  }
  if (intent && "sport" in intent && intent.sport) {
    values.set("sport", { label: "Sport", value: intent.sport === "run" ? "Runs" : "Rides" });
  }
  if (c.distanceBand) values.set("distance", { label: "Distance", value: c.distanceBand.label });
  const stimulus = stimulusSummary(c.stimulus);
  if (stimulus) values.set("stimulus", { label: "Workout", value: stimulus });
  if (c.place) values.set("place", { label: "Place", value: capitalize(c.place) });
  if (c.weekday) values.set("weekday", { label: "Day", value: `${capitalize(c.weekday)}s` });
  if (c.dateWindow) values.set("dates", { label: "Dates", value: formatWindow(c.dateWindow.start, c.dateWindow.end) });
  if (c.remainingTokens.length > 0) values.set("words", { label: "Words", value: c.remainingTokens.join(" ") });
  return values;
}

/**
 * What the search was read as, in display order. `code` is the parse before Jev filled any gaps;
 * a part that differs from it is marked fromJev. Words Jev resolved drop out of `words`.
 */
export function interpretationParts(c: IntentClassification, code: IntentClassification | null): InterpretationPart[] {
  const before = code ? partValues(code) : null;
  const parts: InterpretationPart[] = [];
  for (const [key, { label, value }] of partValues(c)) {
    parts.push({ key, label, value, fromJev: before ? before.get(key)?.value !== value : false });
  }
  return parts;
}

function sortPhrase(c: IntentClassification): string | null {
  const intent = c.intent;
  if (!intent) return null;
  switch (intent.kind) {
    case "longest":
      return "by distance";
    case "fastest":
      return c.distanceBand ? "by time" : "by pace";
    case "most_intervals":
      return "by interval intensity";
    case "hilliest":
      return "by elevation";
    case "highest_hr":
      return "by heart rate";
    case "highest_power":
      return "by power";
    case "mmp_power":
      return `by ${MMP_LABELS[intent.field]} power`;
    case "list":
    case "place_filter":
      return "most recent first";
  }
}

/** The branch whose rows the query literally asked for. Other branches are the related tail. */
export function primaryBranch(c: IntentClassification): ShortlistBranchId | null {
  const kind = c.intent?.kind;
  if (!kind) return null;
  if (METRIC_KINDS.has(kind)) return "metric";
  if (kind === "list") return c.dateWindow ? "date-list" : "place-list";
  if (kind === "place_filter") return "place-list";
  return null;
}

/** Hits the query literally asked for, or every hit when no branch is primary or it came back empty. */
export function primaryHits(hits: SearchHit[], c: IntentClassification | null): SearchHit[] {
  const branch = c ? primaryBranch(c) : null;
  if (!branch) return hits;
  const primary = hits.filter((hit) => hit.branch === branch);
  return primary.length > 0 ? primary : hits;
}

function countLabel(count: number, noun: "match" | "activity"): string {
  const plural = noun === "match" ? "matches" : "activities";
  return `${count.toLocaleString()} ${count === 1 ? noun : plural}`;
}

export function lookupStatus(
  query: string,
  hits: SearchHit[],
  c: IntentClassification | null,
  jev: JevView,
): string {
  if (!query) return `${countLabel(hits.length, "activity")} · most recent first`;
  if (hits.length === 0) return `No activities match "${query}"`;

  const branch = c ? primaryBranch(c) : null;
  const primaryCount = branch ? hits.filter((hit) => hit.branch === branch).length : 0;
  const related = primaryCount > 0 ? hits.length - primaryCount : 0;
  const unlocked = hits.some((hit) => hit.locked === false);
  const reranked = unlocked && jev.scored;

  const bits: string[] = [];
  if (c?.isDeterministic && branch && primaryCount === 0) {
    bits.push(`No exact matches · ${hits.length.toLocaleString()} related`);
  } else {
    // A list opened by a soft synonym ("fartlek") is unlocked, so Jev owns its order once scored.
    const primaryUnlocked = hits.some((hit) => hit.branch === branch && hit.locked === false);
    const ordered = primaryCount === 0 ? null : primaryUnlocked && jev.scored ? "ranked by Jev" : sortPhrase(c!);
    bits.push(countLabel(primaryCount > 0 ? primaryCount : hits.length, "match"));
    bits.push(ordered ?? (reranked ? "ranked by Jev" : "best match first"));
    if (related > 0) bits.push(`${related.toLocaleString()} related${reranked ? ", ranked by Jev" : ""}`);
  }
  // Jev only changes the order of unlocked rows, so a fully locked list says nothing about it.
  if (unlocked && jev.available && !jev.scored) {
    if (jev.error) bits.push("Jev unavailable");
    else if (jev.pending) bits.push("ranking…");
  }
  return bits.join(" · ");
}

export type ResultTotals = {
  count: number;
  distanceM: number;
  movingS: number;
  /** Seconds per metre across runs, when every counted activity is a run. */
  runPaceSPerM: number | null;
};

export function resultTotals(activities: Activity[]): ResultTotals {
  let distanceM = 0;
  let movingS = 0;
  let allRuns = activities.length > 0;
  for (const a of activities) {
    distanceM += a.distance_m;
    movingS += a.moving_time_s;
    if (!isRun(a)) allRuns = false;
  }
  return {
    count: activities.length,
    distanceM,
    movingS,
    runPaceSPerM: allRuns && distanceM > 0 ? movingS / distanceM : null,
  };
}

export function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h.toLocaleString()}h ${m}m` : `${m}m`;
}
