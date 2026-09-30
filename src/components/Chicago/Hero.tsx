import { motion, type Variants } from "motion/react";
import { AnimatedNumber } from "../AnimatedNumber";
import { data, PHASE_VAR } from "../../lib/chicago-data";
import { fmt1, formatDate } from "../../lib/chicago-format";
import { daysBetween, isoDay, PULSE_ENDPOINT, runWeekSoFar, type Pulse } from "../../lib/pulse";
import { useApi } from "../../lib/useApi";
import styles from "./Hero.module.css";

const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

/**
 * The countdown, week, and phase follow today's date rather than the day the data was
 * exported, so they stay right between refreshes.
 */
function liveCalendar(today: string) {
  const { meta, phases } = data;
  const daysToRace = Math.max(0, daysBetween(today, meta.raceDate));
  const sinceStart = daysBetween(meta.blockStart, today);
  const currentWeek = Math.min(meta.blockWeeks, Math.max(1, Math.floor(sinceStart / 7) + 1));
  const found = phases.findIndex((p) => p.start <= today && today <= p.end);
  const currentPhase = found >= 0 ? found : meta.currentPhase;
  return { daysToRace, currentWeek, currentPhase, currentPhaseName: phases[currentPhase]?.name ?? meta.currentPhaseName };
}

export function Hero() {
  const { meta } = data;
  const now = new Date();
  const live = liveCalendar(isoDay(now));
  const phaseColor = `var(${PHASE_VAR[live.currentPhase] ?? "--p1"})`;
  const weeksToRace = Math.ceil(live.daysToRace / 7);
  const pulse = useApi<Pulse>(PULSE_ENDPOINT);
  const week = pulse.status === "ready" ? runWeekSoFar(pulse.data.recent, now) : null;

  return (
    <header className={styles.hero}>
      <motion.p className="eyebrow" variants={rise} custom={0} initial="hidden" animate="show">
        The road to Chicago
      </motion.p>
      <motion.h1 className={styles.title} variants={rise} custom={1} initial="hidden" animate="show">
        26.2 miles, one&nbsp;build&nbsp;at&nbsp;a&nbsp;time.
      </motion.h1>

      <motion.div className={styles.number} variants={rise} custom={2} initial="hidden" animate="show">
        <AnimatedNumber value={live.daysToRace} duration={1.4} />
        <span className={styles.unit}>
          {live.daysToRace === 1 ? "day" : "days"} to the start line
        </span>
      </motion.div>

      <motion.p className={styles.meta} variants={rise} custom={3} initial="hidden" animate="show">
        {meta.raceName} · {formatDate(meta.raceDate)} · goal <b>{meta.goal}</b> ({meta.goalPace})
      </motion.p>

      <motion.div className={styles.stats} variants={rise} custom={4} initial="hidden" animate="show">
        <div className={styles.stat}>
          <span className={styles.statValue} style={{ color: phaseColor }}>
            {live.currentPhaseName}
          </span>
          <span className={styles.statLabel}>
            Phase {live.currentPhase + 1} of {data.phases.length}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>
            Wk {live.currentWeek}
            <span className={styles.statSlash}>/{meta.blockWeeks}</span>
          </span>
          <span className={styles.statLabel}>{weeksToRace} weeks out</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>
            <AnimatedNumber value={meta.blockMilesToDate} format={fmt1} />
          </span>
          <span className={styles.statLabel}>block miles logged</span>
        </div>
        {pulse.status !== "error" && (
          <div className={styles.stat} aria-busy={week === null}>
            <span className={styles.statValue}>
              {week ? <AnimatedNumber value={week.miles} format={fmt1} /> : "–"}
            </span>
            <span className={styles.statLabel}>
              <span className={styles.liveDot} aria-hidden="true" />
              {week ? `mi this week · ${week.runs} ${week.runs === 1 ? "run" : "runs"}` : "mi this week"}
            </span>
          </div>
        )}
      </motion.div>

      <motion.p className={styles.scrollCue} variants={rise} custom={5} initial="hidden" animate="show">
        Scroll for the plan, week by week ↓
      </motion.p>
    </header>
  );
}
