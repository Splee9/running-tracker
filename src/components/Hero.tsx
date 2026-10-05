import { motion, type Variants } from "motion/react";
import { AnimatedNumber } from "./AnimatedNumber";
import { Chip } from "./Chip";
import { ContextStrip } from "./ContextStrip";
import { Rich } from "./Rich";
import { data, lifetime } from "../lib/data";
import { fmt, fmt1 } from "../lib/format";
import { headlineFor } from "../lib/comparisons";
import { lookupYearHref } from "../lib/links";
import { Link } from "../lib/router";
import type { MilesScope } from "../hooks/useMilesYear";
import styles from "./Hero.module.css";

const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

const maxMiles = Math.max(...data.years.map((y) => y.miles));

function scopeFor(selected: MilesScope) {
  if (selected === "lifetime") {
    return { label: "Since 2018", miles: lifetime.miles, runs: lifetime.runs, partial: false };
  }
  const d = data.years.find((y) => y.year === selected)!;
  return { label: String(d.year), miles: d.miles, runs: d.runs, partial: d.partial };
}

/** The lifetime number and the year bars are one control: a bar rescopes the number. */
export function Hero({
  selected,
  onChoose,
}: {
  selected: MilesScope;
  onChoose: (scope: MilesScope) => void;
}) {
  const scope = scopeFor(selected);
  const avg = scope.miles / scope.runs;

  return (
    <header className={styles.hero}>
      <motion.p className="eyebrow" variants={rise} custom={0} initial="hidden" animate="show">
        A running log
      </motion.p>
      <motion.h1 className={styles.title} variants={rise} custom={1} initial="hidden" animate="show">
        Every mile, since 2018.
      </motion.h1>
      <motion.div className={styles.strip} variants={rise} custom={1} initial="hidden" animate="show">
        <ContextStrip />
      </motion.div>

      <motion.div className={styles.number} variants={rise} custom={2} initial="hidden" animate="show">
        <AnimatedNumber value={scope.miles} duration={selected === "lifetime" ? 1.4 : 0.8} />
        <span className={styles.unit}>miles</span>
      </motion.div>

      <motion.div variants={rise} custom={3} initial="hidden" animate="show">
        <p className={styles.meta}>
          <b>{scope.label}</b>
          {scope.partial && " · YTD"} · <b>{fmt(scope.runs)}</b> runs ·{" "}
          <b>{selected === "lifetime" ? fmt(avg) : fmt1(avg)}</b> mi avg
          {scope.partial && (
            <>
              {" "}
              · on pace for <b>{fmt(scope.miles / data.ytdFraction)}</b>
            </>
          )}
          {selected !== "lifetime" && (
            <>
              {" · "}
              <Link href={lookupYearHref(selected)} className={styles.metaLink}>
                Sessions in {selected}
              </Link>
            </>
          )}
        </p>
        <p className={styles.headline} aria-live="polite">
          <Rich text={headlineFor(scope.miles)} />
        </p>
      </motion.div>

      <motion.div className={styles.years} variants={rise} custom={4} initial="hidden" animate="show">
        <div className={styles.yearsHead}>
          <span className={styles.yearsLabel}>By the year</span>
          <Chip active={selected === "lifetime"} onClick={() => onChoose("lifetime")}>
            All years
          </Chip>
        </div>
        <div className={styles.chart} role="group" aria-label="Choose a year">
          {data.years.map((y) => {
            const active = selected === y.year;
            return (
              <button
                key={y.year}
                type="button"
                className={`${styles.col} ${active ? styles.colActive : ""}`}
                onClick={() => onChoose(active ? "lifetime" : y.year)}
                aria-pressed={active}
                aria-label={`${y.year}${y.partial ? " so far" : ""}: ${fmt(y.miles)} miles`}
              >
                <span className={styles.val}>{fmt(y.miles)}</span>
                <div className={styles.barTrack} style={{ height: `${(y.miles / maxMiles) * 100}%` }}>
                  <motion.div
                    className={`${styles.bar} ${y.partial ? styles.barPartial : ""}`}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.45, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <span className={styles.xlabel}>’{String(y.year).slice(2)}</span>
              </button>
            );
          })}
        </div>
      </motion.div>

      <motion.p className={styles.scrollCue} variants={rise} custom={5} initial="hidden" animate="show">
        Scroll to see how far that really is ↓
      </motion.p>
    </header>
  );
}
