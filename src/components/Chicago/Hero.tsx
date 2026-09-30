import { motion, type Variants } from "motion/react";
import { AnimatedNumber } from "../AnimatedNumber";
import { RaceWeekTape } from "./RaceWeekTape";
import { data, PHASE_VAR } from "../../lib/chicago-data";
import { fmt1, formatDate } from "../../lib/chicago-format";
import styles from "./Hero.module.css";

const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function Hero() {
  const { meta } = data;
  const phaseColor = `var(${PHASE_VAR[meta.currentPhase] ?? "--p1"})`;
  const weeksToRace = Math.ceil(meta.daysToRace / 7);

  return (
    <header className={styles.hero}>
      <motion.p className="eyebrow" variants={rise} custom={0} initial="hidden" animate="show">
        The road to Chicago
      </motion.p>
      <motion.h1 className={styles.title} variants={rise} custom={1} initial="hidden" animate="show">
        26.2 miles, one&nbsp;build&nbsp;at&nbsp;a&nbsp;time.
      </motion.h1>

      <motion.div className={styles.number} variants={rise} custom={2} initial="hidden" animate="show">
        <AnimatedNumber value={meta.daysToRace} duration={1.4} />
        <span className={styles.unit}>days to the start line</span>
      </motion.div>

      <motion.p className={styles.meta} variants={rise} custom={3} initial="hidden" animate="show">
        {meta.raceName} · {formatDate(meta.raceDate)} · goal <b>{meta.goal}</b> ({meta.goalPace})
      </motion.p>

      <motion.div className={styles.stats} variants={rise} custom={4} initial="hidden" animate="show">
        <div className={styles.stat}>
          <span className={styles.statValue} style={{ color: phaseColor }}>
            {meta.currentPhaseName}
          </span>
          <span className={styles.statLabel}>
            Phase {meta.currentPhase + 1} of {data.phases.length}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>
            Wk {meta.currentWeek}
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
      </motion.div>

      <motion.div variants={rise} custom={5} initial="hidden" animate="show">
        <RaceWeekTape />
      </motion.div>

      <motion.p className={styles.scrollCue} variants={rise} custom={6} initial="hidden" animate="show">
        Scroll for the plan, week by week ↓
      </motion.p>
    </header>
  );
}
