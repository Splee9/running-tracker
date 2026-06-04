import { motion } from "framer-motion";
import styles from "./Colophon.module.css";

const reveal = {
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
      <p className="eyebrow">Why this exists</p>
      <p className={styles.body}>
        Runner, builder, perpetual tinkerer. I put in miles before sunrise — fast marathons, gravel
        roads — and spend a lot of my time building: AI by trade, and odd little tools like this
        one for the joy of it. A decade of running deserved more than a total buried in an app. So
        here it is: every mile, stacked end to end, turned into something I can <em>feel</em>. The
        line's still moving.
      </p>
      <p className={styles.byline}>
        — Spencer Lee ·{" "}
        <a href="https://www.linkedin.com/in/applied-ai-spencer-lee" target="_blank" rel="noreferrer">
          linkedin.com/in/applied-ai-spencer-lee
        </a>
      </p>
    </motion.section>
  );
}
