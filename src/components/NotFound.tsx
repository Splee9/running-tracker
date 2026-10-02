import { Link } from "../lib/router";
import styles from "./NotFound.module.css";

export function NotFound() {
  return (
    <section className={styles.section} aria-label="Page not found">
      <p className="eyebrow">404</p>
      <h1 className={styles.title}>No miles logged here.</h1>
      <p className={styles.links}>
        <Link href="/">Home →</Link>
        <Link href="/lookup">Activity lookup →</Link>
        <Link href="/chicago">Chicago →</Link>
        <Link href="/miles">Running log →</Link>
      </p>
    </section>
  );
}
