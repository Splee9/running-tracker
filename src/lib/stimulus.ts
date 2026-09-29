// Hard filters for Activity Lookup. Names and places stay soft.
// primary_stimulus / modifiers / stimulus_cluster are the labels the vault already stores.
// stimulus_cluster and modality are optional: missing fields must not break a query.

export const PRIMARY_STIMULI = ["easy", "quality", "long", "race", "recovery", "probe", "hills"] as const;
export type PrimaryStimulus = (typeof PRIMARY_STIMULI)[number];

export const STIMULUS_CLUSTERS = [
  "easy_shell",
  "quality_intervals",
  "quality_tempo",
  "quality_mp",
  "long_aerobic",
  "long_quality",
  "hills_session",
  "hills_prime_easy",
  "race",
  "probe_rtr",
  "recovery",
  "other",
] as const;
export type StimulusCluster = (typeof STIMULUS_CLUSTERS)[number];

export const HARD_MODIFIERS = [
  "intervals",
  "tempo",
  "marathon_pace",
  "strides",
  "hills_prime",
  "heat",
  "commute",
  "outdoor",
  "indoor",
  "brick",
  "long_duration",
  "return_to_run",
] as const;

/**
 * Words the log does not store as their own stimulus. They map onto an existing
 * predicate. Jev still has to be confident before code applies the fill.
 */
export const STIMULUS_SYNONYMS = {
  fartlek: "intervals",
  "speed play": "intervals",
  speedwork: "intervals",
} as const;

/** Closed vocab sent to Jev with the raw query. Branching stays in code. */
export const STIMULUS_VOCAB = {
  primary_stimulus: [...PRIMARY_STIMULI],
  modifiers: [...HARD_MODIFIERS],
  stimulus_cluster: [...STIMULUS_CLUSTERS],
  modality: ["run", "bike"],
  places: ["chicago"],
  synonyms: { ...STIMULUS_SYNONYMS },
};

/** A Jev facet becomes a hard filter only at or above this. Below it, the answer is discarded. */
export const JEV_INTENT_CONFIDENCE = 0.75;

export type StimulusConstraint = {
  /** Interval workouts: cluster quality_intervals, or quality plus an intervals modifier or ≥2 hard laps. */
  intervals: boolean;
  primary?: PrimaryStimulus;
  /** Each modifier must match. Independent of the interval predicate. */
  modifiers: string[];
};

export type LabeledActivity = {
  primary_stimulus?: string;
  modifiers?: string[];
  stimulus_cluster?: string;
  modality?: string;
  low_confidence?: boolean;
  hard_lap_count?: number;
  has_intervals?: boolean;
  trainer?: boolean;
  sport_type?: string;
  workout_type?: number | null;
};

// Words that must never become a place. "interval workouts" is the case that used to.
export const STIMULUS_PLACE_WORDS = new Set([
  "interval",
  "intervals",
  "reps",
  "repeats",
  "easy",
  "quality",
  "recovery",
  "probe",
  "hills",
  "hill",
  "tempo",
  "strides",
  "heat",
  "commute",
  "outdoor",
  "indoor",
  "brick",
  "long",
  "race",
  "races",
  "workout",
  "workouts",
  "session",
  "sessions",
]);

const CLUSTER_FOR_PRIMARY: Record<PrimaryStimulus, readonly string[]> = {
  easy: ["easy_shell"],
  quality: ["quality_intervals", "quality_tempo", "quality_mp"],
  long: ["long_aerobic", "long_quality"],
  race: ["race"],
  recovery: ["recovery"],
  probe: ["probe_rtr"],
  hills: ["hills_session", "hills_prime_easy"],
};

const MODIFIER_CLUSTER: Record<string, string> = {
  intervals: "quality_intervals",
  tempo: "quality_tempo",
  marathon_pace: "quality_mp",
  hills_prime: "hills_prime_easy",
  return_to_run: "probe_rtr",
};

const PRIMARY_FACET: Record<string, PrimaryStimulus> = {
  is_easy: "easy",
  is_quality: "quality",
  is_long: "long",
  is_race: "race",
  is_recovery: "recovery",
  is_probe: "probe",
  is_hills: "hills",
};

type Accumulator = {
  intervals: boolean;
  primary?: PrimaryStimulus;
  modifiers: string[];
};

function addModifier(acc: Accumulator, mod: string) {
  if (!acc.modifiers.includes(mod)) acc.modifiers.push(mod);
}

function phrase(words: string[], apply: (acc: Accumulator) => void) {
  return { words, apply };
}

const PHRASES = [
  phrase(["return", "to", "run"], (acc) => addModifier(acc, "return_to_run")),
  phrase(["hills", "prime"], (acc) => addModifier(acc, "hills_prime")),
  phrase(["hill", "prime"], (acc) => addModifier(acc, "hills_prime")),
  phrase(["marathon", "pace"], (acc) => addModifier(acc, "marathon_pace")),
  phrase(["long", "duration"], (acc) => addModifier(acc, "long_duration")),
  phrase(["quality", "intervals"], (acc) => { acc.intervals = true; }),
  phrase(["quality", "interval"], (acc) => { acc.intervals = true; }),
  phrase(["interval", "workouts"], (acc) => { acc.intervals = true; }),
  phrase(["interval", "workout"], (acc) => { acc.intervals = true; }),
  phrase(["interval", "sessions"], (acc) => { acc.intervals = true; }),
  phrase(["interval", "session"], (acc) => { acc.intervals = true; }),
].sort((a, b) => b.words.length - a.words.length);

const SINGLE: Record<string, (acc: Accumulator) => void> = {
  interval: (acc) => { acc.intervals = true; },
  intervals: (acc) => { acc.intervals = true; },
  reps: (acc) => { acc.intervals = true; },
  repeats: (acc) => { acc.intervals = true; },
  easy: (acc) => { acc.primary = acc.primary ?? "easy"; },
  quality: (acc) => { acc.primary = acc.primary ?? "quality"; },
  recovery: (acc) => { acc.primary = acc.primary ?? "recovery"; },
  probe: (acc) => { acc.primary = acc.primary ?? "probe"; },
  hills: (acc) => { acc.primary = acc.primary ?? "hills"; },
  tempo: (acc) => addModifier(acc, "tempo"),
  strides: (acc) => addModifier(acc, "strides"),
  heat: (acc) => addModifier(acc, "heat"),
  commute: (acc) => addModifier(acc, "commute"),
  outdoor: (acc) => addModifier(acc, "outdoor"),
  indoor: (acc) => addModifier(acc, "indoor"),
  brick: (acc) => addModifier(acc, "brick"),
  long: (acc) => { acc.primary = acc.primary ?? "long"; },
  race: (acc) => { acc.primary = acc.primary ?? "race"; },
  races: (acc) => { acc.primary = acc.primary ?? "race"; },
};

function freeze(acc: Accumulator): StimulusConstraint | null {
  if (!acc.intervals && !acc.primary && acc.modifiers.length === 0) return null;
  // "interval workouts" is the quality-interval predicate, not primary=easy and not a place.
  if (acc.intervals) return { intervals: true, modifiers: acc.modifiers };
  return { intervals: false, primary: acc.primary, modifiers: acc.modifiers };
}

export function parseStimulusTokens(
  tokens: string[],
  consumed: Set<number>,
): { stimulus: StimulusConstraint | null; indices: number[] } {
  const indices: number[] = [];
  const taken = new Set(consumed);
  const acc: Accumulator = { intervals: false, modifiers: [] };
  for (let i = 0; i < tokens.length; i++) {
    if (taken.has(i)) continue;
    const phrase = PHRASES.find((entry) =>
      entry.words.every((word, offset) => !taken.has(i + offset) && tokens[i + offset] === word),
    );
    if (phrase) {
      phrase.apply(acc);
      phrase.words.forEach((_, offset) => {
        taken.add(i + offset);
        indices.push(i + offset);
      });
      continue;
    }
    const apply = SINGLE[tokens[i]];
    if (!apply) continue;
    apply(acc);
    taken.add(i);
    indices.push(i);
  }
  return { stimulus: freeze(acc), indices };
}

export function isBlockedPlaceName(place: string): boolean {
  const tokens = place.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => STIMULUS_PLACE_WORDS.has(token));
}

/** 1 sinks the activity. It still matches; low_confidence is not a hard exclude. */
export function labelConfidence(activity: { low_confidence?: boolean; primary_stimulus?: string }): number {
  if (activity.low_confidence || activity.primary_stimulus === "low_confidence") return 1;
  return 0;
}

export function matchesModality(activity: LabeledActivity, sport: "run" | "ride"): boolean {
  const modality = activity.modality?.toLowerCase();
  if (modality) {
    if (sport === "run") return modality === "run" || modality === "running";
    return modality === "ride" || modality === "bike" || modality === "cycling";
  }
  const sportType = activity.sport_type ?? "";
  return sport === "run" ? /Run$/.test(sportType) : /Ride$/.test(sportType);
}

/**
 * Interval membership. has_intervals by itself is not enough: an easy run with
 * strides can set that flag. It may boost a candidate that already matched; it
 * never puts one in the pool.
 */
export function matchesIntervalWorkout(activity: LabeledActivity): boolean {
  if (activity.stimulus_cluster === "quality_intervals") return true;
  // A present cluster other than quality_intervals disagrees with the interval label.
  if (activity.stimulus_cluster && activity.stimulus_cluster !== "quality_intervals") return false;
  if (activity.primary_stimulus !== "quality") return false;
  if (activity.modifiers?.includes("intervals")) return true;
  return (activity.hard_lap_count ?? 0) >= 2;
}

export function matchesPrimary(activity: LabeledActivity, primary: PrimaryStimulus): boolean {
  const labeled = activity.primary_stimulus;
  if (labeled && labeled !== "other" && labeled !== "low_confidence") return labeled === primary;
  // other / low_confidence / missing: a cluster can still agree. "other" itself never hard-matches.
  if (
    activity.stimulus_cluster &&
    activity.stimulus_cluster !== "other" &&
    CLUSTER_FOR_PRIMARY[primary].includes(activity.stimulus_cluster)
  ) {
    return true;
  }
  // Older exports marked races with Strava workout_type and had no stimulus label.
  if (primary === "race" && labeled == null && (activity.workout_type === 1 || activity.workout_type === 11)) {
    return true;
  }
  return false;
}

function matchesNamedModifier(activity: LabeledActivity, mod: string): boolean {
  if (activity.modifiers?.includes(mod)) return true;
  const cluster = MODIFIER_CLUSTER[mod];
  if (cluster && activity.stimulus_cluster === cluster) return true;
  if (mod === "indoor" && (activity.trainer || (activity.sport_type ?? "").startsWith("Virtual"))) return true;
  return false;
}

export function matchesStimulus(activity: LabeledActivity, stimulus: StimulusConstraint | null): boolean {
  if (!stimulus) return true;
  if (stimulus.intervals && !matchesIntervalWorkout(activity)) return false;
  if (!stimulus.intervals && stimulus.primary && !matchesPrimary(activity, stimulus.primary)) return false;
  return stimulus.modifiers.every((mod) => matchesNamedModifier(activity, mod));
}

export function stimulusSummary(stimulus: StimulusConstraint | null | undefined): string {
  if (!stimulus) return "";
  if (stimulus.intervals) {
    return stimulus.modifiers.length ? `intervals · ${stimulus.modifiers.join(" · ")}` : "intervals";
  }
  return [stimulus.primary, ...stimulus.modifiers].filter(Boolean).join(" · ");
}

function marginWinner<T>(ranked: { item: T; score: number }[]): T | null {
  if (ranked.length === 0 || ranked[0].score < JEV_INTENT_CONFIDENCE) return null;
  const second = ranked[1]?.score ?? 0;
  if (ranked[0].score - second < 0.1) return null;
  return ranked[0].item;
}

/** Map parallel Jev answers onto a constraint. Low and tied scores are discarded. */
export function stimulusFromFacets(facets: Record<string, number>): StimulusConstraint | null {
  const intervalScore = facets.is_intervals ?? 0;
  const ranked = Object.entries(PRIMARY_FACET)
    .map(([facet, primary]) => ({ primary, score: facets[facet] ?? 0 }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (intervalScore >= JEV_INTENT_CONFIDENCE && intervalScore + 0.1 >= (top?.score ?? 0)) {
    return { intervals: true, modifiers: [] };
  }
  if (top && top.score >= JEV_INTENT_CONFIDENCE && top.score - (ranked[1]?.score ?? 0) >= 0.1) {
    const modifiers: string[] = [];
    if (top.primary === "quality" && (facets.is_tempo ?? 0) >= JEV_INTENT_CONFIDENCE) modifiers.push("tempo");
    if (top.primary === "quality" && (facets.is_marathon_pace ?? 0) >= JEV_INTENT_CONFIDENCE) {
      modifiers.push("marathon_pace");
    }
    return { intervals: false, primary: top.primary, modifiers };
  }
  if ((facets.is_tempo ?? 0) >= JEV_INTENT_CONFIDENCE && (facets.is_tempo ?? 0) - (facets.is_marathon_pace ?? 0) >= 0.1) {
    return { intervals: false, modifiers: ["tempo"] };
  }
  if ((facets.is_marathon_pace ?? 0) >= JEV_INTENT_CONFIDENCE && (facets.is_marathon_pace ?? 0) - (facets.is_tempo ?? 0) >= 0.1) {
    return { intervals: false, modifiers: ["marathon_pace"] };
  }
  return null;
}

export function winningYear(facets: Record<string, number>): number | null {
  const ranked = Object.entries(facets)
    .filter(([key]) => /^year_\d{4}$/.test(key))
    .map(([key, score]) => ({ item: Number(key.slice(5)), score }))
    .sort((a, b) => b.score - a.score);
  return marginWinner(ranked);
}

export function winningDistanceBand(facets: Record<string, number>): "5k" | "10k" | "half" | "marathon" | null {
  const keys = ["5k", "10k", "half", "marathon"] as const;
  const ranked = keys
    .map((item) => ({ item, score: facets[`band_${item}`] ?? 0 }))
    .sort((a, b) => b.score - a.score);
  return marginWinner(ranked);
}
