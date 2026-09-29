import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Chip } from "./Chip";
import snapshot from "../activities.json";
import {
  buildIndex,
  formatDuration,
  isRide,
  isRun,
  searchActivities,
  sportLabel,
  type Activity,
  type SearchHit,
} from "../lib/activitySearch";
import styles from "./ActivityLookup.module.css";

type SportFilter = "all" | "run" | "ride" | "other";
type Units = "mi" | "km";
type JevState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "done"; query: string; scores: Record<number, number> }
  | { status: "error"; query: string };

const JEV_ENDPOINT = "/.netlify/functions/jev-rerank";
const JEV_CANDIDATES = 25;
const JEV_DEBOUNCE_MS = 300;
const PAGE_SIZE = 50;

const activities = snapshot.activities as Activity[];
const index = buildIndex(activities);

const SPORT_FILTERS: { key: SportFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "run", label: "Run" },
  { key: "ride", label: "Bike" },
  { key: "other", label: "Other" },
];

const EXAMPLES = ["longest run", "most intervals", "Chicago races", "quality session", "hilly ride", "zwift"];

const rise = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

function matchesSport(a: Activity, filter: SportFilter) {
  if (filter === "all") return true;
  if (filter === "run") return isRun(a);
  if (filter === "ride") return isRide(a);
  return !isRun(a) && !isRide(a);
}

export function ActivityLookup() {
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState<SportFilter>("all");
  const [units, setUnits] = useState<Units>("mi");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [jev, setJev] = useState<JevState>({ status: "idle" });
  // Flips off for the session once the function reports Jev isn't configured.
  const [jevAvailable, setJevAvailable] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const trimmed = query.trim();

  const localHits: SearchHit[] = useMemo(() => {
    if (!trimmed) return [];
    return searchActivities(index, trimmed, 500).filter((h) => matchesSport(h.activity, sport));
  }, [trimmed, sport]);

  const candidateIds = useMemo(
    () => localHits.slice(0, JEV_CANDIDATES).map((h) => h.activity.id),
    [localHits],
  );
  const candidateKey = candidateIds.join(",");

  useEffect(() => {
    if (!jevAvailable || !trimmed || candidateIds.length === 0) {
      setJev({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setJev({ status: "loading", query: trimmed });
      fetch(JEV_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, ids: candidateIds }),
        signal: controller.signal,
      })
        .then((r) => {
          if (r.status === 503 || r.status === 404) {
            setJevAvailable(false);
            return Promise.reject(r.status);
          }
          return r.ok ? r.json() : Promise.reject(r.status);
        })
        .then((data: { scores: Record<number, number> }) =>
          setJev({ status: "done", query: trimmed, scores: data.scores }),
        )
        .catch(() => {
          if (!controller.signal.aborted) setJev({ status: "error", query: trimmed });
        });
    }, JEV_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // candidateKey stands in for candidateIds so identical shortlists don't refetch.
  }, [jevAvailable, trimmed, candidateKey]);

  const jevScores = jev.status === "done" && jev.query === trimmed ? jev.scores : null;

  const results = useMemo(() => {
    if (!trimmed) {
      return activities
        .filter((a) => matchesSport(a, sport))
        .map((activity): SearchHit => ({ activity, score: 0, kind: "keyword", matched: [] }));
    }
    if (!jevScores) return localHits;
    const reranked = localHits
      .filter((h) => jevScores[h.activity.id] !== undefined)
      .sort((a, b) => jevScores[b.activity.id] - jevScores[a.activity.id]);
    const rest = localHits.filter((h) => jevScores[h.activity.id] === undefined);
    return [...reranked, ...rest];
  }, [trimmed, sport, localHits, jevScores]);

  useEffect(() => setVisible(PAGE_SIZE), [trimmed, sport]);

  const shown = results.slice(0, visible);

  let status: string;
  if (!trimmed) status = `${results.length.toLocaleString()} activities · most recent first`;
  else if (results.length === 0) status = `No activities match “${trimmed}”`;
  else {
    const jevNote = !jevAvailable
      ? ""
      : jevScores
        ? ` · top ${Math.min(results.length, JEV_CANDIDATES)} reranked by Jev`
        : jev.status === "error"
          ? " · Jev unavailable"
          : " · Jev reranking…";
    status = `${results.length.toLocaleString()} match${results.length === 1 ? "" : "es"} · keyword + fuzzy${jevNote}`;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <motion.p className="eyebrow" variants={rise} custom={0} initial="hidden" animate="show">
          Activity lookup
        </motion.p>
        <motion.h1 className={styles.title} variants={rise} custom={1} initial="hidden" animate="show">
          Find any session.
        </motion.h1>
        <motion.p className={styles.intro} variants={rise} custom={2} initial="hidden" animate="show">
          Search every logged activity by name, stimulus, place, or workout type. Keyword and fuzzy
          matching run as you type; then <b>Jev</b> reranks the shortlist by what you meant, not
          just what you typed. Try superlatives like "longest run" or "most intervals", or combine
          place with type like "Chicago races".
        </motion.p>
      </header>

      <motion.section variants={rise} custom={3} initial="hidden" animate="show" aria-label="Search activities">
        <div className={styles.searchWrap}>
          <label htmlFor="activity-search" className="sr-only">
            Search activities
          </label>
          <input
            ref={inputRef}
            id="activity-search"
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder={`Search ${activities.length.toLocaleString()} activities…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={styles.search}
          />
          <kbd className={styles.kbd}>/</kbd>
        </div>
        {!trimmed && (
          <div className={styles.examples}>
            <span>Try</span>
            {EXAMPLES.map((ex) => (
              <Chip key={ex} active={false} onClick={() => setQuery(ex)}>
                {ex}
              </Chip>
            ))}
          </div>
        )}

        <div className={styles.controls}>
          <div className={styles.chips} role="group" aria-label="Filter by sport">
            {SPORT_FILTERS.map((f) => (
              <Chip key={f.key} active={sport === f.key} onClick={() => setSport(f.key)}>
                {f.label}
              </Chip>
            ))}
          </div>
          <div className={styles.units} role="group" aria-label="Units">
            {(["mi", "km"] as Units[]).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={units === u}
                className={`${styles.unit} ${units === u ? styles.unitActive : ""}`}
                onClick={() => setUnits(u)}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <p className={styles.status} role="status">
          {status}
        </p>

        {shown.length > 0 && (
          <ul className={styles.list}>
            {shown.map((hit) => (
              <ActivityRow
                key={hit.activity.id}
                hit={hit}
                units={units}
                showMatch={Boolean(trimmed)}
                jevScore={jevScores?.[hit.activity.id]}
              />
            ))}
          </ul>
        )}

        {results.length > visible && (
          <div className={styles.more}>
            <button type="button" className={styles.moreButton} onClick={() => setVisible((v) => v + PAGE_SIZE)}>
              Show more · {(results.length - visible).toLocaleString()} left
            </button>
          </div>
        )}
      </motion.section>

      <footer className={styles.footer}>
        <p>
          Public activities only, rebuilt from the Strava log. Names, dates, distance, time,
          elevation, stimulus, place and intervals — no routes, polylines or heart-rate data.
        </p>
      </footer>
    </div>
  );
}

function ActivityRow({
  hit,
  units,
  showMatch,
  jevScore,
}: {
  hit: SearchHit;
  units: Units;
  showMatch: boolean;
  jevScore?: number;
}) {
  const a = hit.activity;
  const date = new Date(a.start_date_local.replace(/Z$/, ""));
  const dist = units === "mi" ? a.distance_m / 1609.344 : a.distance_m / 1000;
  const elev = units === "mi" ? Math.round(a.elevation_gain_m * 3.28084) : a.elevation_gain_m;

  let pace = "";
  if (a.distance_m > 0 && a.moving_time_s > 0) {
    pace = isRun(a)
      ? `${formatDuration(Math.round(a.moving_time_s / dist))} /${units}`
      : `${(dist / (a.moving_time_s / 3600)).toFixed(1)} ${units === "mi" ? "mph" : "km/h"}`;
  }

  // Build enrichment chips
  const enrichmentChips: string[] = [];
  if (a.place) enrichmentChips.push(a.place);
  if (a.primary_stimulus && !["other", "easy"].includes(a.primary_stimulus)) {
    enrichmentChips.push(a.primary_stimulus);
  }
  if (a.has_intervals) {
    const intervalLabel = a.hard_lap_count ? `${a.hard_lap_count} hard laps` : "intervals";
    enrichmentChips.push(intervalLabel);
  }

  return (
    <li className={styles.row}>
      <a
        href={`https://www.strava.com/activities/${a.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.rowLink}
      >
        <span className={styles.date}>
          <b>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</b>
          {date.getFullYear()}
        </span>
        <span style={{ minWidth: 0 }}>
          <span className={styles.name} style={{ display: "block" }}>
            {a.name}
          </span>
          <span className={styles.meta}>
            <span className={styles.sport}>{sportLabel(a.sport_type)}</span>
            {a.distance_m > 0 && (
              <span>
                {dist.toFixed(dist >= 100 ? 0 : 1)} {units}
              </span>
            )}
            <span>{formatDuration(a.moving_time_s)}</span>
            {pace && <span>{pace}</span>}
            {elev > 0 && (
              <span>
                {elev.toLocaleString()} {units === "mi" ? "ft" : "m"}
              </span>
            )}
            {enrichmentChips.map((chip, i) => (
              <span key={i} style={{ opacity: 0.7, fontStyle: "italic" }}>
                {chip}
              </span>
            ))}
          </span>
        </span>
        {showMatch && (
          <span className={styles.badges}>
            <span className={`${styles.badge} ${hit.kind === "keyword" ? styles.badgeKeyword : ""}`}>
              {hit.kind}
            </span>
            {jevScore !== undefined && (
              <span
                className={`${styles.badge} ${styles.badgeJev}`}
                style={{ background: jevScore >= 0.7 ? "#1f9d6b" : jevScore >= 0.4 ? "#c98a1a" : "#8a8a82" }}
                title="Jev's calibrated probability that this activity matches your search"
              >
                Jev {Math.round(jevScore * 100)}%
              </span>
            )}
          </span>
        )}
      </a>
    </li>
  );
}
