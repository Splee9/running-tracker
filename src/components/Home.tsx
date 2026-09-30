import { motion, type Variants } from "motion/react";
import { Link } from "../lib/router";
import { LatestRun } from "./LatestRun";
import styles from "./Home.module.css";

const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function Home() {
  return (
    <section className={styles.home}>
      <motion.p className="eyebrow" variants={rise} custom={0} initial="hidden" animate="show">
        Personal projects
      </motion.p>
      <motion.h1 className={styles.title} variants={rise} custom={1} initial="hidden" animate="show">
        Spencer Lee
      </motion.h1>

      <motion.p className={styles.intro} variants={rise} custom={2} initial="hidden" animate="show">
        Building tools to track training, visualize progress, and stay consistent. Currently
        focused on running — lifetime mileage, training variability, and marathon builds.
      </motion.p>

      <motion.div variants={rise} custom={3} initial="hidden" animate="show">
        <LatestRun />
      </motion.div>

      <motion.div className={styles.projects} variants={rise} custom={4} initial="hidden" animate="show">
        <h2 className={styles.projectsTitle}>Training</h2>
        <div className={styles.projectGrid}>
          <Link href="/miles" className={styles.projectCard}>
            <h3 className={styles.projectName}>Running log</h3>
            <p className={styles.projectDesc}>
              Every mile since 2018 — lifetime stats, yearly breakdowns, and distance
              comparisons.
            </p>
            <span className={styles.projectArrow}>→</span>
          </Link>

          <Link href="/training" className={styles.projectCard}>
            <h3 className={styles.projectName}>Training variability</h3>
            <p className={styles.projectDesc}>
              Tracking weekly mileage consistency to spot patterns, manage load, and stay
              healthy.
            </p>
            <span className={styles.projectArrow}>→</span>
          </Link>

          <Link href="/activity-lookup" className={styles.projectCard}>
            <h3 className={styles.projectName}>Activity lookup</h3>
            <p className={styles.projectDesc}>
              Search every logged session by name, type, distance or date — typo-tolerant and
              reranked by Jev.
            </p>
            <span className={styles.projectArrow}>→</span>
          </Link>

          <Link href="/training/chicago" className={styles.projectCard}>
            <h3 className={styles.projectName}>Chicago build</h3>
            <p className={styles.projectDesc}>
              23-week marathon training plan with weekly progress and race-day countdown.
            </p>
            <span className={styles.projectArrow}>→</span>
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
