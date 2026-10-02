// Advise-only view of the stimulus-fit judgment already stored on a public activity.
// The export keeps its field names. This view turns them into one plain sentence.
// Nothing here scores a session, and it never reads classification confidence.

/**
 * Plain-English scope for the fit score. Distinct from classification confidence:
 * that number is how sure the label is, not whether the work fit the day.
 */
export const STIMULUS_FIT_NOTE =
  "Did the delivered stimulus fit readiness and the plan — not how sure we are of the label.";

export type FitRole = "readiness" | "load" | "fit";

export type FitConfidence = {
  /** "Readiness confidence", "Load confidence", "Variability confidence", or "Fit confidence". */
  label: string;
  /** 0–1, as published. */
  value: number;
};

/** One marked phrase inside the fit sentence, plus the tooltip behind it. */
export type FitTerm = {
  role: FitRole;
  /** The words that stand in for X, Y, or Z. */
  text: string;
  /** Short rationale. Not a field name. */
  rationale: string;
  /** Extra lines, such as a variability note on the load phrase. */
  notes: string[];
  /** Piece confidences. Empty when the export did not send one. */
  confidences: FitConfidence[];
};

export type FitClause = {
  /** Words before the marked phrase, including a leading space when needed. */
  lead: string;
  term: FitTerm;
};

export type StimulusFitActivity = {
  /** How the delivered stimulus sat against readiness and the plan. */
  stimulus_fit?: string;
  /** 0–1 confidence in that fit judgment. Not classification confidence. */
  fit_confidence?: number;
  /** Macro readiness. */
  macro_readiness?: string;
  /** 0–1 confidence in macro readiness. Not classification confidence. */
  macro_readiness_confidence?: number;
  /** Optional gate on the readiness judgment. Kept in data; not part of the sentence. */
  macro_readiness_gate?: string;
  /** Activity-side load. */
  activity_side_load?: string;
  /** 0–1 confidence in the load judgment. */
  activity_side_load_confidence?: number;
  /** Optional variability impact. */
  session_variability_impact?: string;
  /** 0–1 confidence in the variability judgment. */
  session_variability_confidence?: number;
  /**
   * How the fit was judged: `plan_backed`, `readiness_only`, or `thin`.
   * Missing means the export did not include one.
   */
  fit_basis?: string;
  /**
   * Basis for the planned intent, when the export sends it separately.
   * Same vocabulary as `fit_basis`.
   */
  intent_basis?: string;
  /**
   * Stimulus label, used only to name the kind of day in "a typical easy day".
   * It does not choose the fit and it is not the fit score.
   */
  primary_stimulus?: string;
};

/** Quiet chip beside the fit sentence. Absent when the export sent no basis. */
export type FitBasisChip = {
  /** Spencer-friendly words: "With plan", "Readiness only", "Little to go on". */
  label: string;
  /** One line for the tooltip. */
  hint: string;
  /** Extra lines, such as an intent basis that differs from the fit basis. */
  notes: string[];
};

export type StimulusFitView = {
  /** True when the export published at least one fit field. */
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
  /** Short verdict for the fit pill: "On target", "Overcooked", "Undercooked". Null when no fit was published. */
  verdictLabel: string | null;
  /** How the fit was judged, when the export sent `fit_basis` or `intent_basis`. */
  basis: FitBasisChip | null;
  /** Marked phrases in sentence order. */
  clauses: FitClause[];
  /**
   * One sentence. Null when nothing was published, so an older activity
   * does not grow a line of placeholder words.
   */
  comparison: string | null;
  scope: string;
};

const FIT_PREDICATE: Record<string, string> = {
  appropriate: "on target",
  overcooked: "more than readiness wanted",
  undercooked: "lighter than it could have been",
};

const FIT_SHORT: Record<string, string> = {
  appropriate: "On target",
  overcooked: "Overcooked",
  undercooked: "Undercooked",
};

const FIT_WHY: Record<string, string> = {
  appropriate: "What was delivered matched what readiness could take.",
  overcooked: "What was delivered asked for more than readiness wanted.",
  undercooked: "What was delivered was lighter than readiness allowed.",
};

const BASIS_COPY: Record<string, { label: string; hint: string; intentNote: string }> = {
  plan_backed: {
    label: "With plan",
    hint: "A calendar or week plan was present.",
    intentNote: "The intent had a calendar or week plan.",
  },
  readiness_only: {
    label: "Readiness only",
    hint: "No plan. Fit comes from readiness and the delivered session.",
    intentNote: "The intent had no plan.",
  },
  thin: {
    label: "Little to go on",
    hint: "A thin read: little plan and little readiness to judge from.",
    intentNote: "The intent had little to go on.",
  },
};

function basisKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Chip for the published basis. `fit_basis` leads; `intent_basis` fills in when that is all the export sent. */
function basisChip(fitBasis: string | null, intentBasis: string | null): FitBasisChip | null {
  const primary = fitBasis ?? intentBasis;
  if (!primary) return null;
  const known = BASIS_COPY[basisKey(primary)];
  const plain = primary.replaceAll("_", " ");
  const chip: FitBasisChip = known
    ? { label: known.label, hint: known.hint, notes: [] }
    : { label: plain, hint: `Published basis: ${plain}.`, notes: [] };
  if (fitBasis && intentBasis && basisKey(fitBasis) !== basisKey(intentBasis)) {
    const intent = BASIS_COPY[basisKey(intentBasis)];
    const intentPlain = intentBasis.replaceAll("_", " ");
    chip.notes.push(intent ? intent.intentNote : `Intent published as ${intentPlain}.`);
  }
  return chip;
}

function publishedUnit(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function token(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function humanFitToken(value: string): string {
  return value.replaceAll("_", " ");
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Kind of day for "a typical easy day". Not a fit judgment. */
function stratumPhrase(primary: string | null): string | null {
  if (!primary || primary === "low_confidence" || primary === "other") return null;
  return humanFitToken(primary);
}

function readinessParts(value: string): { lead: string; text: string; rationale: string } {
  switch (value) {
    case "ready_to_reach":
      return {
        lead: "The body was set for ",
        text: "a push",
        rationale: "The body was judged ready to push.",
      };
    case "baseline":
      return {
        lead: "The body was set for ",
        text: "a normal day",
        rationale: "The body was judged ready for a normal day.",
      };
    case "chill":
      return {
        lead: "The body was set to ",
        text: "keep it easy",
        rationale: "The body was judged to need an easy day.",
      };
    case "rest":
      return {
        lead: "The body was set for ",
        text: "rest",
        rationale: "The body was judged to need rest.",
      };
    case "unclear":
      return {
        lead: "Readiness was ",
        text: "unclear",
        rationale: "Readiness was not clear.",
      };
    default:
      return {
        lead: "The body was set for ",
        text: humanFitToken(value),
        rationale: `Readiness was published as ${humanFitToken(value)}.`,
      };
  }
}

function loadPhrase(value: string, stratum: string | null): { text: string; rationale: string } {
  if (value === "reach_volume") {
    return {
      text: "a bigger-than-usual easy volume day",
      rationale: "More easy volume than a usual easy day.",
    };
  }
  if (value === "typical_for_stratum") {
    return stratum
      ? { text: `a typical ${stratum} day`, rationale: `In line with a usual ${stratum} day.` }
      : {
          text: "a typical day for that kind of session",
          rationale: "In line with what this kind of day usually is.",
        };
  }
  if (value === "reach_intensity") {
    return {
      text: "harder intensity than usual for that type",
      rationale: "Harder than usual for this kind of session.",
    };
  }
  const plain = humanFitToken(value);
  return {
    text: plain.startsWith("a ") ? plain : `a ${plain} day`,
    rationale: `The workout was published as ${plain}.`,
  };
}

function variabilityNote(value: string | null): { clause: string; note: string } | null {
  if (!value || value === "none" || value === "neutral" || value === "unchanged" || value === "no_change") return null;
  if (value === "monotony_add" || value === "monotony") {
    return {
      clause: ", and it added more of the same",
      note: "Recent days have been more alike than usual.",
    };
  }
  const plain = humanFitToken(value);
  return { clause: `, and variability was ${plain}`, note: `Variability was ${plain}.` };
}

function fitParts(value: string): { text: string; rationale: string } {
  return {
    text: FIT_PREDICATE[value] ?? humanFitToken(value),
    rationale: FIT_WHY[value] ?? `The fit was published as ${humanFitToken(value)}.`,
  };
}

function comparisonFrom(clauses: FitClause[]): string | null {
  if (clauses.length === 0) return null;
  return `${clauses.map((clause) => `${clause.lead}${clause.term.text}`).join("; ")}.`;
}

/** Read the published stimulus fit. Does not invent one from the stimulus label or its confidence. */
export function stimulusFit(activity: StimulusFitActivity): StimulusFitView {
  const macroReadiness = token(activity.macro_readiness);
  const macroReadinessGate = token(activity.macro_readiness_gate);
  const activitySideLoad = token(activity.activity_side_load);
  const sessionVariability = token(activity.session_variability_impact);
  const fitLabel = token(activity.stimulus_fit);
  const fitConfidence = publishedUnit(activity.fit_confidence);
  const basis = basisChip(token(activity.fit_basis), token(activity.intent_basis));
  const readinessConfidence = publishedUnit(activity.macro_readiness_confidence);
  const loadConfidence = publishedUnit(activity.activity_side_load_confidence);
  const variabilityConfidence = publishedUnit(activity.session_variability_confidence);
  const stratum = stratumPhrase(token(activity.primary_stimulus));
  const published =
    macroReadiness != null ||
    macroReadinessGate != null ||
    activitySideLoad != null ||
    sessionVariability != null ||
    fitLabel != null ||
    fitConfidence != null ||
    readinessConfidence != null ||
    loadConfidence != null ||
    variabilityConfidence != null;

  const clauses: FitClause[] = [];
  if (macroReadiness) {
    const parts = readinessParts(macroReadiness);
    clauses.push({
      lead: parts.lead,
      term: {
        role: "readiness",
        text: parts.text,
        rationale: parts.rationale,
        notes: [],
        confidences: readinessConfidence == null ? [] : [{ label: "Readiness confidence", value: readinessConfidence }],
      },
    });
  }

  const variability = variabilityNote(sessionVariability);
  if (activitySideLoad || variability) {
    const load = activitySideLoad ? loadPhrase(activitySideLoad, stratum) : null;
    const confidences: FitConfidence[] = [];
    if (load && loadConfidence != null) confidences.push({ label: "Load confidence", value: loadConfidence });
    if (variability && variabilityConfidence != null) {
      confidences.push({ label: "Variability confidence", value: variabilityConfidence });
    }
    clauses.push({
      lead: clauses.length > 0 ? "this workout delivered " : "This workout delivered ",
      term: {
        role: "load",
        text: `${load?.text ?? "the session"}${variability?.clause ?? ""}`,
        rationale: load?.rationale ?? variability?.note ?? "What the workout delivered.",
        notes: load && variability ? [variability.note] : [],
        confidences,
      },
    });
  }

  if (fitLabel) {
    const parts = fitParts(fitLabel);
    clauses.push({
      lead: clauses.length > 0 ? "so it was " : "It was ",
      term: {
        role: "fit",
        text: parts.text,
        rationale: parts.rationale,
        notes: [STIMULUS_FIT_NOTE],
        confidences: fitConfidence == null ? [] : [{ label: "Fit confidence", value: fitConfidence }],
      },
    });
  }

  return {
    published,
    macroReadiness,
    macroReadinessGate,
    activitySideLoad,
    sessionVariability,
    stimulusFit: fitLabel,
    fitConfidence,
    scoreLabel: fitConfidence == null ? "Unavailable" : percent(fitConfidence),
    verdictLabel: fitLabel ? (FIT_SHORT[fitLabel] ?? humanFitToken(fitLabel)) : null,
    basis,
    clauses,
    comparison: comparisonFrom(clauses),
    scope: STIMULUS_FIT_NOTE,
  };
}
