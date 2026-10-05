import { useState } from "react";
import { motion } from "motion/react";
import { AnimatedNumber } from "./AnimatedNumber";
import { RaceList } from "./RaceLinks";
import { data, type RaceCounts, type RaceDistance } from "../lib/data";
import { loggedRaces } from "../lib/loggedRaces";
import type { RaceFocus } from "../lib/races";
import type { MilesScope } from "../hooks/useMilesYear";
import styles from "./RaceLog.module.css";

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

type RaceListFilter = "all" | "pr" | RaceDistance;

/** Races for the year the hero has selected. A distance or PRs narrows the cards. */
export function RaceLog({
  selected,
  raceFocus,
  onFocusRace,
}: {
  selected: MilesScope;
  raceFocus: RaceFocus;
  onFocusRace: (focus: RaceFocus) => void;
}) {
  const [listFilter, setListFilter] = useState<RaceListFilter>("all");
  // A new year starts unfiltered.
  const [filterYear, setFilterYear] = useState(selected);
  if (filterYear !== selected) {
    setFilterYear(selected);
    setListFilter("all");
  }

  const races =
    selected === "lifetime"
      ? lifetimeRaces
      : data.years.find((y) => y.year === selected)?.races ?? EMPTY_RACES;
  const totalRaces = RACE_KINDS.reduce((sum, k) => sum + races[k.key], 0);
  const inScope = loggedRaces.filter((race) => selected === "lifetime" || race.year === selected);
  const prCount = inScope.filter((race) => race.pr).length;
  const shownRaces = [...inScope]
    .reverse()
    .filter((race) => {
      if (listFilter === "all") return true;
      if (listFilter === "pr") return race.pr;
      return race.distance === listFilter;
    });
  const pinnedKey = raceFocus?.pin ? raceFocus.key : null;

  function toggle(filter: RaceListFilter) {
    setListFilter((current) => (current === filter ? "all" : filter));
  }

  return (
    <section className={styles.section} aria-label="Races">
      <div className={styles.head}>
        <p className="eyebrow">Races {selected === "lifetime" ? "logged" : `in ${selected}`}</p>
        {prCount > 0 && (
          <button
            type="button"
            className={`${styles.pill} ${listFilter === "pr" ? styles.pillOn : ""}`}
            aria-pressed={listFilter === "pr"}
            onClick={() => toggle("pr")}
          >
            PRs <span className={styles.pillCount}>{prCount}</span>
          </button>
        )}
      </div>

      <motion.div
        key={String(selected)}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        {totalRaces === 0 ? (
          <p className={styles.empty}>No races logged{selected === "lifetime" ? "" : " this year"}.</p>
        ) : (
          <>
            <div className={styles.statRow}>
              {RACE_KINDS.map((k) => {
                const count = races[k.key];
                const pressed = listFilter === k.key;
                return (
                  <button
                    key={k.key}
                    type="button"
                    className={`${styles.stat} ${pressed ? styles.statOn : ""}`}
                    style={{ "--race-color": k.color } as React.CSSProperties}
                    disabled={count === 0}
                    aria-pressed={pressed}
                    onClick={() => toggle(k.key)}
                  >
                    <span className={styles.statNum} style={{ color: count > 0 ? k.color : "var(--muted)" }}>
                      <AnimatedNumber value={count} duration={0.5} />
                    </span>
                    <span className={styles.statName}>{k.label}</span>
                  </button>
                );
              })}
            </div>
            {shownRaces.length === 0 ? (
              <p className={styles.empty}>No races in this set.</p>
            ) : (
              <RaceList
                races={shownRaces}
                pinnedKey={pinnedKey}
                linkedKey={raceFocus?.key ?? null}
                onPin={(key) => onFocusRace(pinnedKey === key ? null : { key, pin: true })}
                onRelate={(key) => onFocusRace({ key, pin: true })}
              />
            )}
          </>
        )}
      </motion.div>
    </section>
  );
}
