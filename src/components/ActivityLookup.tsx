import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Chip } from "./Chip";
import snapshot from "../activities.json";
import {
  buildIndex,
  classifyIntent,
  formatDuration,
  isRide,
  isRun,
  searchActivities,
  selectJevCandidates,
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
const JEV_CONFIDENCE_FLOOR = 0.55; // Only reorder when max score >= this threshold
const PAGE_SIZE = 50;

const activities = snapshot.activities as Activity[];
const index = buildIndex(activities);

const SPORT_FILTERS: { key: SportFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "run", label: "Run" },
  { key: "ride", label: "Bike" },
  { key: "other", label: "Other" },
];

const EXAMPLES = ["longest run", "fastest run in Chicago", "speedy runs", "most intervals", "Chicago races", "hilly ride"];

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

  const intentClassification = useMemo(() => {
    if (!trimmed) return null;
    return classifyIntent(trimmed);
  }, [trimmed]);

  const localHits: SearchHit[] = useMemo(() => {
    if (!trimmed) return [];
    return searchActivities(index, trimmed, 500).filter((h) => matchesSport(h.activity, sport));
  }, [trimmed, sport]);

  const candidateIds = useMemo(
    () => selectJevCandidates(localHits, intentClassification, JEV_CANDIDATES),
    [localHits, intentClassification],
  );
  const candidateKey = candidateIds.join(",");

  // Score every shortlist. Metric and date lists keep their order.
  // Place-scoped fastest/longest may be reordered when Jev is confident.
  const shouldScoreWithJev = jevAvailable;

  useEffect(() => {
    if (!shouldScoreWithJev || !trimmed || candidateIds.length === 0) {
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
  }, [shouldScoreWithJev, trimmed, candidateKey]);

  const jevScores = jev.status === "done" && jev.query === trimmed ? jev.scores : null;

  // Check if Jev confidence is below floor (for badge dimming)
  const jevLowConfidence = useMemo(() => {
    if (!jevScores) return false;
    const maxScore = Math.max(...Object.values(jevScores));
    return maxScore < JEV_CONFIDENCE_FLOOR;
  }, [jevScores]);

  const results = useMemo(() => {
    if (!trimmed) {
      return activities
        .filter((a) => matchesSport(a, sport))
        .map((activity): SearchHit => ({ activity, score: 0, kind: "keyword", matched: [] }));
    }
    // Metric and date order stays put. Place-scoped fastest/longest lets Jev
    // reorder once a score clears the floor, because city text is often missing.
    const jevCanReorder = Boolean(intentClassification?.jevRanks);
    if ((intentClassification?.isDeterministic && !jevCanReorder) || !jevScores) return localHits;
    
    // Check if any Jev score meets the confidence floor
    const maxScore = Math.max(...Object.values(jevScores));
    const shouldReorder = maxScore >= JEV_CONFIDENCE_FLOOR;
    
    if (!shouldReorder) {
      // Below confidence floor: keep keyword/fuzzy order, Jev badges shown but muted
      return localHits;
    }

    // Place queries: only lift hits Jev is sure about. Everything else keeps
    // place-then-distance order, so a low score cannot bury a Chicago run
    // that did not fit in the scoring window.
    if (jevCanReorder) {
      const strong = localHits
        .filter((h) => jevScores[h.activity.id] >= JEV_CONFIDENCE_FLOOR)
        .sort((a, b) => jevScores[b.activity.id] - jevScores[a.activity.id]);
      const strongIds = new Set(strong.map((h) => h.activity.id));
      const rest = localHits.filter((h) => !strongIds.has(h.activity.id));
      return [...strong, ...rest];
    }
    
    // Above confidence floor: apply Jev reranking
    const reranked = localHits
      .filter((h) => jevScores[h.activity.id] !== undefined)
      .sort((a, b) => jevScores[b.activity.id] - jevScores[a.activity.id]);
    const rest = localHits.filter((h) => jevScores[h.activity.id] === undefined);
    return [...reranked, ...rest];
  }, [trimmed, sport, localHits, jevScores, intentClassification]);

  useEffect(() => setVisible(PAGE_SIZE), [trimmed, sport]);

  const shown = results.slice(0, visible);

  let status: string;
  if (!trimmed) {
    status = `${results.length.toLocaleString()} activities · most recent first`;
  } else if (results.length === 0) {
    status = `No activities match "${trimmed}"`;
  } else if (intentClassification?.isDeterministic) {
    // Deterministic intent status
    const intent = intentClassification.intent;
    const whereBits = [intentClassification.place, intentClassification.weekday].filter(Boolean);
    const where = whereBits.length > 0 ? ` · ${whereBits.join(" · ")}` : "";
    if (intent) {
      if (intent.kind === "longest") {
        status = `${results.length.toLocaleString()} match${results.length === 1 ? "" : "es"}${where} · sorted by distance`;
      } else if (intent.kind === "fastest") {
        const band = intentClassification.distanceBand;
        status = band
          ? `${results.length.toLocaleString()} match${results.length === 1 ? "" : "es"}${where} · ${band.label} · sorted by time`
          : `${results.length.toLocaleString()} match${results.length === 1 ? "" : "es"}${where} · sorted by pace`;
      } else if (intent.kind === "most_intervals") {
        status = `${results.length.toLocaleString()} match${results.length === 1 ? "" : "es"} · sorted by interval intensity`;
      } else if (intent.kind === "hilliest") {
        status = `${results.length.toLocaleString()} match${results.length === 1 ? "" : "es"} · sorted by elevation`;
      } else if (intent.kind === "highest_hr") {
        status = `${results.length.toLocaleString()} match${results.length === 1 ? "" : "es"} · sorted by heart rate`;
      } else if (intent.kind === "highest_power") {
        status = `${results.length.toLocaleString()} match${results.length === 1 ? "" : "es"} · sorted by power`;
      } else if (intent.kind === "place_filter") {
        status = `${results.length.toLocaleString()} match${results.length === 1 ? "" : "es"} · filtered by place${intent.filterType ? ` and ${intent.filterType}` : ""}`;
      } else if (intent.kind === "mmp_power") {
        const durationLabels: Record<string, string> = {
          best_watts_5s: "5s",
          best_watts_1m: "1min",
          best_watts_5m: "5min",
          best_watts_20m: "20min",
          best_watts_60m: "60min",
        };
        status = `${results.length.toLocaleString()} match${results.length === 1 ? "" : "es"} · sorted by ${durationLabels[intent.field]} power`;
      } else if (intent.kind === "list") {
        status = `${results.length.toLocaleString()} activit${results.length === 1 ? "y" : "ies"}${where} · most recent first`;
      } else {
        status = `${results.length.toLocaleString()} match${results.length === 1 ? "" : "es"} · deterministic sort`;
      }
    } else {
      status = `${results.length.toLocaleString()} match${results.length === 1 ? "" : "es"}`;
    }
    if (jevAvailable) {
      if (intentClassification.jevRanks) {
        if (jevScores) {
          const maxScore = Math.max(...Object.values(jevScores));
          status +=
            maxScore >= JEV_CONFIDENCE_FLOOR
              ? ` · top ${Math.min(results.length, JEV_CANDIDATES)} reranked by Jev`
              : " · Jev confidence low, not reordering";
        } else if (jev.status === "error" && jev.query === trimmed) status += " · Jev unavailable";
        else if (candidateIds.length > 0) status += " · Jev reranking…";
      } else if (jevScores) status += " · Jev scored";
      else if (jev.status === "error" && jev.query === trimmed) status += " · Jev unavailable";
      else if (candidateIds.length > 0) status += " · scoring with Jev";
    }
  } else {
    // Semantic search with optional Jev
    const jevNote = !jevAvailable
      ? ""
      : jevScores
        ? (() => {
            const maxScore = Math.max(...Object.values(jevScores));
            return maxScore >= JEV_CONFIDENCE_FLOOR
              ? ` · top ${Math.min(results.length, JEV_CANDIDATES)} reranked by Jev`
              : ` · Jev confidence low, not reordering`;
          })()
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
          matching run as you type. <b>Jev</b> then scores the shortlist. Metric searches such as
          "longest run" or "fastest 10k" keep that order; other searches rerank when Jev is confident.
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
                jevLowConfidence={jevLowConfidence}
                metricOrder={Boolean(intentClassification?.isDeterministic)}
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
          elevation, HR, pace, power, stimulus, place and intervals — no routes, polylines or stream data.
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
  jevLowConfidence,
  metricOrder,
}: {
  hit: SearchHit;
  units: Units;
  showMatch: boolean;
  jevScore?: number;
  jevLowConfidence?: boolean;
  metricOrder?: boolean;
}) {
  const a = hit.activity;
  const date = new Date(a.start_date_local.replace(/Z$/, ""));
  const dist = units === "mi" ? a.distance_m / 1609.344 : a.distance_m / 1000;
  const elev = units === "mi" ? Math.round(a.elevation_gain_m * 3.28084) : a.elevation_gain_m;

  // Calculate pace from distance and moving_time, or use average_speed if available
  let pace = "";
  if (a.distance_m > 0 && a.moving_time_s > 0) {
    const speedMps = a.average_speed ?? (a.distance_m / a.moving_time_s);
    if (isRun(a)) {
      // For runs, show pace in min/mi or min/km
      const metersPerUnit = units === "mi" ? 1609.344 : 1000;
      const secondsPerUnit = metersPerUnit / speedMps;
      pace = `${formatDuration(Math.round(secondsPerUnit))} /${units}`;
    } else if (isRide(a)) {
      // For rides, show speed in mph or km/h
      const speedKmh = speedMps * 3.6;
      const speed = units === "mi" ? speedKmh / 1.60934 : speedKmh;
      pace = `${speed.toFixed(1)} ${units === "mi" ? "mph" : "km/h"}`;
    }
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
  // Add power data for rides
  if (isRide(a)) {
    if (a.best_watts_20m) enrichmentChips.push(`${a.best_watts_20m}W 20min`);
    else if (a.weighted_average_watts) enrichmentChips.push(`${a.weighted_average_watts}W avg`);
    else if (a.average_watts) enrichmentChips.push(`${a.average_watts}W avg`);
  }

  // v3 metrics: HR and power
  const v3Chips: string[] = [];
  if (a.average_heartrate) {
    const hrLabel = a.max_heartrate 
      ? `${Math.round(a.average_heartrate)} bpm (max ${Math.round(a.max_heartrate)})`
      : `${Math.round(a.average_heartrate)} bpm`;
    v3Chips.push(hrLabel);
  }
  if ((a.average_watts || a.weighted_average_watts) && isRide(a)) {
    const watts = Math.round(a.weighted_average_watts ?? a.average_watts ?? 0);
    const powerLabel = a.weighted_average_watts ? `${watts}W (w)` : `${watts}W`;
    v3Chips.push(powerLabel);
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
            {v3Chips.map((chip, i) => (
              <span key={`v3-${i}`} style={{ opacity: 0.85, fontWeight: 500 }}>
                {chip}
              </span>
            ))}
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
                style={{ 
                  background:
                    jevScore >= 0.7
                      ? "var(--status-good)"
                      : jevScore >= 0.4
                        ? "var(--status-warn)"
                        : "var(--status-neutral)",
                  opacity: jevLowConfidence ? 0.5 : 1
                }}
                title={
                  metricOrder
                    ? "Jev match score. This list stays in metric order."
                    : jevLowConfidence
                      ? "Jev's calibrated probability (low confidence - not used for ranking)"
                      : "Jev's calibrated probability that this activity matches your search"
                }
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
