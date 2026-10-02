import { sportLabel, type Activity } from "../lib/activitySearch";
import { stimulusDecision } from "../lib/stimulusDecision";
import styles from "./StimulusDecision.module.css";

function ConfidenceBars({
  bars,
  reviewBelow,
}: {
  bars: { label: string; value: number; marked?: boolean }[];
  reviewBelow: number;
}) {
  return (
    <ul className={styles.bars}>
      {bars.map((bar) => {
        const pct = Math.round(bar.value * 100);
        const under = bar.value < reviewBelow;
        return (
          <li key={bar.label}>
            <div className={styles.barLabel}>
              <span>{bar.label}</span>
              <span>{pct}%</span>
            </div>
            <div
              className={styles.track}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={`${bar.label} ${pct} percent`}
            >
              <span
                className={`${styles.fill} ${bar.marked && under ? styles.fillUnder : ""}`}
                style={{ width: `${pct}%` }}
              />
              {bar.marked && <span className={styles.reviewMark} style={{ left: `${reviewBelow * 100}%` }} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

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

  return (
    <section className={styles.panel} aria-label={`Stimulus decision for ${activity.name}`}>
      <div className={styles.head}>
        <div>
          <p className="eyebrow">Stimulus decision</p>
          <h2 className={styles.name}>{activity.name}</h2>
          <p className={styles.when}>
            {sportLabel(activity.sport_type)} · {when}
          </p>
        </div>
        <button type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </div>
      <p className={styles.advise}>{view.scope} The label stays as published.</p>
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
        {view.modality && (
          <div>
            <dt>Modality</dt>
            <dd>{view.modality}</dd>
          </div>
        )}
      </dl>
      <h3>Why this label</h3>
      <p className={styles.copy}>{view.why}</p>
      <h3>Classification confidence</h3>
      {view.primaryConfidence == null && (
        <p className={styles.unavailable}>Classification confidence unavailable</p>
      )}
      {view.bars.length > 0 && <ConfidenceBars bars={view.bars} reviewBelow={view.reviewBelow} />}
      {view.primaryConfidence != null && (
        <p className={styles.legend}>The mark is the 0.55 line on classification confidence.</p>
      )}
      {view.lowConfidence && <p className={styles.flag}>low_confidence is set on this label</p>}
      <h3>When to review the label</h3>
      <p className={styles.copy}>{view.rule}</p>
      <p className={styles.legend}>{view.stricterBar}</p>
      <p className={`${styles.status} ${styles[view.tone]}`}>{view.status}</p>
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
