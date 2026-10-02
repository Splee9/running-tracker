import { motion, type Variants } from "motion/react";
import { LookupWalkthrough } from "./LookupWalkthrough";
import { Link } from "../lib/router";
import { data as chicago, raceWeekTape } from "../lib/chicago-data";
import { data, lifetime } from "../lib/data";
import { fmt } from "../lib/format";
import { fmt1, formatDate } from "../lib/chicago-format";
import { MEMBERSHIP_FLOOR_PERCENT } from "../lib/lookupWalkthrough";
import styles from "./Home.module.css";

/**
 * Portfolio home. Case cards are Activity Lookup and the Chicago / training-variability
 * block only.
 *
 * Held — no UI until their own pass:
 * - Prescribe-time Jev / workout library Choice (post-Chicago)
 * - Stimulus labels: debrief → schema → public JSON
 * - Brief-relevance (Daily / Pulse)
 */

const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

const PATTERN = [
  { step: "Problem", text: "Name the decision the product has to make." },
  { step: "Evidence", text: "Code assembles the log fields that bear on it." },
  { step: "Jev", text: "A typed answer and a probability, from TypeSafe." },
  { step: "Policy", text: "Thresholds and what may apply on its own live in code." },
  { step: "You", text: "Calendar and spend stay with the person." },
];

export function Home() {
  const tape = raceWeekTape();
  const tv = chicago.trainingVariability?.head_to_head.chi;
  const current = tape.current;

  return (
    <section className={styles.home}>
      <motion.p className="eyebrow" variants={rise} custom={0} initial="hidden" animate="show">
        Value engineering · Applied AI
      </motion.p>
      <motion.h1 className={styles.title} variants={rise} custom={1} initial="hidden" animate="show">
        Personal ops, with a typed judgment layer.
      </motion.h1>

      <motion.p className={styles.intro} variants={rise} custom={2} initial="hidden" animate="show">
        <b>{fmt(lifetime.runs)}</b> runs since {data.firstRun.slice(0, 4)}. Typed decisions from TypeSafe
        Jev sit on 3,600+ graded activities. Code owns the policy. This is a judgment layer, not a chat
        wrapper.
      </motion.p>

      <motion.ol className={styles.pattern} variants={rise} custom={3} initial="hidden" animate="show">
        {PATTERN.map((item) => (
          <li key={item.step}>
            <span className={styles.patternStep}>{item.step}</span>
            <span className={styles.patternText}>{item.text}</span>
          </li>
        ))}
      </motion.ol>

      <motion.div className={styles.projects} variants={rise} custom={4} initial="hidden" animate="show">
        <h2 className={styles.projectsTitle}>Two cases</h2>
        <div className={styles.projectGrid}>
          <article className={styles.projectCard}>
            <h3 className={styles.projectName}>Activity lookup + confidence</h3>
            <p className={styles.projectDesc}>
              Semantic search over the public log. Code builds the shortlist; Jev scores membership, a
              probability the row is what the ask means. Weak scores rank later and stay listed.
            </p>
            <LookupWalkthrough />
          </article>

          <article className={styles.projectCard}>
            <h3 className={styles.projectName}>Chicago block · training variability</h3>
            <p className={styles.projectDesc}>
              Live ops for the {chicago.meta.raceName.replace("Bank of America ", "")} build. Countdown,
              block miles, and this week's load, plus how steady weekly run hours have been. Load and
              consistency only.
            </p>
            <dl className={styles.facts}>
              <div>
                <dt>Days to race</dt>
                <dd>{tape.daysToRace}</dd>
              </div>
              <div>
                <dt>Block miles</dt>
                <dd>{fmt1(tape.blockMiles)}</dd>
              </div>
              <div>
                <dt>This week</dt>
                <dd>
                  {current
                    ? `${fmt1(current.miles)} mi${current.partial ? " · in progress" : ""}`
                    : "—"}
                </dd>
              </div>
              {tv && (
                <div>
                  <dt>Run variability</dt>
                  <dd>
                    {tv.tv.toFixed(2)} · {tv.band}
                  </dd>
                </div>
              )}
            </dl>
            <p className={styles.factNote}>
              {chicago.trainingVariability
                ? `${chicago.trainingVariability.window_weeks}-week window · updated ${formatDate(chicago.meta.lastUpdated)}.`
                : `Updated ${formatDate(chicago.meta.lastUpdated)}.`}
            </p>
            <p className={styles.cardLinks}>
              <Link href="/chicago">
                Open Chicago <span aria-hidden="true">→</span>
              </Link>
              <Link href="/training">
                Variability <span aria-hidden="true">→</span>
              </Link>
            </p>
          </article>
        </div>
      </motion.div>

      <motion.section
        className={styles.judgment}
        aria-label="Featured judgment"
        variants={rise}
        custom={5}
        initial="hidden"
        animate="show"
      >
        <p className="eyebrow">Featured judgment</p>
        <p className={styles.stub}>Example · not a live call. No weekly judgment feed is published here yet.</p>
        <h2 className={styles.judgmentTitle}>Why this easy day wasn't hills</h2>
        <p className={styles.judgmentBody}>
          A climbing easy day can look like a hills session. The log already separates those ideas:
          hills is a stimulus label, and "hilly" is elevation per kilometre, which code can sort on its
          own.
        </p>
        <ol className={styles.judgmentList}>
          <li>
            <b>Evidence.</b> Primary stimulus, modifiers, and climb per kilometre.
          </li>
          <li>
            <b>Jev.</b> A membership noul — the probability this day is the hills session the question
            means.
          </li>
          <li>
            <b>Policy.</b> Under {MEMBERSHIP_FLOOR_PERCENT}% the weak reading ranks later and stays listed.
            Code leaves an easy label as easy.
          </li>
          <li>
            <b>You.</b> Promoting the day, or writing it onto the calendar, stays manual.
          </li>
        </ol>
      </motion.section>

      <motion.footer className={styles.about} variants={rise} custom={6} initial="hidden" animate="show">
        <p className="eyebrow">About</p>
        <p className={styles.aboutName}>Spencer Lee</p>
        <p className={styles.aboutRole}>Senior Manager, Value Engineering — Applied AI, BMO US</p>
        <p className={styles.aboutStack}>Vite · React · Vercel · TypeSafe Jev · Strava</p>
        <p className={styles.ethics}>
          Shadow, then promote. A downgrade can apply on its own. An upgrade, a send, or a spend never
          goes out silently.
        </p>
        <p className={styles.cardLinks}>
          <a href="https://www.linkedin.com/in/applied-ai-spencer-lee" target="_blank" rel="noreferrer">
            LinkedIn <span aria-hidden="true">→</span>
          </a>
          <Link href="/miles">
            Running log <span aria-hidden="true">→</span>
          </Link>
        </p>
      </motion.footer>
    </section>
  );
}
