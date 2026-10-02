import { chicagoStrip } from "../lib/chicago-data";
import { lookupWeekHref, milesYearHref, trainingWeekHref, chicagoWeekHref } from "../lib/links";
import { Link } from "../lib/router";
import styles from "./ContextStrip.module.css";

/** Current Chicago phase and week mileage. Fit sentences stay on Lookup. */
export function ContextStrip({ showChartJump = false }: { showChartJump?: boolean }) {
  const strip = chicagoStrip();
  if (!strip) return null;
  const chicagoHref = chicagoWeekHref(strip.monday);
  const sessionsHref = lookupWeekHref(strip.monday, "run");
  const chartHref = trainingWeekHref(strip.monday, "run");
  const yearHref = milesYearHref(strip.year);
  const parts = strip.sentence.split(" · ");
  const lead = parts.slice(0, 2).join(" · ");
  const tail = parts.length > 2 ? ` · ${parts.slice(2).join(" · ")}` : "";

  return (
    <div className={styles.strip}>
      <p className={styles.line}>
        {chicagoHref ? <Link href={chicagoHref}>{lead}</Link> : lead}
        {tail}
      </p>
      <p className={styles.actions}>
        {sessionsHref && (
          <Link href={sessionsHref}>{strip.partial ? "Sessions so far" : "Sessions this week"}</Link>
        )}
        {showChartJump && chartHref && <Link href={chartHref}>This week on the chart</Link>}
        {yearHref && <Link href={yearHref}>{strip.year} on the log</Link>}
      </p>
    </div>
  );
}
