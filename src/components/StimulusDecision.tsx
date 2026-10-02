import { useId, type ReactNode } from "react";
import { sportLabel, type Activity } from "../lib/activitySearch";
import { stimulusDecision } from "../lib/stimulusDecision";
import { STIMULUS_FIT_NOTE, stimulusFit, type FitTerm } from "../lib/stimulusFit";
import styles from "./StimulusDecision.module.css";

function confidenceText(items: { label: string; value: number }[], fallback: string): string {
  if (items.length === 0) return fallback;
  return items.map((item) => `${item.label} ${Math.round(item.value * 100)}%.`).join(" ");
}

function Term({
  tone,
  text,
  children,
}: {
  tone: "quiet" | "termFit" | "fitOver" | "fitUnder" | "label" | "score";
  text: ReactNode;
  children: ReactNode;
}) {
  const tipId = useId();
  return (
    <span className={styles.termWrap}>
      {/* A focusable span, not a button: a button is an atomic box and will not wrap mid-phrase. */}
      <span tabIndex={0} className={`${styles.term} ${styles[tone]}`} aria-describedby={tipId}>
        {text}
      </span>
      <span role="tooltip" id={tipId} className={styles.tip}>
        {children}
      </span>
    </span>
  );
}

function FitTermButton({ term }: { term: FitTerm }) {
  // Only the verdict carries color. Readiness and load read as plain words with a gloss.
  const tone = term.role === "fit" ? fitTone(term.text) : "quiet";
  // The scope note lives on the Fit score, so it is not repeated on every verdict.
  const notes = term.notes.filter((note) => note !== STIMULUS_FIT_NOTE);
  return (
    <Term tone={tone} text={term.text}>
      <span className={styles.tipBody}>{term.rationale}</span>
      {notes.map((note) => (
        <span key={note} className={styles.tipBody}>
          {note}
        </span>
      ))}
      <span className={styles.tipConf}>{confidenceText(term.confidences, "Confidence not published.")}</span>
    </Term>
  );
}

function fitTone(text: string): "termFit" | "fitOver" | "fitUnder" {
  if (text === "more than readiness wanted") return "fitOver";
  if (text === "lighter than it could have been") return "fitUnder";
  return "termFit";
}

/** Pill color follows the published verdict, so the score and the verdict phrase agree. */
function pillTone(value: string | null): "pillFit" | "pillOver" | "pillUnder" | "pillNone" {
  if (value === "appropriate") return "pillFit";
  if (value === "overcooked") return "pillOver";
  if (value === "undercooked") return "pillUnder";
  return "pillNone";
}

/** Reasons the row's own chips already show. Dropped from the expand so they are not read twice. */
function shownOnRow(activity: Activity, line: string): boolean {
  if (line === activity.workout_structure?.trim()) return true;
  if (line === activity.race?.event_name?.trim()) return true;
  return activity.has_intervals === true && (/^\d+ hard laps?$/.test(line) || line === "Intervals flag");
}

export function StimulusDecisionPanel({
  activity,
  pinned = false,
  onClose,
}: {
  activity: Activity;
  /** Shown above the list when the open row is not on this page. */
  pinned?: boolean;
  onClose: () => void;
}) {
  const view = stimulusDecision(activity);
  const fit = stimulusFit(activity);
  const fitPct = fit.fitConfidence == null ? null : Math.round(fit.fitConfidence * 100);
  // A pinned card has no row above it, so it keeps every reason.
  const reasons = pinned ? view.reasons : view.reasons.filter((line) => !shownOnRow(activity, line));
  const underBar = view.primaryConfidence != null && view.primaryConfidence < view.reviewBelow;
  const date = pinned ? new Date(activity.start_date_local.replace(/Z$/, "")) : null;
  const when = date
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  // Layer A, one muted line: label, how sure, cluster, modifiers, reasons.
  const classify: ReactNode[] = [];
  if (view.labelTerm) {
    classify.push(
      <span key="label">
        Labeled{" "}
        <Term tone="label" text={view.labelTerm.text}>
          <span className={styles.tipBody}>{view.labelTerm.rationale}</span>
          {view.labelTerm.competitors.length > 0 && (
            <span className={styles.tipBody}>Also possible: {view.labelTerm.competitors.join(", ")}.</span>
          )}
          <span className={styles.tipConf}>
            {view.labelTerm.confidence == null
              ? "Label confidence not published."
              : `Label confidence ${view.labelTerm.confidenceLabel}.`}
          </span>
        </Term>
      </span>,
    );
  }
  if (view.primaryConfidence != null) {
    classify.push(<span key="conf">{view.scoreLabel} sure</span>);
  } else if (view.primary) {
    classify.push(<span key="conf">confidence unavailable</span>);
  }
  if (view.escalate) {
    classify.push(
      <span key="review" className={styles.review}>
        Review{underBar ? ` · under ${Math.round(view.reviewBelow * 100)}%` : ""}
      </span>,
    );
  }
  if (view.cluster) classify.push(<span key="cluster">{view.clusterText} cluster</span>);
  if (view.modifiers.length > 0) classify.push(<span key="mods">with {view.modifierText}</span>);
  for (const line of reasons) classify.push(<span key={`r-${line}`}>{line}</span>);

  return (
    <section
      className={`${styles.panel} ${pinned ? styles.pinned : ""}`}
      aria-label={
        fit.published ? `Stimulus label and fit for ${activity.name}` : `Stimulus decision for ${activity.name}`
      }
    >
      <div className={styles.head}>
        <div className={styles.actions}>
          <a
            className={styles.strava}
            href={`https://www.strava.com/activities/${activity.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Strava ↗
          </a>
          <button type="button" className={styles.close} onClick={onClose} aria-label={`Close ${activity.name}`}>
            ×
          </button>
        </div>
        <div className={styles.headText}>
          {pinned && (
            <p className={styles.identity}>
              <span className={styles.identityName}>{activity.name}</span>
              <span>
                {sportLabel(activity.sport_type)} · {when}
              </span>
            </p>
          )}
          {classify.length > 0 && <p className={styles.classify}>{classify}</p>}
        </div>
      </div>
      {fit.published && (
        <div className={styles.fit} aria-label="Fit for the day">
          {fit.clauses.length > 0 && (
            <p className={styles.comparison}>
              {fit.clauses.map((clause, index) => (
                <span key={clause.term.role}>
                  {index > 0 ? "; " : null}
                  {clause.lead}
                  <FitTermButton term={clause.term} />
                </span>
              ))}
              .
            </p>
          )}
          <div className={`${styles.fitScore} ${styles[pillTone(fit.stimulusFit)]}`}>
            <Term
              tone="score"
              text={
                <>
                  {/* Lead with the verdict so the percent reads as confidence in it, not as a grade. */}
                  {fit.verdictLabel ? (
                    <span className={styles.fitVerdict}>{fit.verdictLabel}</span>
                  ) : (
                    <span className={styles.fitLabel}>Fit</span>
                  )}{" "}
                  <span className={styles.fitValue}>
                    {fit.fitConfidence == null
                      ? fit.verdictLabel
                        ? "confidence unavailable"
                        : "unavailable"
                      : `${fit.scoreLabel} sure`}
                  </span>
                </>
              }
            >
              <span className={styles.tipBody}>{STIMULUS_FIT_NOTE}</span>
              <span className={styles.tipConf}>
                {fit.fitConfidence == null ? "Fit confidence not published." : `Fit confidence ${fit.scoreLabel}.`}
              </span>
            </Term>
            {fitPct != null && (
              <span
                className={styles.track}
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={fitPct}
                aria-label={`Fit for the day ${fit.scoreLabel}`}
              >
                <span className={styles.fill} style={{ width: `${fitPct}%` }} />
              </span>
            )}
          </div>
        </div>
      )}
      <p className="sr-only">
        {view.scope}. {view.status}.
        {fit.published ? ` ${fit.scope} Fit for the day ${fit.scoreLabel}.` : ""}
      </p>
    </section>
  );
}
