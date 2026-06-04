import { motion } from "framer-motion";
import { AnimatedNumber } from "./AnimatedNumber";
import { lifetime } from "../lib/data";
import { fmt } from "../lib/format";
import styles from "./Hero.module.css";

const rise = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function Hero() {
  return (
    <header className={styles.hero}>
      <motion.p className="eyebrow" variants={rise} custom={0} initial="hidden" animate="show">
        A running log
      </motion.p>
      <motion.h1 className={styles.title} variants={rise} custom={1} initial="hidden" animate="show">
        Every mile, since 2018.
      </motion.h1>

      <motion.div className={styles.number} variants={rise} custom={2} initial="hidden" animate="show">
        <AnimatedNumber value={lifetime.miles} duration={1.4} />
        <span className={styles.unit}>miles</span>
      </motion.div>

      <motion.p className={styles.meta} variants={rise} custom={3} initial="hidden" animate="show">
        <b>{fmt(lifetime.runs)}</b> runs · <b>{fmt(lifetime.miles / lifetime.runs)}</b> mi on
        average · still counting.
      </motion.p>

      <motion.p className={styles.scrollCue} variants={rise} custom={4} initial="hidden" animate="show">
        Scroll to see how far that really is ↓
      </motion.p>
    </header>
  );
}
