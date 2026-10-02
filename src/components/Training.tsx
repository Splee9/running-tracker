import { useEffect, useRef, useState } from "react";
import { motion, type Variants } from "motion/react";
import { AnimatedNumber } from "./AnimatedNumber";
import { Chip } from "./Chip";
import { ContextStrip } from "./ContextStrip";
import { TvChart } from "./TvChart";
import { Link, useSearchString } from "../lib/router";
import { formatDate, formatMonthDay } from "../lib/format";
import { readTrainingQuery, widenDateRange } from "../lib/focus";
import {
  BANDS,
  BAND_COLOR,
  DATE_RANGES,
  HORIZONS,
  SPORTS,
  fmtTv,
  tv,
  filterToRange,
  type Band,
  type DateRange,
  type Horizon,
  weekly,
  type Sport,
} from "../lib/training";
import { weekSunday } from "../lib/week";
import styles from "./Training.module.css";

const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

const BAND_RANGE: Record<Band, string> = {
  Steady: "under 35",
  Moderate: "35–55",
  Uneven: "55–80",
  Erratic: "80+",
};

const SHORT_NAME: Record<Horizon, string> = { short: "Short", medium: "Medium", long: "Long" };

interface Controls {
  sport: Sport;
  horizon: Horizon;
  dateRange: DateRange;
  showHours: boolean;
  week: string | null;
}

function derive(search: string): Controls {
  const query = readTrainingQuery(search);
  const sunday = query.week ? weekSunday(query.week) : null;
  const last = weekly.weeks[weekly.weeks.length - 1];
  const inSeries = sunday != null && weekly.weeks.includes(sunday);
  const dateRange = inSeries && sunday ? widenDateRange(sunday, query.range, last) : query.range;
  return {
    sport: query.sport,
    horizon: query.horizon,
    dateRange,
    showHours: query.hours,
    week: query.week,
  };
}

function writeControls(next: Controls) {
  const params = new URLSearchParams();
  if (next.week) params.set("week", next.week);
  if (next.sport !== "run") params.set("sport", next.sport);
  if (next.horizon !== "medium") params.set("horizon", next.horizon);
  if (next.dateRange !== "52wk") params.set("range", next.dateRange);
  if (next.showHours) params.set("hours", "1");
  const qs = params.toString();
  const nextSearch = qs ? `?${qs}` : "";
  const url = `${window.location.pathname}${nextSearch}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (url === current) return nextSearch;
  window.history.replaceState(window.history.state, "", url);
  return nextSearch;
}

export function Training() {
  const search = useSearchString();
  const writtenSearch = useRef(search);
  const chartRef = useRef<HTMLDivElement>(null);
  const [initial] = useState(() => derive(window.location.search));
  const [sport, setSport] = useState<Sport>(initial.sport);
  const [horizon, setHorizon] = useState<Horizon>(initial.horizon); // Preserve the pre-#18 rolling default
  const [dateRange, setDateRange] = useState<DateRange>(initial.dateRange);
  const [showHours, setShowHours] = useState(initial.showHours);
  const [week, setWeek] = useState<string | null>(initial.week);
  const current = tv.current[sport];
  const controls = { sport, horizon, dateRange, showHours, week };

  useEffect(() => {
    if (search === writtenSearch.current) return;
    writtenSearch.current = search;
    const next = derive(search);
    setSport(next.sport);
    setHorizon(next.horizon);
    setDateRange(next.dateRange);
    setShowHours(next.showHours);
    setWeek(next.week);
  }, [search]);

  useEffect(() => {
    if (!week) return;
    chartRef.current?.scrollIntoView({ block: "start" });
  }, [week]);

  function publish(next: Controls) {
    setSport(next.sport);
    setHorizon(next.horizon);
    setDateRange(next.dateRange);
    setShowHours(next.showHours);
    setWeek(next.week);
    writtenSearch.current = writeControls(next);
  }

  const sunday = week ? weekSunday(week) : null;
  const inSeries = sunday != null && weekly.weeks.includes(sunday);
  const rangePreset = DATE_RANGES.find((range) => range.id === dateRange)!;
  const filtered = filterToRange(sport, horizon, rangePreset);
  const focusVisible = sunday != null && filtered.weeks.includes(sunday);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <motion.p className="eyebrow" variants={rise} custom={0} initial="hidden" animate="show">
          Training variability
        </motion.p>
        <motion.h1 className={styles.title} variants={rise} custom={1} initial="hidden" animate="show">
          How steady is the work?
        </motion.h1>
        <motion.div className={styles.strip} variants={rise} custom={1} initial="hidden" animate="show">
          <ContextStrip showChartJump />
        </motion.div>
        <motion.p className={styles.intro} variants={rise} custom={2} initial="hidden" animate="show">
          How much weekly training hours swing around their average, over three rolling windows.{" "}
          <b>Lower is steadier</b> — a flat, low line means the same work, week after week.
        </motion.p>
      </header>

      <motion.section
        className={styles.section}
        aria-label="Training variability"
        variants={rise}
        custom={3}
        initial="hidden"
        animate="show"
      >
        <div className={styles.controls}>
          <div className={styles.chips} role="group" aria-label="Choose a sport">
            {SPORTS.map((s) => (
              <Chip key={s} active={sport === s} onClick={() => publish({ ...controls, sport: s })}>
                {tv.filters[s].label}
              </Chip>
            ))}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showHours}
            className={`${styles.switch} ${showHours ? styles.switchOn : ""}`}
            onClick={() => publish({ ...controls, showHours: !showHours })}
          >
            <span className={styles.switchTrack} aria-hidden>
              <motion.span
                className={styles.switchThumb}
                layout
                transition={{ type: "spring", stiffness: 500, damping: 34 }}
              />
            </span>
            Weekly hours
          </button>
        </div>

        <div className={styles.rangeControls}>
          <span className={styles.controlLabel} id="date-range-label">
            Chart range
          </span>
          <div className={styles.chips} role="group" aria-labelledby="date-range-label">
            {DATE_RANGES.map((range) => (
              <Chip
                key={range.id}
                active={dateRange === range.id}
                onClick={() => publish({ ...controls, dateRange: range.id })}
              >
                {range.label}
              </Chip>
            ))}
          </div>
        </div>

        <p className={styles.controlLabel} id="rolling-average-label">
          Rolling average
        </p>
        <div className={styles.folder}>
          <div className={styles.tabs} role="tablist" aria-labelledby="rolling-average-label">
            {HORIZONS.map((h) => {
              const p = current[h];
              const active = horizon === h;
              return (
                <button
                  key={h}
                  type="button"
                  role="tab"
                  id={`tv-tab-${h}`}
                  aria-selected={active}
                  aria-controls="tv-panel"
                  className={`${styles.tab} ${active ? styles.tabActive : ""}`}
                  onClick={() => publish({ ...controls, horizon: h })}
                >
                  <span className={styles.tabLabel}>
                    {SHORT_NAME[h]} · {tv.horizons[h].weeks} wk
                  </span>
                  <span className={styles.tabNum} style={{ color: BAND_COLOR[p.band] }}>
                    <AnimatedNumber value={p.tv} format={fmtTv} duration={0.5} />
                  </span>
                  <span className={styles.tabBand}>{p.band}</span>
                  {active && (
                    <motion.span
                      layoutId="tv-tab-indicator"
                      className={styles.tabIndicator}
                      style={{ background: BAND_COLOR[p.band] }}
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div
            ref={chartRef}
            className={styles.panel}
            role="tabpanel"
            id="tv-panel"
            aria-labelledby={`tv-tab-${horizon}`}
            data-edge={horizon === "short" ? "left" : horizon === "long" ? "right" : undefined}
          >
            {(() => {
              const { weeks, hours, points } = filtered;
              const rangeLabel = rangePreset.weeks ? `${rangePreset.weeks}-week` : "full-history";

              return (
                <>
                  <p className={styles.panelMeta}>
                    {tv.filters[sport].label} · rolling {tv.horizons[horizon].weeks}-week window ·{" "}
                    {rangePreset.label} view · now as of week ending {formatDate(tv.last_complete_week_end)}
                  </p>
                  {week && sunday && !inSeries && (
                    <p className={styles.weekNote} role="status">
                      Week of {formatMonthDay(week)} is not in the series.
                    </p>
                  )}
                  {week && inSeries && !focusVisible && (
                    <p className={styles.weekNote} role="status">
                      Week of {formatMonthDay(week)} is outside this chart range.
                    </p>
                  )}
                  <TvChart
                    points={points}
                    weeks={weeks}
                    hours={hours}
                    showHours={showHours}
                    drawKey={`${sport}-${horizon}-${dateRange}`}
                    label={`${tv.filters[sport].label}, ${tv.horizons[horizon].label}, ${rangeLabel} view`}
                    lookupSport={sport === "run" ? "run" : sport === "bike" ? "ride" : null}
                    focusWeek={focusVisible ? sunday : null}
                  />
                </>
              );
            })()}

            <div className={styles.legend}>
              {BANDS.map((b) => (
                <span key={b.name} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: b.color }} />
                  {b.name} <span className={styles.legendRange}>{BAND_RANGE[b.name]}</span>
                </span>
              ))}
              {showHours && (
                <span className={styles.legendItem}>
                  <span className={styles.legendBar} />
                  Weekly hours <span className={styles.legendRange}>right axis</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <p className={styles.cue}>
          Choose a rolling average and chart range independently; hover or tap the chart to read any week.
        </p>
      </motion.section>

      <footer className={styles.footer}>
        <p>
          <b>How it's measured.</b> Each point is the sample standard deviation of weekly hours
          divided by their mean, × 100, over the trailing window. Weeks with zero hours count.
          Weeks run Monday–Sunday (Central time); the in-progress week is left out.{" "}
          {tv.filters[sport].label} includes {tv.filters[sport].sports.join(", ")}.
        </p>
        <p className={styles.stamp}>Through the week ending {formatDate(tv.last_complete_week_end)}.</p>
        <p className={styles.crosslink}>
          <Link href="/miles">
            <span className={styles.arrow}>←</span> Back to the running log
          </Link>
        </p>
      </footer>
    </div>
  );
}
