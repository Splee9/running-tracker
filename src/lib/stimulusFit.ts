// Advise-only view of the stimulus-fit judgment already stored on a public activity.
// Layer B is Jev2 readiness compared with Jev3 load, summarized as Jev4 stimulus fit.
// Nothing here scores a session, and it never reads Layer A classification confidence.

/**
 * Plain-English scope for the fit line. Distinct from classification confidence:
 * that number is how sure the label is, not whether the work fit the day.
 */
export const STIMULUS_FIT_NOTE =
  "Did the delivered stimulus fit readiness and the plan — not how sure we are of the label.";

export type StimulusFitActivity = {
  /** Jev4 label for how the delivered stimulus sat against readiness and the plan. */
  stimulus_fit?: string;
  /** 0–1 confidence in that fit judgment. Not classification confidence. */
  fit_confidence?: number;
  /** Jev2 macro readiness. */
  macro_readiness?: string;
  /** Optional gate on the readiness judgment. */
  macro_readiness_gate?: string;
  /** Jev3 activity-side load. */
  activity_side_load?: string;
  /** Optional Jev3 variability impact. */
  session_variability_impact?: string;
};

export type StimulusFitView = {
  /** True when the export published at least one Layer B field. */
  published: boolean;
  macroReadiness: string | null;
  macroReadinessGate: string | null;
  activitySideLoad: string | null;
  sessionVariability: string | null;
  stimulusFit: string | null;
  /** Published fit confidence, when the export sent one. Never copied from primary_confidence. */
  fitConfidence: number | null;
  /** "81%" or "Unavailable". */
  scoreLabel: string;
  /**
   * Jev2 vs Jev3 → Jev4. Null when nothing was published, so an older activity
   * does not grow a chain of placeholder numbers.
   */
  comparison: string | null;
  scope: string;
};

function publishedUnit(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function token(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function humanFitToken(value: string): string {
  return value.replaceAll("_", " ");
}

function slot(value: string | null): string {
  return value ? humanFitToken(value) : "unavailable";
}

function variabilityClause(value: string): string {
  const text = humanFitToken(value);
  return text.toLowerCase().includes("variability") ? ` (+ ${text})` : ` (+ ${text} variability)`;
}

function comparisonLine(view: {
  macroReadiness: string | null;
  macroReadinessGate: string | null;
  activitySideLoad: string | null;
  sessionVariability: string | null;
  stimulusFit: string | null;
}): string {
  const gate = view.macroReadinessGate ? ` · gate ${humanFitToken(view.macroReadinessGate)}` : "";
  const variability = view.sessionVariability ? variabilityClause(view.sessionVariability) : "";
  return `Jev2: ${slot(view.macroReadiness)}${gate}  vs  Jev3: ${slot(view.activitySideLoad)}${variability}  →  ${slot(view.stimulusFit)}`;
}

/** Read the published stimulus fit. Does not invent one from the stimulus label or its confidence. */
export function stimulusFit(activity: StimulusFitActivity): StimulusFitView {
  const macroReadiness = token(activity.macro_readiness);
  const macroReadinessGate = token(activity.macro_readiness_gate);
  const activitySideLoad = token(activity.activity_side_load);
  const sessionVariability = token(activity.session_variability_impact);
  const fitLabel = token(activity.stimulus_fit);
  const fitConfidence = publishedUnit(activity.fit_confidence);
  const published =
    macroReadiness != null ||
    macroReadinessGate != null ||
    activitySideLoad != null ||
    sessionVariability != null ||
    fitLabel != null ||
    fitConfidence != null;
  const parts = { macroReadiness, macroReadinessGate, activitySideLoad, sessionVariability, stimulusFit: fitLabel };
  return {
    published,
    ...parts,
    fitConfidence,
    scoreLabel: fitConfidence == null ? "Unavailable" : `${Math.round(fitConfidence * 100)}%`,
    comparison: published ? comparisonLine(parts) : null,
    scope: STIMULUS_FIT_NOTE,
  };
}
