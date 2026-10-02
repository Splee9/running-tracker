// Advise-only view of the stimulus decision already stored on a public activity.
// Nothing here classifies a session or writes a new label.

import { clusterFitsPrimary } from "./stimulus.ts";

/**
 * Escalate to a person when a published confidence is below this.
 * Display policy only: the page never rewrites the label.
 * Same 0.75 bar the lookup already uses before it acts on a confident Jev fill.
 */
export const STIMULUS_ESCALATE_BELOW = 0.75;

export const STIMULUS_OVERRIDE_RULE =
  "A person should override the label when the export sets low_confidence, or when a published confidence is below 0.75. This page does not change the label.";

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
  confidence?: number;
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
  primary?: boolean;
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
  /** Published scalar confidence, when the export sent one. */
  confidence: number | null;
  bars: ConfidenceBar[];
  lowConfidence: boolean;
  escalate: boolean;
  tone: StimulusDecisionTone;
  rule: string;
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

function statusText(
  primary: string | null,
  low: boolean,
  confidence: number | null,
  primaryProbability: number | null,
): string {
  if (low && confidence != null && confidence < STIMULUS_ESCALATE_BELOW) {
    return `This activity should be reviewed: low_confidence is set, and confidence is ${percent(confidence)}, under 0.75.`;
  }
  if (low && confidence != null) {
    return `This activity should be reviewed: low_confidence is set, even though confidence is ${percent(confidence)}.`;
  }
  if (low) return "This activity should be reviewed: the export set low_confidence.";
  if (confidence != null && confidence < STIMULUS_ESCALATE_BELOW) {
    return `This activity should be reviewed: confidence is ${percent(confidence)}, under 0.75.`;
  }
  if (confidence != null) {
    return `This activity is above the review bar: confidence is ${percent(confidence)}, and it is not flagged.`;
  }
  if (primary && primaryProbability != null && primaryProbability < STIMULUS_ESCALATE_BELOW) {
    return `This activity should be reviewed: the published probability for ${humanLabel(primary)} is ${percent(primaryProbability)}, under 0.75.`;
  }
  if (primary && primaryProbability != null) {
    return `This activity is above the review bar on the published probability for ${humanLabel(primary)} (${percent(primaryProbability)}), and it is not flagged.`;
  }
  return "Confidence unavailable. Cluster and modifiers above are the published decision. It is not flagged low_confidence.";
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
  const confidence = publishedUnit(activity.confidence);
  const probabilities = activity.probabilities;
  const bars: ConfidenceBar[] = [];
  if (probabilities && typeof probabilities === "object") {
    const entries = Object.entries(probabilities)
      .filter((entry): entry is [string, number] => publishedUnit(entry[1]) != null)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    for (const [label, value] of entries.slice(0, 8)) {
      bars.push({ label: humanLabel(label), value, primary: label === primary });
    }
  }
  if (bars.length === 0 && confidence != null) {
    bars.push({ label: "Confidence", value: confidence, primary: true });
  }
  const primaryProbability = primary && probabilities ? publishedUnit(probabilities[primary]) : null;
  const escalate =
    low ||
    (confidence != null
      ? confidence < STIMULUS_ESCALATE_BELOW
      : primaryProbability != null && primaryProbability < STIMULUS_ESCALATE_BELOW);
  const tone: StimulusDecisionTone = escalate ? "escalate" : bars.length === 0 ? "unavailable" : "clear";
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
    confidence,
    bars,
    lowConfidence: low,
    escalate,
    tone,
    rule: STIMULUS_OVERRIDE_RULE,
    status: statusText(primary, low, confidence, primaryProbability),
    reviewBelow: STIMULUS_ESCALATE_BELOW,
  };
}
