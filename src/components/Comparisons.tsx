import { motion } from "framer-motion";
import { Rich } from "./Rich";
import { lifetime } from "../lib/data";
import { cardsFor, headlineFor } from "../lib/comparisons";
import styles from "./Comparisons.module.css";

const reveal = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function Comparisons() {
  const cards = cardsFor(lifetime.miles);
  return (
    <section className={styles.section} aria-label="What that distance looks like">
      <p className="eyebrow">What that distance looks like</p>

      <motion.h2
        className={styles.headline}
        variants={reveal}
        custom={0}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-15%" }}
      >
        <Rich text={headlineFor(lifetime.miles)} />
      </motion.h2>

      <div className={styles.cards}>
        {cards.map((c, i) => (
          <motion.div
            key={c.desc}
            className={styles.card}
            variants={reveal}
            custom={i + 1}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-12%" }}
          >
            <div className={styles.big}>{c.big}</div>
            <div className={styles.desc}>{c.desc}</div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
