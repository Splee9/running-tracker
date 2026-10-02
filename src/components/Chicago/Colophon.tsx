import { motion, type Variants } from "motion/react";
import styles from "./Colophon.module.css";

const reveal: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export function Colophon() {
  return (
    <motion.section
      className={styles.section}
      aria-label="Why this exists"
      variants={reveal}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-15%" }}
    >
      <p className="eyebrow">About this build</p>
      <p className={styles.body}>
        One marathon a year I try to run faster than the last. This is the Chicago block — 23 weeks
        of deliberate work toward a <em>sub-2:42</em>, laid out the way I actually think about it:
        phases, weekly load, what kind of running each week was, and how it all stacks up against
        every build before it. I'm an AI builder by trade and a tinkerer by habit, so the training
        log became a small web app. The line's still climbing.
      </p>
      <p className={styles.byline}>
        — Spencer Lee · Senior Manager, Value Engineering — Applied AI, BMO US ·{" "}
        <a href="https://www.linkedin.com/in/applied-ai-spencer-lee" target="_blank" rel="noreferrer">
          linkedin.com/in/applied-ai-spencer-lee
        </a>
      </p>
    </motion.section>
  );
}
