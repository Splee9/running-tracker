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
        Around twenty-eight hundred miles a year, most of them before the city's awake. Running is
        the thing everything else orbits — when I'm not chasing a fast marathon, I'm out on gravel
        roads. The rest of the time I'm building: AI by trade, and odd little tools like this one
        for the joy of it. Strava logged every mile but never told me what they added up to — that
        I'd run most of the way around the planet. So I built the thing that would. I'd rather a
        number I can <em>feel</em> than one I can only scroll past.
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
