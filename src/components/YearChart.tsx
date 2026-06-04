import { useState } from "react";
import { motion } from "framer-motion";
import { AnimatedNumber } from "./AnimatedNumber";
import { Magnetic } from "./Magnetic";
import { Rich } from "./Rich";
import { data, lifetime } from "../lib/data";
import { fmt, fmt1 } from "../lib/format";
import { headlineFor } from "../lib/comparisons";
import styles from "./YearChart.module.css";

type Scope = number | "lifetime";

const maxMiles = Math.max(...data.years.map((y) => y.miles));

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
