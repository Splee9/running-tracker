import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { AnimatedNumber } from "./AnimatedNumber";
import { Chip } from "./Chip";
import { RaceList } from "./RaceLinks";
import { Rich } from "./Rich";
import { data, lifetime, type RaceCounts, type RaceDistance } from "../lib/data";
import { fmt, fmt1 } from "../lib/format";
import { headlineFor } from "../lib/comparisons";
import { readMilesYear } from "../lib/focus";
import { lookupYearHref } from "../lib/links";
import { loggedRaces, raceByKey } from "../lib/loggedRaces";
import type { RaceFocus } from "../lib/races";
import { Link, useSearchString } from "../lib/router";
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

const YEARS = data.years.map((y) => y.year);

type RaceListFilter = "all" | "pr" | RaceDistance;

export function YearChart({
  raceFocus,
  onFocusRace,
}: {
  raceFocus: RaceFocus;
  onFocusRace: (focus: RaceFocus) => void;
}) {
  const search = useSearchString();
  const writtenSearch = useRef(search);
  const [selected, setSelected] = useState<Scope>(() => readMilesYear(window.location.search, YEARS));
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [listFilter, setListFilter] = useState<RaceListFilter>("all");

  useEffect(() => {
    if (search === writtenSearch.current) return;
    writtenSearch.current = search;
    setSelected(readMilesYear(search, YEARS));
  }, [search]);

  function writeYear(scope: Scope) {
    setSelected(scope);
    const params = new URLSearchParams(window.location.search);
    if (scope === "lifetime") params.delete("year");
    else params.set("year", String(scope));
    const qs = params.toString();
    const nextSearch = qs ? `?${qs}` : "";
    const url = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (url !== current) {
      writtenSearch.current = nextSearch;
      window.history.replaceState(window.history.state, "", url);
    }
  }

  function choose(scope: Scope) {
    writeYear(scope);
    setListFilter("all");
    onFocusRace(null);
  }

  // A related race on the list follows that race's year. Chart hovers do not,
  // so scanning markers does not resize the year chart under the cursor.
  useEffect(() => {
    if (!raceFocus?.pin) return;
    const race = raceByKey(raceFocus.key);
    if (!race) return;
    setListFilter("all");
    const current = selectedRef.current;
    if (current !== "lifetime" && current !== race.year) writeYear(race.year);
    // writeYear is stable enough: it only depends on the latest search snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceFocus]);

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
  const inScope = loggedRaces.filter((race) => selected === "lifetime" || race.year === selected);
  const hasPr = inScope.some((race) => race.pr);
  const shownRaces = [...inScope]
    .reverse()
    .filter((race) => {
      if (listFilter === "all") return true;
      if (listFilter === "pr") return race.pr;
      return race.distance === listFilter;
    });
  const pinnedKey = raceFocus?.pin ? raceFocus.key : null;

  function toggleDistance(distance: RaceDistance) {
    setListFilter((current) => (current === distance ? "all" : distance));
  }

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
        {selected !== "lifetime" && (
          <p className={styles.scopeLink}>
            <Link href={lookupYearHref(selected)}>Sessions in {selected}</Link>
          </p>
        )}
      </div>

      <div className={styles.chips} role="group" aria-label="Choose a year">
        <Chip active={selected === "lifetime"} onClick={() => choose("lifetime")}>
          Lifetime
        </Chip>
        {[...data.years].reverse().map((y) => (
          <Chip key={y.year} active={selected === y.year} onClick={() => choose(y.year)}>
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
              onClick={() => choose(y.year)}
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
        <div className={styles.racesHead}>
          <p className={styles.racesLabel}>
            Races {selected === "lifetime" ? "logged" : `in ${selected}`}
          </p>
          {hasPr && (
            <button
              type="button"
              className={`${styles.prToggle} ${listFilter === "pr" ? styles.prToggleOn : ""}`}
              aria-pressed={listFilter === "pr"}
              onClick={() => setListFilter((current) => (current === "pr" ? "all" : "pr"))}
            >
              PRs
            </button>
          )}
        </div>
        {totalRaces === 0 ? (
          <p className={styles.racesEmpty}>No races logged{selected === "lifetime" ? "" : " this year"}.</p>
        ) : (
          <>
            <div className={styles.raceRow}>
              {RACE_KINDS.map((k) => {
                const count = races[k.key];
                const pressed = listFilter === k.key;
                return (
                  <button
                    key={k.key}
                    type="button"
                    className={`${styles.raceStat} ${pressed ? styles.raceStatOn : ""}`}
                    style={{ "--race-color": k.color } as React.CSSProperties}
                    disabled={count === 0}
                    aria-pressed={pressed}
                    onClick={() => toggleDistance(k.key)}
                  >
                    <span
                      className={styles.raceNum}
                      style={{ color: count > 0 ? k.color : "var(--muted)" }}
                    >
                      <AnimatedNumber value={count} duration={0.5} />
                    </span>
                    <span className={styles.raceName}>{k.label}</span>
                  </button>
                );
              })}
            </div>
            <p className={styles.racesNote}>
              A name opens that session. Week, year, and the other races stay linked from here.
            </p>
            {shownRaces.length === 0 ? (
              <p className={styles.racesEmpty}>No races in this set.</p>
            ) : (
              <RaceList
                races={shownRaces}
                pinnedKey={pinnedKey}
                linkedKey={raceFocus?.key ?? null}
                onPin={(key) => onFocusRace({ key, pin: true })}
                onRelate={(key) => onFocusRace({ key, pin: true })}
              />
            )}
          </>
        )}
      </motion.div>
    </section>
  );
}