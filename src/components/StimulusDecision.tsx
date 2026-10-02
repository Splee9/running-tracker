import { sportLabel, type Activity } from "../lib/activitySearch";
import { stimulusDecision } from "../lib/stimulusDecision";
import { stimulusFit } from "../lib/stimulusFit";
import styles from "./StimulusDecision.module.css";

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
                  {value}
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
      {fit.published && fit.comparison && (
        <div className={styles.fit} aria-label="Stimulus fit">
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
                aria-label={`Stimulus fit confidence ${fit.scoreLabel}`}
              >
                <span className={styles.fill} style={{ width: `${fitPct}%` }} />
              </div>
            )}
          </div>
          <div className={styles.copy}>
            <p className={styles.facts}>
              <span>
                <span className={styles.factLabel}>Layer B</span>
                Stimulus fit
              </span>
            </p>
          </div>
          <span className={styles.fitSpacer} aria-hidden="true" />
          </div>
          <p className={styles.comparison}>{fit.comparison}</p>
          <p className={styles.why}>{fit.scope}</p>
        </div>
      )}
      <p className="sr-only">
        {view.scope}. {view.status}.
        {fit.published && fit.comparison ? ` ${fit.scope} ${fit.comparison} Fit confidence ${fit.scoreLabel}.` : ""}
      </p>
    </section>
  );
}
