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
        I'm a runner who can't leave a good number alone. By day I build AI products; before
        sunrise I'm out chasing a marathon time I have no business chasing. Strava can tell me I
        ran seven miles on Tuesday — it can't tell me I've quietly run most of the way around the
        planet. So I built the thing that could: a little pipeline that swallows every run, does
        the arithmetic, and turns a decade of GPS noise into one number I can actually{" "}
        <em>feel</em>. Ex-hockey player, full-time tinkerer, recovering perfectionist. The line up
        there is real, and it's still moving.
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
