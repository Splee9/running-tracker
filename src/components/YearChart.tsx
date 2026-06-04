import { useState } from "react";
import { motion } from "framer-motion";
import { AnimatedNumber } from "./AnimatedNumber";
import { Magnetic } from "./Magnetic";
import { Rich } from "./Rich";
import { data, lifetime, type RaceCounts } from "../lib/data";
import { fmt, fmt1 } from "../lib/format";
import { headlineFor } from "../lib/comparisons";
import styles from "./YearChart.module.css";

type Scope = number | "lifetime";

const maxMiles = Math.max(...data.years.map((y) => y.miles));

const RACE_KINDS: { key: keyof RaceCounts; label: string; color: string }[] = [
  { key: "marathon", label: "Marathons", color: "#c0432f" },
  { key: "half", label: "Halves", color: "#1f7a5c" },
  { key: "10K", label: "10Ks", color: "#2f6db0" },
  { key: "5K", label: "5Ks", color: "#8a5a9e" },
];

const EMPTY_RACES: RaceCounts = { marathon: 0, half: 0, "10K": 0, "5K": 0 };

const lifetimeRaces: RaceCounts = data.years.reduce(
  (acc, y) => ({
    marathon: acc.marathon + y.races.marathon,
    half: acc.half + y.races.half,
    "10K": acc["10K"] + y.races["10K"],
    "5K": acc["5K"] + y.races["5K"],
  }),
  { ...EMPTY_RACES },
);

export function YearChart() {
  const [selected, setSelected] = useState<Scope>("lifetime");

  const scope =
    selected === "lifetime"
      ? { label: "Lifetime", miles: lifetime.miles, runs: lifetime.runs, partial: false }
      : (() => {
          const d = data.years.find((y) => y.year === selected)!;
          return { label: String(d.year), miles: d.miles, runs: d.runs, partial: d.partial };
        })();

  const avg = scope.miles / scope.runs;

  const races =
    selected === "lifetime"
      ? lifetimeRaces
      : data.years.find((y) => y.year === selected)?.races ?? EMPTY_RACES;
  const totalRaces = RACE_KINDS.reduce((sum, k) => sum + races[k.key], 0);

  return (
    <section className={styles.section} aria-label="Mileage by year">
      <p className="eyebrow">By the year</p>

      <div className={styles.scope}>
        <div className={styles.scopeNum}>
          <AnimatedNumber value={scope.miles} />
          <span className={styles.scopeUnit}>miles</span>
        </div>
        <p className={styles.scopeMeta}>
          {scope.label}
          {scope.partial && " · YTD"} · <b>{fmt(scope.runs)}</b> runs ·{" "}
          <b>{selected === "lifetime" ? fmt(avg) : fmt1(avg)}</b> mi avg
          {scope.partial && (
            <>
              {" "}
              · on pace for <b>{fmt(scope.miles / data.ytdFraction)}</b>
            </>
          )}
        </p>
        <p className={styles.scopeHeadline} aria-live="polite">
          <Rich text={headlineFor(scope.miles)} />
        </p>
      </div>

      <div className={styles.chips} role="group" aria-label="Choose a year">
        <Chip active={selected === "lifetime"} onClick={() => setSelected("lifetime")}>
          Lifetime
        </Chip>
        {[...data.years].reverse().map((y) => (
          <Chip key={y.year} active={selected === y.year} onClick={() => setSelected(y.year)}>
            {y.year}
            {y.partial ? " · YTD" : ""}
          </Chip>
        ))}
      </div>

      <div className={styles.chart}>
        {data.years.map((y) => {
          const active = selected === y.year;
          return (
            <button
              key={y.year}
              type="button"
              className={`${styles.col} ${active ? styles.colActive : ""}`}
              onClick={() => setSelected(y.year)}
              aria-label={`${y.year}: ${fmt(y.miles)} miles`}
            >
              <span className={styles.val}>{fmt(y.miles)}</span>
              <div className={styles.barTrack} style={{ height: `${(y.miles / maxMiles) * 100}%` }}>
                <motion.div
                  className={styles.bar}
                  initial={{ scaleY: 0 }}
                  whileInView={{ scaleY: 1 }}
                  viewport={{ once: true, margin: "-12%" }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <span className={styles.xlabel}>’{String(y.year).slice(2)}</span>
            </button>
          );
        })}
      </div>

      <motion.div
        key={String(selected)}
        className={styles.races}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className={styles.racesLabel}>
          Races {selected === "lifetime" ? "logged" : `in ${selected}`}
        </p>
        {totalRaces === 0 ? (
          <p className={styles.racesEmpty}>No races logged{selected === "lifetime" ? "" : " this year"}.</p>
        ) : (
          <div className={styles.raceRow}>
            {RACE_KINDS.map((k) => {
              const count = races[k.key];
              return (
                <div
                  key={k.key}
                  className={styles.raceStat}
                  style={{ "--race-color": k.color } as React.CSSProperties}
                >
                  <span
                    className={styles.raceNum}
                    style={{ color: count > 0 ? k.color : "var(--muted)" }}
                  >
                    <AnimatedNumber value={count} duration={0.5} />
                  </span>
                  <span className={styles.raceName}>{k.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Magnetic strength={0.25}>
      <button
        type="button"
        className={`${styles.chip} ${active ? styles.chipActive : ""}`}
        onClick={onClick}
        aria-pressed={active}
      >
        {children}
      </button>
    </Magnetic>
  );
}
