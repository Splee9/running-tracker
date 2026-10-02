// Advise-only view of the stimulus decision already stored on a public activity.
// Nothing here classifies a session or writes a new label.

import { clusterFitsPrimary } from "./stimulus.ts";

/**
 * Review the stimulus label when published classification confidence is below this.
 * Vault Layer A bar. Display policy only: the page never rewrites the label.
 * This is not the 0.75 bar used before a Jev search fill, and it is not a fit score.
 */
export const STIMULUS_ESCALATE_BELOW = 0.55;

export const STIMULUS_CLASSIFICATION_NOTE =
  "Classifier confidence on this label — not fit for the day";

const CLUSTER_PHRASE: Record<string, string> = {
  easy_shell: "easy shell",
  quality_intervals: "interval quality",
  quality_tempo: "tempo quality",
  quality_mp: "marathon-pace quality",
  long_aerobic: "long aerobic",
  long_quality: "long quality",
  hills_session: "hills session",
  hills_prime_easy: "hills prime on easy",
  race: "race",
  probe_rtr: "probe or return to run",
  recovery: "recovery",
  other: "other",
};

export type StimulusDecisionActivity = {
  primary_stimulus?: string;
  modifiers?: string[];
  stimulus_cluster?: string;
  modality?: string;
  low_confidence?: boolean;
  /** 0–1 classification confidence for the primary stimulus label. */
  primary_confidence?: number;
  probabilities?: Record<string, number>;
  runner_up?: string;
  hard_lap_count?: number;
  has_intervals?: boolean;
  workout_structure?: string;
  race?: { event_name?: string; distance?: string };
};

export type ConfidenceBar = {
  label: string;
  /** 0–1, as published. */
  value: number;
  /** The primary classification-confidence bar. The 0.55 mark is drawn on this one. */
  marked?: boolean;
};

export type StimulusDecisionTone = "escalate" | "clear" | "unavailable";

/** Hover gloss for the stimulus label. Competing probabilities and classification confidence. */
export type LabelTerm = {
  text: string;
  /** Short why. Not a field name. */
  rationale: string;
  confidence: number | null;
  confidenceLabel: string;
  /** Other published labels, highest first, already phrased. */
  competitors: string[];
};

export type StimulusDecisionView = {
  primary: string | null;
  cluster: string | null;
  modifiers: string[];
  modality: string | null;
  primaryText: string;
  clusterText: string;
  modifierText: string;
  /** Short label for the activity row. Null when nothing was published. */
  listLabel: string | null;
  /** One tight reason per line. */
  reasons: string[];
  /** Published primary classification confidence, when the export sent one. */
  primaryConfidence: number | null;
  /** Hero text: "72%" or "Unavailable". */
  scoreLabel: string;
  bars: ConfidenceBar[];
  lowConfidence: boolean;
  escalate: boolean;
  tone: StimulusDecisionTone;
  /** One-line subtitle. */
  scope: string;
  /** Short status under the score. */
  status: string;
  reviewBelow: number;
  /** The primary stimulus label, when one was published, with its gloss. */
  labelTerm: LabelTerm | null;
};

export function humanLabel(value: string): string {
  return CLUSTER_PHRASE[value] ?? value.replaceAll("_", " ");
}

function publishedUnit(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function whyLines(
  activity: StimulusDecisionActivity,
  primary: string | null,
  cluster: string | null,
): string[] {
  const lines: string[] = [];
  if (!primary && !cluster && !(activity.modifiers && activity.modifiers.length > 0)) {
    return ["No stimulus label published"];
  }
  if (primary && cluster) {
    const fit = clusterFitsPrimary(primary, cluster);
    if (fit === false) lines.push(`${humanLabel(cluster)} does not match ${humanLabel(primary)}`);
  } else if (!cluster && primary) {
    lines.push("No cluster published");
  }
  const runnerUp = activity.runner_up?.trim();
  if (runnerUp) lines.push(`Runner-up ${humanLabel(runnerUp)}`);
  if (activity.hard_lap_count != null && activity.hard_lap_count > 0) {
    lines.push(`${activity.hard_lap_count} hard lap${activity.hard_lap_count === 1 ? "" : "s"}`);
  } else if (activity.has_intervals) {
    lines.push("Intervals flag");
  }
  if (activity.workout_structure) lines.push(activity.workout_structure);
  const raceName = activity.race?.event_name?.trim();
  if (raceName) lines.push(raceName);
  return lines;
}

function statusText(low: boolean, confidence: number | null): string {
  if (low && confidence != null && confidence < STIMULUS_ESCALATE_BELOW) return "Review · low_confidence · under 0.55";
  if (low) return "Review · low_confidence";
  if (confidence != null && confidence < STIMULUS_ESCALATE_BELOW) return "Review · under 0.55";
  if (confidence != null) return "Above 0.55";
  return "Unavailable";
}

/** Read the published stimulus decision. Does not fill in a label the export omitted. */
export function stimulusDecision(activity: StimulusDecisionActivity): StimulusDecisionView {
  const rawPrimary = activity.primary_stimulus?.trim() ?? "";
  const lowFromPrimary = rawPrimary === "low_confidence";
  const primary = rawPrimary && !lowFromPrimary ? rawPrimary : null;
  const cluster = activity.stimulus_cluster?.trim() || null;
  const modifiers = (activity.modifiers ?? []).filter((mod) => typeof mod === "string" && mod.trim());
  const modality = activity.modality?.trim() || null;
  const low = activity.low_confidence === true || lowFromPrimary;
  const primaryConfidence = publishedUnit(activity.primary_confidence);
  const bars: ConfidenceBar[] =
    primaryConfidence == null ? [] : [{ label: "Classification confidence", value: primaryConfidence, marked: true }];
  const escalate = low || (primaryConfidence != null && primaryConfidence < STIMULUS_ESCALATE_BELOW);
  const tone: StimulusDecisionTone = escalate ? "escalate" : primaryConfidence == null ? "unavailable" : "clear";
  const listCore = primary ? humanLabel(primary) : cluster ? humanLabel(cluster) : null;
  const reasons = whyLines(activity, primary, cluster);
  const competitors = Object.entries(activity.probabilities ?? {})
    .filter(([key, value]) => key !== primary && typeof value === "number")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, value]) => `${humanLabel(key)} ${percent(value)}`);
  const labelTerm: LabelTerm | null = primary
    ? {
        text: humanLabel(primary),
        rationale: reasons.filter((line) => line !== "No stimulus label published").join(" · ") || "Published stimulus label.",
        confidence: primaryConfidence,
        confidenceLabel: primaryConfidence == null ? "Unavailable" : percent(primaryConfidence),
        competitors,
      }
    : null;
  return {
    primary,
    cluster,
    modifiers,
    modality,
    primaryText: primary ? humanLabel(primary) : "None published",
    clusterText: cluster ? humanLabel(cluster) : "None published",
    modifierText: modifiers.length > 0 ? modifiers.map(humanLabel).join(", ") : "None published",
    listLabel: listCore ? (escalate ? `${listCore} · review` : listCore) : escalate ? "review" : null,
    reasons,
    primaryConfidence,
    scoreLabel: primaryConfidence == null ? "Unavailable" : percent(primaryConfidence),
    bars,
    lowConfidence: low,
    escalate,
    tone,
    scope: STIMULUS_CLASSIFICATION_NOTE,
    status: statusText(low, primaryConfidence),
    reviewBelow: STIMULUS_ESCALATE_BELOW,
    labelTerm,
  };
}
