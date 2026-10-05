import { motion, type Variants } from "motion/react";
import { data, lifetime } from "../lib/data";
import { MILESTONES } from "../lib/comparisons";
import { fmt } from "../lib/format";
import { lookupMonthHref } from "../lib/links";
import { Link } from "../lib/router";
import type { MilesScope } from "../hooks/useMilesYear";
import styles from "./MilestoneLedger.module.css";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtMonth = (ym: string) => `${MON[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

const reveal: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: Math.min(i, 8) * 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
};

/** The month the running total first reached each milestone. */
const CROSSED = MILESTONES.filter((m) => m.miles <= lifetime.miles).map((m) => {
  const month = data.monthly.find((mo) => mo.cumulative >= m.miles)!.month;
  return { ...m, month, year: +month.slice(0, 4) };
});

const NEXT = MILESTONES.find((m) => m.miles > lifetime.miles) ?? null;
const PREV_MILES = CROSSED.at(-1)?.miles ?? 0;

/** At this year's daily rate, the month the next milestone lands. */
const NEXT_ETA = (() => {
  const current = data.years.at(-1);
  if (!NEXT || !current?.partial || data.ytdFraction <= 0) return null;
  const perDay = current.miles / (data.ytdFraction * 365.25);
  if (perDay <= 0) return null;
  const days = (NEXT.miles - lifetime.miles) / perDay;
  const from = new Date(`${data.lastUpdated}T00:00:00Z`);
  if (Number.isNaN(from.getTime())) return null;
  const eta = new Date(from.getTime() + days * 86_400_000);
  return `${MON[eta.getUTCMonth()]} ${eta.getUTCFullYear()}`;
})();

/** Every milestone the log has passed, when, and what is next. Follows the hero's year. */
export function MilestoneLedger({ selected }: { selected: MilesScope }) {
  const marathons = lifetime.miles / 26.2;
  const yearMiles = selected === "lifetime" ? 0 : (data.years.find((y) => y.year === selected)?.miles ?? 0);
  const inYear = selected === "lifetime" ? [] : CROSSED.filter((m) => m.year === selected);
  const progress = NEXT ? (lifetime.miles - PREV_MILES) / (NEXT.miles - PREV_MILES) : 1;

  return (
    <section className={styles.section} aria-label="Milestones">
      <p className="eyebrow">What that distance looks like</p>
      <h2 className={styles.headline}>
        {fmt(marathons)} marathons, back to back.
        <span className={styles.sub}>
          {selected === "lifetime"
            ? ` ${CROSSED.length} milestones passed since 2018.`
            : inYear.length === 0
              ? ` ${selected} added ${fmt(yearMiles)} mi between them.`
              : ` ${inYear.length} of them passed in ${selected}.`}
        </span>
      </h2>

      {NEXT && (
        <motion.div
          className={styles.next}
          variants={reveal}
          custom={0}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-10%" }}
        >
          <div className={styles.nextHead}>
            <span className={styles.nextTag}>Next</span>
            <span className={styles.nextLabel}>{NEXT.label}</span>
            <span className={styles.nextMiles}>{fmt(NEXT.miles)} mi</span>
          </div>
          <div className={styles.bar} aria-hidden>
            <motion.div
              className={styles.barFill}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: progress }}
              viewport={{ once: true }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            />
          </div>
          <p className={styles.nextMeta}>
            <b>{fmt(NEXT.miles - lifetime.miles)}</b> mi to go
            {NEXT_ETA && (
              <>
                {" "}
                · at this year's pace, around <b>{NEXT_ETA}</b>
              </>
            )}
          </p>
        </motion.div>
      )}

      <ol className={styles.ledger}>
        {[...CROSSED].reverse().map((m, i) => {
          const href = lookupMonthHref(m.month);
          const on = selected === m.year;
          return (
            <motion.li
              key={m.miles}
              className={`${styles.row} ${on ? styles.rowOn : ""}`}
              variants={reveal}
              custom={i + 1}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-6%" }}
            >
              <span className={styles.when}>{fmtMonth(m.month)}</span>
              <span className={styles.mark} aria-hidden />
              <span className={styles.what}>
                <span className={styles.label}>{m.label}</span>
                <span className={styles.miles}>{fmt(m.miles)} mi</span>
              </span>
              {href && (
                <Link href={href} className={styles.link}>
                  Runs<span className={styles.wide}> that month</span>
                </Link>
              )}
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}
