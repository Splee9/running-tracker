import { data } from "../../lib/chicago-data";
import { fmt1, formatDate } from "../../lib/chicago-format";
import { Link } from "../../lib/router";
import styles from "./Footer.module.css";

export function Footer() {
  const { meta } = data;
  return (
    <footer className={styles.footer}>
      <p>
        <b>{fmt1(meta.blockMilesToDate)}</b> miles into the build · <b>{meta.daysToRace}</b> days to{" "}
        {formatDate(meta.raceDate)}.
      </p>
      <p className={styles.stamp}>
        Last refreshed {formatDate(meta.lastUpdated)} · rebuilt automatically from a Strava + Garmin
        training log. Aggregate weekly figures only — no pace, GPS, heart rate, or health data.
      </p>
      <p className={styles.crosslink}>
        <Link href="/miles">
          Zoom out to a decade of lifetime mileage <span className={styles.arrow}>→</span>
        </Link>
      </p>
    </footer>
  );
}
