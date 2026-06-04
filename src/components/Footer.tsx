import { data, lifetime } from "../lib/data";
import { fmt, formatDate } from "../lib/format";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <p>
        Pulled from <b>{fmt(lifetime.runs)}</b> logged runs · first run{" "}
        <b>{formatDate(data.firstRun)}</b>.
      </p>
      <p className={styles.stamp}>
        Last refreshed {formatDate(data.lastUpdated)} · rebuilt automatically from a Strava +
        Garmin training log.
      </p>
      <p className={styles.crosslink}>
        <a href="https://chicagomarathon2026.netlify.app/">
          Follow my Chicago 2026 marathon build <span className={styles.arrow}>→</span>
        </a>
      </p>
    </footer>
  );
}
