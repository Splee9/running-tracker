import { sportLabel, type Activity } from "../lib/activitySearch";
import { stimulusDecision } from "../lib/stimulusDecision";
import styles from "./StimulusDecision.module.css";

export function StimulusDecisionPanel({
  activity,
  onClose,
}: {
  activity: Activity;
  onClose: () => void;
}) {
  const view = stimulusDecision(activity);
  const date = new Date(activity.start_date_local.replace(/Z$/, ""));
  const when = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const pct = view.primaryConfidence == null ? null : Math.round(view.primaryConfidence * 100);

  return (
    <section className={styles.panel} aria-label={`Stimulus decision for ${activity.name}`}>
      <div className={styles.head}>
        <div>
          <p className="eyebrow">Classification confidence</p>
          <h2 className={styles.name}>{activity.name}</h2>
          <p className={styles.when}>
            {sportLabel(activity.sport_type)} · {when}
          </p>
        </div>
        <button type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </div>
      <p className={styles.subtitle}>{view.scope}</p>
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
        {view.status !== view.scoreLabel && <p className={styles.scoreStatus}>{view.status}</p>}
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>Primary</dt>
          <dd>{view.primaryText}</dd>
        </div>
        <div>
          <dt>Cluster</dt>
          <dd>{view.clusterText}</dd>
        </div>
        <div>
          <dt>Modifiers</dt>
          <dd>{view.modifierText}</dd>
        </div>
      </dl>
      {view.reasons.length > 0 && (
        <ul className={styles.reasons}>
          {view.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      <a
        className={styles.strava}
        href={`https://www.strava.com/activities/${activity.id}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open on Strava
      </a>
    </section>
  );
}
