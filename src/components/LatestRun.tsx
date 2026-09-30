import { useApi } from "../lib/useApi";
import { fmt1 } from "../lib/format";
import { formatMoving, latestRun, miles, pacePerMile, PULSE_ENDPOINT, relativeDay, type Pulse } from "../lib/pulse";
import styles from "./LatestRun.module.css";

/** The newest public run, read from /api/pulse at view time. Hidden if the request fails. */
export function LatestRun() {
  const pulse = useApi<Pulse>(PULSE_ENDPOINT);
  if (pulse.status === "error") return null;
  const run = pulse.status === "ready" ? latestRun(pulse.data.recent) : undefined;
  if (pulse.status === "ready" && !run) return null;

  if (!run) {
    return (
      <div className={`${styles.card} ${styles.loading}`} aria-busy="true" aria-label="Loading latest run">
        <span className={styles.label}>Latest run</span>
        <span className={styles.placeholder} />
        <span className={`${styles.placeholder} ${styles.placeholderShort}`} />
      </div>
    );
  }

  const now = new Date();
  const pace = pacePerMile(run);
  return (
    <a
      className={styles.card}
      href={`https://www.strava.com/activities/${run.id}`}
      target="_blank"
      rel="noreferrer"
    >
      <span className={styles.label}>
        <span className={styles.dot} aria-hidden="true" />
        Latest run · {relativeDay(run.start_date_local, now)}
      </span>
      <span className={styles.name}>{run.name}</span>
      <span className={styles.stats}>
        <span>
          <b>{fmt1(miles(run.distance_m))}</b> mi
        </span>
        <span>
          <b>{formatMoving(run.moving_time_s)}</b>
        </span>
        {pace && (
          <span>
            <b>{pace}</b> /mi
          </span>
        )}
      </span>
      <span className={styles.arrow} aria-hidden="true">
        ↗
      </span>
    </a>
  );
}
