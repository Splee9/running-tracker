import { useId, type ReactNode } from "react";
import { sportLabel, type Activity } from "../lib/activitySearch";
import { stimulusDecision } from "../lib/stimulusDecision";
import { stimulusFit, type FitTerm } from "../lib/stimulusFit";
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
  tone: "readiness" | "load" | "termFit" | "fitOver" | "fitUnder" | "label";
  text: string;
  children: ReactNode;
}) {
  const tipId = useId();
  return (
    <span className={styles.termWrap}>
      <button type="button" className={`${styles.term} ${styles[tone]}`} aria-describedby={tipId}>
        {text}
      </button>
      <span role="tooltip" id={tipId} className={styles.tip}>
        {children}
      </span>
    </span>
  );
}

function FitTermButton({ term }: { term: FitTerm }) {
  const tone = term.role === "fit" ? fitTone(term.text) : term.role;
  return (
    <Term tone={tone} text={term.text}>
      <span className={styles.tipBody}>{term.rationale}</span>
      {term.notes.map((note) => (
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
  const pct = view.primaryConfidence == null ? null : Math.round(view.primaryConfidence * 100);
  const fitPct = fit.fitConfidence == null ? null : Math.round(fit.fitConfidence * 100);
  const facts = [
    view.primary ? ["Primary", view.primaryText] : null,
    view.cluster ? ["Cluster", view.clusterText] : null,
    view.modifiers.length > 0 ? ["Modifiers", view.modifierText] : null,
  ].filter((fact): fact is [string, string] => fact !== null);
  const date = pinned ? new Date(activity.start_date_local.replace(/Z$/, "")) : null;
  const when = date
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <section
      className={`${styles.panel} ${pinned ? styles.pinned : ""}`}
      aria-label={
        fit.published ? `Stimulus label and fit for ${activity.name}` : `Stimulus decision for ${activity.name}`
      }
    >
      {pinned && (
        <p className={styles.identity}>
          <span className={styles.identityName}>{activity.name}</span>
          <span>
            {sportLabel(activity.sport_type)} · {when}
          </span>
        </p>
      )}
      <div className={styles.layout}>
        <div className={`${styles.score} ${styles[view.tone]}`}>
          <p className={styles.scoreValue}>{view.scoreLabel}</p>
          {view.primaryConfidence != null && pct != null && (
            <div
              className={styles.track}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={`Classification confidence ${view.scoreLabel}`}
            >
              <span className={styles.fill} style={{ width: `${pct}%` }} />
              <span className={styles.reviewMark} style={{ left: `${view.reviewBelow * 100}%` }} />
            </div>
          )}
          {view.escalate && <p className={styles.scoreStatus}>Review</p>}
        </div>
        <div className={styles.copy}>
          {facts.length > 0 && (
            <p className={styles.facts}>
              {facts.map(([label, value]) => (
                <span key={label}>
                  <span className={styles.factLabel}>{label}</span>
                  {label === "Primary" && view.labelTerm ? (
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
                  ) : (
                    value
                  )}
                </span>
              ))}
            </p>
          )}
          <p className={styles.why}>
            {view.reasons.length > 0 && <span>{view.reasons.join(" · ")}</span>}
            <a
              className={styles.strava}
              href={`https://www.strava.com/activities/${activity.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Strava
            </a>
          </p>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label={`Close ${activity.name}`}>
          ×
        </button>
      </div>
      {fit.published && (
        <div className={styles.fit} aria-label="Fit for the day">
          <div className={styles.layout}>
            <div className={`${styles.score} ${fit.fitConfidence == null ? styles.unavailable : styles.fitKnown}`}>
              <p className={styles.scoreValue}>{fit.scoreLabel}</p>
              {fit.fitConfidence != null && fitPct != null && (
                <div
                  className={styles.track}
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={fitPct}
                  aria-label={`Fit for the day ${fit.scoreLabel}`}
                >
                  <span className={styles.fill} style={{ width: `${fitPct}%` }} />
                </div>
              )}
            </div>
            <div className={styles.copy}>
              <p className={styles.facts}>
                <span>
                  <span className={styles.factLabel}>Fit</span>
                  for the day
                </span>
              </p>
            </div>
            <span className={styles.fitSpacer} aria-hidden="true" />
          </div>
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
        </div>
      )}
      <p className="sr-only">
        {view.scope}. {view.status}.
        {fit.published ? ` ${fit.scope} Fit for the day ${fit.scoreLabel}.` : ""}
      </p>
    </section>
  );
}
