import { useEffect, useMemo, useRef, useState } from "react";
import { motion, type Variants } from "motion/react";
import { Chip } from "./Chip";
import snapshot from "../activities.json";
import gradeFile from "../activity-grades.json";
import {
  applyJevIntent,
  buildIndex,
  classifyIntent,
  formatDuration,
  intentHardKey,
  isRide,
  isRun,
  MEMBERSHIP_DEMOTE_BELOW,
  rankGradeFor,
  rerankUnlockedHits,
  searchActivities,
  settledIntentPayload,
  sportLabel,
  structuredPlaceText,
  type Activity,
  type IntentClassification,
  type IntentFacets,
  type MembershipCompanions,
  type SearchHit,
  parseRemovedParts,
  withGrades,
  withoutParts,
  type ActivityGrades,
  type IntentPartKey,
} from "../lib/activitySearch";
import { calendarLabel, holidayOf } from "../lib/calendar";
import {
  formatHours,
  interpretationParts,
  lookupStatus,
  mergeMachineWindow,
  orderHits,
  primaryHits,
  resultTotals,
  USER_ORDERS,
  type UserOrder,
} from "../lib/lookupView";
import { stimulusDecision } from "../lib/stimulusDecision";
import { useSearchString } from "../lib/router";
import { machineWindow, inDayWindow, type DayWindow } from "../lib/week";
import { StimulusDecisionPanel } from "./StimulusDecision";
import styles from "./ActivityLookup.module.css";

type SportFilter = "all" | "run" | "ride" | "other";
type Units = "mi" | "km";
type JevState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "done"; query: string; scores: Record<number, number>; companions: MembershipCompanions }
  | { status: "error"; query: string };

const JEV_ENDPOINT = "/api/jev-rerank";
const JEV_CANDIDATES = 25;
const JEV_DEBOUNCE_MS = 300;
const PAGE_SIZE = 50;

const activities = withGrades(snapshot.activities as Activity[], gradeFile as ActivityGrades);
const standoutGraded = activities.some((a) => a.standout !== undefined);
const index = buildIndex(activities);

const SPORT_FILTERS: { key: SportFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "run", label: "Run" },
  { key: "ride", label: "Bike" },
  { key: "other", label: "Other" },
];

const EXAMPLES = [
  "longest run",
  "fastest run in Chicago",
  "easy runs last week",
  "interval workouts 2024",
  "speedy runs",
  "most intervals",
  "Chicago races",
  "hilly ride",
];

const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const sport = params.get("sport");
  const removed = parseRemovedParts(params.get("drop")?.split(",") ?? []);
  return {
    query: params.get("q") ?? "",
    sport: (SPORT_FILTERS.some((f) => f.key === sport) ? sport : "all") as SportFilter,
    units: (params.get("u") === "km" ? "km" : "mi") as Units,
    order: (USER_ORDERS.find((o) => o.key === params.get("sort"))?.key ?? "match") as UserOrder,
    removed,
    // Match kind and branch are for tuning. ?debug=1 shows them on each row.
    debug: params.has("debug"),
    activity: activityId(params.get("activity")),
    // A removed dates chip drops the machine window too, even if the URL still has it
    // for the instant before the write effect cleans the params.
    window: removed.includes("dates") ? null : machineWindow(params.get("from"), params.get("to")),
  };
}

function activityId(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function matchesSport(a: Activity, filter: SportFilter) {
  if (filter === "all") return true;
  if (filter === "run") return isRun(a);
  if (filter === "ride") return isRide(a);
  return !isRun(a) && !isRide(a);
}

export function ActivityLookup() {
  const [initial] = useState(readParams);
  const [query, setQuery] = useState(initial.query);
  const [sport, setSport] = useState<SportFilter>(initial.sport);
  const [units, setUnits] = useState<Units>(initial.units);
  const [order, setOrder] = useState<UserOrder>(initial.order);
  // Parts removed from the "Read as" row. They belong to one query and reset when it changes.
  const [removed, setRemoved] = useState<{ query: string; keys: IntentPartKey[] }>({
    query: initial.query.trim(),
    keys: initial.removed,
  });
  const removedKeys = removed.query === query.trim() ? removed.keys : [];
  const removedKey = removedKeys.join(",");
  const debug = initial.debug;
  const [openId, setOpenId] = useState<number | null>(initial.activity);
  // Machine date window (`?from=&to=`). Independent of `q`, until the dates chip is removed.
  const [listedWindow, setListedWindow] = useState<DayWindow | null>(initial.window);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [jev, setJev] = useState<JevState>({ status: "idle" });
  // Flips off for the session once the function reports Jev isn't configured.
  const [jevAvailable, setJevAvailable] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const search = useSearchString();
  // Search string this component last wrote, or the one it was opened with.
  // A popstate that doesn't match is someone else's navigation (a week link, Back).
  const writtenSearch = useRef(search);
  const applyingExternal = useRef(false);

  // Client-side hops update the query string without remounting Lookup.
  // Copy them into state before the write effect can put the old search back.
  useEffect(() => {
    if (search === writtenSearch.current) return;
    applyingExternal.current = true;
    writtenSearch.current = search;
    const next = readParams();
    setQuery(next.query);
    setSport(next.sport);
    setUnits(next.units);
    setOrder(next.order);
    setRemoved({ query: next.query.trim(), keys: next.removed });
    setListedWindow(next.window);
    setOpenId(next.activity);
  }, [search]);

  // Keep the search in the URL so it can be shared or bookmarked. Other params (debug) are left alone.
  useEffect(() => {
    if (applyingExternal.current) {
      applyingExternal.current = false;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const q = query.trim();
    if (q) params.set("q", q);
    else params.delete("q");
    if (sport !== "all") params.set("sport", sport);
    else params.delete("sport");
    if (units !== "mi") params.set("u", units);
    else params.delete("u");
    if (order !== "match") params.set("sort", order);
    else params.delete("sort");
    if (removedKey) params.set("drop", removedKey);
    else params.delete("drop");
    if (openId != null) params.set("activity", String(openId));
    else params.delete("activity");
    if (listedWindow) {
      params.set("from", listedWindow.start);
      params.set("to", listedWindow.end);
    } else {
      params.delete("from");
      params.delete("to");
    }
    const searchString = params.toString();
    const url = `${window.location.pathname}${searchString ? `?${searchString}` : ""}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      writtenSearch.current = searchString ? `?${searchString}` : "";
      window.history.replaceState(window.history.state, "", url);
    }
  }, [query, sport, units, order, removedKey, openId, listedWindow]);

  useEffect(() => {
    if (openId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.activeElement !== inputRef.current) {
        setOpenId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

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

  const codeClassification = useMemo(() => (trimmed ? classifyIntent(trimmed) : null), [trimmed]);
  const [facetOverride, setFacetOverride] = useState<{ query: string; classification: IntentClassification } | null>(
    null,
  );
  const filledClassification =
    facetOverride && facetOverride.query === trimmed ? facetOverride.classification : codeClassification;
  const intentClassification = useMemo(
    () => (filledClassification ? withoutParts(filledClassification, removedKeys) : null),
    // removedKey stands in for removedKeys, which is a new array each render.
    [filledClassification, removedKey],
  );
  const hardKey = intentClassification ? intentHardKey(intentClassification) : "";
  // `from`/`to` narrow the list. Removing the dates chip clears them.
  const activeWindow = removedKeys.includes("dates") ? null : listedWindow;
  const effectiveClassification = useMemo(
    () => mergeMachineWindow(intentClassification, activeWindow),
    [intentClassification, activeWindow],
  );
  const codeWithWindow = useMemo(
    () => mergeMachineWindow(codeClassification, activeWindow),
    [codeClassification, activeWindow],
  );

  const localHits: SearchHit[] = useMemo(() => {
    if (!trimmed || !effectiveClassification) return [];
    return searchActivities(index, trimmed, 500, undefined, effectiveClassification).filter((h) =>
      matchesSport(h.activity, sport),
    );
  }, [trimmed, sport, effectiveClassification]);

  const candidateIds = useMemo(
    () => localHits.slice(0, JEV_CANDIDATES).map((h) => h.activity.id),
    [localHits],
  );
  const candidateKey = candidateIds.join(",");

  // Score every shortlist, including deterministic metric and place queries.
  // Those keep localHits order; only semantic queries may reorder.
  const shouldScoreWithJev = jevAvailable;

  useEffect(() => {
    if (!shouldScoreWithJev || !trimmed) {
      setJev({ status: "idle" });
      return;
    }
    const requestedKey = hardKey;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setJev({ status: "loading", query: trimmed });
      fetch(JEV_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          ids: candidateIds,
          settled: filledClassification ? settledIntentPayload(filledClassification) : undefined,
          removed: removedKeys.length > 0 ? removedKeys : undefined,
        }),
        signal: controller.signal,
      })
        .then((r) => {
          if (r.status === 503 || r.status === 404) {
            setJevAvailable(false);
            return Promise.reject(r.status);
          }
          return r.ok ? r.json() : Promise.reject(r.status);
        })
        .then((data: {
          scores?: Record<number, number>;
          facets?: IntentFacets;
          companions?: MembershipCompanions;
        }) => {
          const code = classifyIntent(trimmed);
          const merged = applyJevIntent(code, data.facets);
          // A facet that changes the hard filters needs a new shortlist before membership
          // scores mean anything. That second request is the one real dependency.
          // A part the person removed stays removed, whatever Jev filled in.
          if (intentHardKey(withoutParts(merged, removedKeys)) !== requestedKey) {
            setFacetOverride({ query: trimmed, classification: merged });
            return;
          }
          setJev({
            status: "done",
            query: trimmed,
            scores: data.scores ?? {},
            companions: data.companions ?? {},
          });
        })
        .catch(() => {
          if (!controller.signal.aborted) setJev({ status: "error", query: trimmed });
        });
    }, JEV_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // candidateKey stands in for candidateIds so identical shortlists don't refetch.
  }, [shouldScoreWithJev, trimmed, candidateKey, hardKey, intentClassification, filledClassification, removedKey]);

  const jevScores = jev.status === "done" && jev.query === trimmed ? jev.scores : null;
  const jevCompanions = jev.status === "done" && jev.query === trimmed ? jev.companions : undefined;

  const results = useMemo(() => {
    if (!trimmed) {
      return activities
        .filter((a) => matchesSport(a, sport) && (!activeWindow || inDayWindow(a.start_date_local, activeWindow)))
        .map((activity): SearchHit => ({ activity, score: 0, kind: "keyword", matched: [] }));
    }
    // Locked metric and date rows stay in code order. Unlocked rows are gated by the membership
    // noul, then ordered by a graded dimension when the query asks for one, else by the noul.
    const grade = rankGradeFor(trimmed, intentClassification, standoutGraded)?.value;
    if (!jevScores) return grade ? rerankUnlockedHits(localHits, {}, undefined, grade) : localHits;
    return rerankUnlockedHits(localHits, jevScores, jevCompanions, grade);
  }, [trimmed, sport, activeWindow, localHits, jevScores, jevCompanions, intentClassification]);

  useEffect(() => setVisible(PAGE_SIZE), [trimmed, sport, order, listedWindow]);

  const ordered = useMemo(() => orderHits(results, order), [results, order]);
  const shown = ordered.slice(0, visible);
  const openActivity = openId != null ? activities.find((a) => a.id === openId) : undefined;
  const openInResults = openActivity != null && ordered.some((hit) => hit.activity.id === openActivity.id);
  const openInList = openActivity != null && shown.some((hit) => hit.activity.id === openActivity.id);

  useEffect(() => {
    if (openId == null || !openInList) return;
    listRef.current?.querySelector<HTMLElement>(`[data-activity-id="${openId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [openId, openInList]);

  const status = lookupStatus(
    trimmed,
    results,
    effectiveClassification,
    {
      available: jevAvailable,
      scored: Boolean(jevScores),
      pending: jev.status === "loading" || (jev.status !== "error" && candidateIds.length > 0),
      error: jev.status === "error" && jev.query === trimmed,
    },
    rankGradeFor(trimmed, intentClassification, standoutGraded)?.label,
    USER_ORDERS.find((o) => o.key === order && o.key !== "match")?.status,
  );
  const readAs = effectiveClassification ? interpretationParts(effectiveClassification, codeWithWindow) : [];
  const totals = trimmed ? resultTotals(primaryHits(results, effectiveClassification).map((h) => h.activity)) : null;

  function focusRow(index: number) {
    const rows = listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-activity-row]");
    if (!rows || rows.length === 0) return;
    rows[Math.max(0, Math.min(index, rows.length - 1))].focus();
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusRow(0);
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
    }
  }

  function onListKey(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const links = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-activity-row]") ?? []);
    const at = links.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    if (e.key === "ArrowUp" && at === 0) inputRef.current?.focus();
    else focusRow(e.key === "ArrowDown" ? at + 1 : at - 1);
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
          Ask for a session the way you'd describe it: a distance, a place, a date, a kind of workout.
          Exact asks like "longest run" sort by the numbers; looser ones like "best Chicago runs" are
          ranked by <b>Jev</b>. Open a row for the stimulus label stored on that activity, how
          sure the classifier is of that label, and when a person should review it.
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
            onKeyDown={onSearchKey}
            className={styles.search}
          />
          <kbd className={styles.kbd}>/</kbd>
        </div>
        {(readAs.length > 0 || removedKeys.length > 0) && (
          <div className={styles.readAs} role="group" aria-label="Search read as">
            <span>Read as</span>
            {readAs.map((part) => (
              <button
                key={part.key}
                type="button"
                className={`${styles.readPart} ${part.fromJev ? styles.readPartJev : ""}`}
                title={part.fromJev ? "Filled in by Jev. Click to remove." : "Click to remove."}
                aria-label={`Remove ${part.label.toLowerCase()} ${part.value}`}
                onClick={() => {
                  if (part.key === "dates") setListedWindow(null);
                  setRemoved({ query: trimmed, keys: [...removedKeys, part.key] });
                }}
              >
                <span className={styles.readLabel}>{part.label}</span>
                {part.value}
                {part.fromJev && <span className={styles.readJev}>Jev</span>}
                <span className={styles.readRemove} aria-hidden="true">
                  ×
                </span>
              </button>
            ))}
            {removedKeys.length > 0 && (
              <button type="button" className={styles.readReset} onClick={() => setRemoved({ query: trimmed, keys: [] })}>
                Reset
              </button>
            )}
          </div>
        )}
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
          <div className={styles.rightControls}>
            <label className={styles.order}>
              <span className="sr-only">Order</span>
              <select value={order} onChange={(e) => setOrder(e.target.value as UserOrder)}>
                {USER_ORDERS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
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
        </div>

        <p className={styles.status} role="status">
          {status}
        </p>
        {totals && totals.count > 1 && (
          <p className={styles.totals}>
            {(units === "mi" ? totals.distanceM / 1609.344 : totals.distanceM / 1000).toLocaleString(undefined, {
              maximumFractionDigits: 1,
            })}{" "}
            {units} · {formatHours(totals.movingS)}
            {totals.runPaceSPerM !== null &&
              ` · ${formatDuration(Math.round(totals.runPaceSPerM * (units === "mi" ? 1609.344 : 1000)))} /${units} avg`}
          </p>
        )}

        {openActivity && !openInList && (
          <>
            {!openInResults && (
              <p className={styles.outside}>This session is outside the current filter.</p>
            )}
            <StimulusDecisionPanel activity={openActivity} pinned onClose={() => setOpenId(null)} />
          </>
        )}

        {shown.length > 0 && (
          <ul className={styles.list} ref={listRef} onKeyDown={onListKey}>
            {shown.map((hit) => (
              <ActivityRow
                key={hit.activity.id}
                hit={hit}
                units={units}
                open={openId === hit.activity.id}
                onToggle={() => setOpenId((current) => (current === hit.activity.id ? null : hit.activity.id))}
                showMatch={debug && Boolean(trimmed)}
                jevScore={trimmed ? jevScores?.[hit.activity.id] : undefined}
                demoted={
                  jevScores?.[hit.activity.id] !== undefined
                  && (jevScores?.[hit.activity.id] ?? 1) < MEMBERSHIP_DEMOTE_BELOW
                }
                metricOrder={hit.locked !== false}
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
          Open a row for the stimulus label. Classification confidence is about that label, and the page does not relabel the session.
          When the export includes it, a second line shows whether that session fit readiness and the plan. That score is not the label confidence.
        </p>
      </footer>
    </div>
  );
}

function ActivityRow({
  hit,
  units,
  open,
  onToggle,
  showMatch,
  jevScore,
  demoted,
  metricOrder,
}: {
  hit: SearchHit;
  units: Units;
  open: boolean;
  onToggle: () => void;
  showMatch: boolean;
  jevScore?: number;
  demoted?: boolean;
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

  // Build enrichment chips. Structured place wins over a name-derived city.
  const enrichmentChips: string[] = [];
  const where = structuredPlaceText(a);
  if (a.place_city || a.place_country) {
    if (where) enrichmentChips.push(where);
  } else if (a.place) enrichmentChips.push(a.place);
  const holiday = holidayOf(a.start_date_local);
  if (holiday) enrichmentChips.push(calendarLabel(holiday));
  if (a.race?.event_name) enrichmentChips.push(a.race.event_name);
  if (a.race?.is_pr) enrichmentChips.push("PR");
  if (a.workout_structure) enrichmentChips.push(a.workout_structure);
  if (a.gear) enrichmentChips.push(a.gear);
  if (a.with && a.with.length > 0) enrichmentChips.push(`with ${a.with.slice(0, 2).join(", ")}`);
  else if (a.athlete_count != null && a.athlete_count > 1) enrichmentChips.push(`${a.athlete_count} athletes`);
  const decision = stimulusDecision(a);
  if (a.has_intervals) {
    const intervalLabel = a.hard_lap_count ? `${a.hard_lap_count} hard laps` : "intervals";
    enrichmentChips.push(intervalLabel);
  }
  // Average power is already a metric below. Best 20min is a different number, so it stays.
  if (isRide(a) && a.best_watts_20m) enrichmentChips.push(`${Math.round(a.best_watts_20m)}W 20min`);

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
    <li className={`${styles.row} ${open ? styles.rowOpen : ""}`} data-activity-id={a.id}>
      <button
        type="button"
        className={styles.rowButton}
        data-activity-row=""
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className={styles.date}>
          <b>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</b>
          {date.getFullYear()}
        </span>
        <span className={styles.main}>
          <span className={styles.name}>{a.name}</span>
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
              <span key={`v3-${i}`} className={styles.metaMetric}>
                {chip}
              </span>
            ))}
            {decision.listLabel && (
              <span className={decision.escalate ? styles.decisionReview : styles.decisionChip}>
                {decision.listLabel}
              </span>
            )}
            {enrichmentChips.map((chip, i) => (
              <span key={i} className={styles.metaTag}>
                {chip}
              </span>
            ))}
          </span>
        </span>
        {(showMatch || jevScore !== undefined) && (
          <span className={styles.badges}>
            {showMatch && (
              <span className={`${styles.badge} ${hit.kind === "keyword" ? styles.badgeKeyword : ""}`}>
                {hit.branch && hit.branch !== hit.kind ? `${hit.kind} · ${hit.branch}` : hit.kind}
              </span>
            )}
            {jevScore !== undefined && (
              <span
                className={[
                  styles.badge,
                  styles.badgeJev,
                  jevScore >= 0.7 ? styles.jevHigh : jevScore >= 0.4 ? styles.jevMid : styles.jevLow,
                  demoted && !metricOrder ? styles.jevDemoted : "",
                ].join(" ")}
                title={
                  metricOrder
                    ? "Jev membership score. This list stays in code order."
                    : demoted
                      ? "Weak membership score. Ranked after stronger matches."
                      : "Jev membership score. This list is sorted by this probability."
                }
              >
                Jev {Math.round(jevScore * 100)}%
              </span>
            )}
          </span>
        )}
      </button>
      {open && <StimulusDecisionPanel activity={a} onClose={onToggle} />}
    </li>
  );
}
