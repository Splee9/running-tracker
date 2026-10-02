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
  "Classification confidence is how sure the classifier is of the stimulus label in the closed vocab. It is not whether the session was the right work that day.";

export const STIMULUS_OVERRIDE_RULE =
  "Review the label when the export sets low_confidence, or when classification confidence in the primary is below 0.55. This page does not change the label.";

export const STIMULUS_STRICTER_BAR_NOTE =
  "A later career review can use a stricter bar. This panel flags the label at 0.55, or when low_confidence is set.";

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
  why: string;
  /** Published primary classification confidence, when the export sent one. */
  primaryConfidence: number | null;
  bars: ConfidenceBar[];
  lowConfidence: boolean;
  escalate: boolean;
  tone: StimulusDecisionTone;
  scope: string;
  rule: string;
  stricterBar: string;
  status: string;
  reviewBelow: number;
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

function whyText(
  activity: StimulusDecisionActivity,
  primary: string | null,
  cluster: string | null,
  modifiers: string[],
): string {
  const parts: string[] = [];
  if (!primary && !cluster && modifiers.length === 0) {
    return "No stimulus label was published for this activity.";
  }
  if (primary && cluster) {
    const fit = clusterFitsPrimary(primary, cluster);
    const clusterPhrase = humanLabel(cluster);
    if (fit === true) {
      parts.push(`Published as ${humanLabel(primary)}, in the ${clusterPhrase} cluster.`);
    } else if (fit === false) {
      parts.push(
        `Published as ${humanLabel(primary)}, while the cluster is ${clusterPhrase}, which does not sit under that primary.`,
      );
    } else {
      parts.push(`Published as ${humanLabel(primary)}. Cluster is ${clusterPhrase}.`);
    }
  } else if (primary) {
    parts.push(`Published as ${humanLabel(primary)}. No cluster was published.`);
  } else if (cluster) {
    parts.push(`No primary was published. Cluster is ${humanLabel(cluster)}.`);
  }
  if (modifiers.length > 0) {
    parts.push(`Modifiers: ${modifiers.map(humanLabel).join(", ")}.`);
  }
  const runnerUp = activity.runner_up?.trim();
  if (runnerUp) parts.push(`Runner-up on the export: ${humanLabel(runnerUp)}.`);
  if (activity.hard_lap_count != null && activity.hard_lap_count > 0) {
    parts.push(
      `The activity stores ${activity.hard_lap_count} hard lap${activity.hard_lap_count === 1 ? "" : "s"}.`,
    );
  } else if (activity.has_intervals) {
    parts.push("The export sets has_intervals.");
  }
  if (activity.workout_structure) {
    parts.push(`Workout structure on the export: ${activity.workout_structure}.`);
  }
  const raceName = activity.race?.event_name?.trim();
  if (raceName) parts.push(`Race record: ${raceName}.`);
  return parts.join(" ");
}

function statusText(low: boolean, confidence: number | null): string {
  if (low && confidence != null && confidence < STIMULUS_ESCALATE_BELOW) {
    return `Review this label: low_confidence is set, and classification confidence is ${percent(confidence)}, under 0.55.`;
  }
  if (low && confidence != null) {
    return `Review this label: low_confidence is set, even though classification confidence is ${percent(confidence)}.`;
  }
  if (low) return "Review this label: the export set low_confidence.";
  if (confidence != null && confidence < STIMULUS_ESCALATE_BELOW) {
    return `Review this label: classification confidence is ${percent(confidence)}, under 0.55.`;
  }
  if (confidence != null) {
    return `Classification confidence is ${percent(confidence)}, at or above 0.55, and the label is not flagged.`;
  }
  return "Classification confidence unavailable. Cluster and modifiers above are the published label. It is not flagged low_confidence.";
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
  const probabilities = activity.probabilities;
  const bars: ConfidenceBar[] = [];
  if (primaryConfidence != null) {
    bars.push({ label: "Classification confidence", value: primaryConfidence, marked: true });
  }
  if (probabilities && typeof probabilities === "object") {
    const entries = Object.entries(probabilities)
      .filter((entry): entry is [string, number] => publishedUnit(entry[1]) != null)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    for (const [label, value] of entries.slice(0, 8)) {
      bars.push({ label: humanLabel(label), value });
    }
  }
  const escalate = low || (primaryConfidence != null && primaryConfidence < STIMULUS_ESCALATE_BELOW);
  const tone: StimulusDecisionTone = escalate ? "escalate" : primaryConfidence == null ? "unavailable" : "clear";
  const listCore = primary ? humanLabel(primary) : cluster ? humanLabel(cluster) : null;
  return {
    primary,
    cluster,
    modifiers,
    modality,
    primaryText: primary ? humanLabel(primary) : "None published",
    clusterText: cluster ? humanLabel(cluster) : "None published",
    modifierText: modifiers.length > 0 ? modifiers.map(humanLabel).join(", ") : "None published",
    listLabel: listCore ? (escalate ? `${listCore} · review` : listCore) : escalate ? "review" : null,
    why: whyText(activity, primary, cluster, modifiers),
    primaryConfidence,
    bars,
    lowConfidence: low,
    escalate,
    tone,
    scope: STIMULUS_CLASSIFICATION_NOTE,
    rule: STIMULUS_OVERRIDE_RULE,
    stricterBar: STIMULUS_STRICTER_BAR_NOTE,
    status: statusText(low, primaryConfidence),
    reviewBelow: STIMULUS_ESCALATE_BELOW,
  };
}
