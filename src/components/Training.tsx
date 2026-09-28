import { useState } from "react";
import { motion } from "framer-motion";
import { AnimatedNumber } from "./AnimatedNumber";
import { Chip } from "./Chip";
import { TvChart } from "./TvChart";
import { Link } from "../lib/router";
import { formatDate } from "../lib/format";
import { BANDS, BAND_COLOR, HORIZONS, SPORTS, fmtTv, tv, type Band, type Sport } from "../lib/training";
import styles from "./Training.module.css";

const rise = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

const reveal = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const BAND_RANGE: Record<Band, string> = {
  Steady: "under 35",
  Moderate: "35–55",
  Uneven: "55–80",
  Erratic: "80+",
};

export function Training() {
  const [sport, setSport] = useState<Sport>("run");
  const current = tv.current[sport];

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.navLink}>
          <span className={styles.navArrow}>←</span> Every mile
        </Link>
      </nav>

      <header className={styles.header}>
        <motion.p className="eyebrow" variants={rise} custom={0} initial="hidden" animate="show">
          Training variability
        </motion.p>
        <motion.h1 className={styles.title} variants={rise} custom={1} initial="hidden" animate="show">
          How steady is the work?
        </motion.h1>
        <motion.p className={styles.intro} variants={rise} custom={2} initial="hidden" animate="show">
          How much weekly training hours swing around their average, over three rolling windows.{" "}
          <b>Lower is steadier</b> — a flat, low line means the same work, week after week.
        </motion.p>
      </header>

      <section className={styles.section} aria-label="Training variability by sport">
        <div className={styles.chips} role="group" aria-label="Choose a sport">
          {SPORTS.map((s) => (
            <Chip key={s} active={sport === s} onClick={() => setSport(s)}>
              {tv.filters[s].label}
            </Chip>
          ))}
        </div>

        <p className={styles.statsLabel}>
          Now · week ending {formatDate(tv.last_complete_week_end)}
        </p>
        <div className={styles.stats} aria-live="polite">
          {HORIZONS.map((h) => {
            const p = current[h];
            return (
              <div
                key={h}
                className={styles.stat}
                style={{ "--band-color": BAND_COLOR[p.band] } as React.CSSProperties}
              >
                <span className={styles.statNum} style={{ color: BAND_COLOR[p.band] }}>
                  <AnimatedNumber value={p.tv} format={fmtTv} duration={0.5} />
                </span>
                <span className={styles.statName}>
                  <b>{p.band}</b> · {tv.horizons[h].weeks} weeks
                </span>
              </div>
            );
          })}
        </div>

        <div className={styles.legend} aria-label="Bands">
          {BANDS.map((b) => (
            <span key={b.name} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: b.color }} />
              {b.name} <span className={styles.legendRange}>{BAND_RANGE[b.name]}</span>
            </span>
          ))}
        </div>

        {HORIZONS.map((h) => (
          <motion.div
            key={h}
            className={styles.chartBlock}
            variants={reveal}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-10%" }}
          >
            <div className={styles.chartHead}>
              <h2 className={styles.chartTitle}>{tv.horizons[h].label}</h2>
              <p className={styles.chartMeta}>
                rolling {tv.horizons[h].weeks}-week window · {tv.filters[sport].label.toLowerCase()}
              </p>
            </div>
            <TvChart key={sport} points={tv.series[sport][h]} label={tv.horizons[h].label} />
          </motion.div>
        ))}

        <p className={styles.cue}>
          Hover or tap a chart to read any week. The dot at the end of each line is where things
          stand now.
        </p>
      </section>

      <footer className={styles.footer}>
        <p>
          <b>How it's measured.</b> Each point is the sample standard deviation of weekly hours
          divided by their mean, × 100, over the trailing window. Weeks with zero hours count.
          Weeks run Monday–Sunday (Central time); the in-progress week is left out.{" "}
          {tv.filters[sport].label} includes {tv.filters[sport].sports.join(", ")}.
        </p>
        <p className={styles.stamp}>Through the week ending {formatDate(tv.last_complete_week_end)}.</p>
        <p className={styles.crosslink}>
          <Link href="/">
            <span className={styles.arrow}>←</span> Back to every mile
          </Link>
        </p>
      </footer>
    </div>
  );
}
