import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { formatDate } from "../lib/format";
import { lookupWeekHref, milesYearHref, type LookupSport } from "../lib/links";
import { Link } from "../lib/router";
import { BANDS, BAND_COLOR, fmtTv, toDays, type TvPoint } from "../lib/training";
import styles from "./TvChart.module.css";

const PAD_TOP = 34;
const PAD_BOTTOM = 30;
const THRESHOLDS = BANDS.slice(1).map((b) => b.min);
const MIN_LABEL_GAP = 16; // px between stacked threshold labels
// Bars top out at this share of the plot height so the TV line stays readable above them.
const BAR_HEADROOM = 0.6;

interface Props {
  points: TvPoint[];
  /** Every week on the axis, oldest first; `hours[i]` belongs to `weeks[i]`. */
  weeks: string[];
  hours: number[];
  showHours: boolean;
  /** Changes whenever the line should redraw (sport or horizon switch). */
  drawKey: string;
  label: string;
  /** Lookup sport for the week link. Null is every sport (the All chart). */
  lookupSport: LookupSport | null;
}

/**
 * Rendered at the container's real pixel size (not a scaled viewBox) so axis
 * text stays legible on phones, where the chart also gets a taller aspect.
 */
export function TvChart(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = width < 560 ? 280 : Math.round(Math.min(360, Math.max(300, width * 0.36)));

  return (
    <div ref={wrapRef} className={styles.wrap} style={{ minHeight: height }}>
      {width > 0 && <Plot {...props} W={width} H={height} />}
    </div>
  );
}

function Plot({
  points,
  weeks,
  hours,
  showHours,
  drawKey,
  label,
  lookupSport,
  W,
  H,
}: Props & { W: number; H: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);

  const narrow = W < 560;
  const padLeft = narrow ? 30 : 40;
  const padRight = showHours ? (narrow ? 30 : 40) : 12;
  const baseline = H - PAD_BOTTOM;
  const plotW = W - padLeft - padRight;
  
  // Dynamic x-domain from the visible weeks instead of fixed DAY0/DAY1
  const dayMin = weeks.length > 0 ? toDays(weeks[0]) : 0;
  const dayMax = weeks.length > 0 ? toDays(weeks[weeks.length - 1]) : 0;
  const daySpan = dayMax - dayMin || 1; // avoid division by zero
  
  const px = (iso: string) => padLeft + ((toDays(iso) - dayMin) / daySpan) * plotW;
  const weekW = (7 / daySpan) * plotW;

  // Floor of 100 keeps every band visible; spiky series (e.g. a bike block
  // after weeks off) extend the axis instead of being clipped.
  const peak = Math.max(...points.map((p) => p.tv));
  const yMax = Math.max(100, Math.ceil(peak / 50) * 50);
  const py = (v: number) => PAD_TOP + (1 - v / yMax) * (baseline - PAD_TOP);

  const hTop = niceMax(Math.max(...hours));
  const hStep = hTop <= 10 ? 2 : hTop <= 30 ? 5 : 10;
  const hy = (v: number) => baseline - (v / hTop) * BAR_HEADROOM * (baseline - PAD_TOP);
  const hourTicks: number[] = [];
  for (let v = hStep; v <= hTop; v += hStep) hourTicks.push(v);

  // On a stretched axis the thresholds bunch up; drop labels that would collide
  // (working down from the top) but keep every dashed line.
  const labelled = new Set<number>();
  let lastLabelY = py(yMax);
  for (const t of [...THRESHOLDS].reverse()) {
    if (py(t) - lastLabelY >= MIN_LABEL_GAP) {
      labelled.add(t);
      lastLabelY = py(t);
    }
  }

  const byWeek = new Map(points.map((p) => [p.week_end, p]));

  // Weeks with no training in the whole window have no defined TV; break the
  // line there rather than bridging the gap.
  const path = points
    .map((p, i) => {
      const gap = i > 0 && toDays(p.week_end) - toDays(points[i - 1].week_end) > 7;
      return `${i === 0 || gap ? "M" : "L"} ${px(p.week_end).toFixed(1)} ${py(p.tv).toFixed(1)}`;
    })
    .join(" ");

  const yearTicks = weeks.reduce<{ year: string; x: number }[]>((ticks, w) => {
    const year = w.slice(0, 4);
    if (!ticks.some((t) => t.year === year)) ticks.push({ year, x: px(w) });
    return ticks;
  }, []);

  // Thin bars alias into stripes on narrow screens; let them touch instead.
  const barW = weekW < 3 ? weekW + 0.25 : weekW * 0.72;

  const last = points[points.length - 1];
  const lastX = px(last.week_end);
  const lastY = py(last.tv);

  const activeWeek = hovered === null ? null : weeks[hovered];
  const sessionsHref = activeWeek ? lookupWeekHref(activeWeek, lookupSport) : null;
  const yearHref = activeWeek ? milesYearHref(activeWeek) : null;
  const activePoint = activeWeek ? byWeek.get(activeWeek) : undefined;
  const activeHours = hovered === null ? 0 : hours[hovered];
  const tipColor = activePoint ? BAND_COLOR[activePoint.band] : "var(--ink)";
  const tipX = activeWeek ? px(activeWeek) : 0;
  const tipY = activePoint ? py(activePoint.tv) : showHours ? hy(activeHours) : baseline;
  const tipFrac = tipX / W;
  const tipShift = tipFrac < 0.22 ? "-12%" : tipFrac > 0.78 ? "-88%" : "-50%";

  function track(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const x = clientX - svg.getBoundingClientRect().left;
    const target = dayMin + ((x - padLeft) / plotW) * daySpan;
    let best = 0;
    for (let i = 1; i < weeks.length; i++) {
      if (Math.abs(toDays(weeks[i]) - target) < Math.abs(toDays(weeks[best]) - target)) best = i;
    }
    setHovered(best);
  }

  return (
    <>
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        role="img"
        aria-label={`${label} training variability by week${
          showHours ? ", with weekly hours as bars" : ""
        }. Latest: ${fmtTv(last.tv)}, ${last.band}.`}
      >
        {BANDS.map((b) => {
          const top = Math.min(b.max, yMax);
          return (
            <rect
              key={b.name}
              x={padLeft}
              y={py(top)}
              width={plotW}
              height={py(b.min) - py(top)}
              fill={b.color}
              className={`${styles.bandFill} ${showHours ? styles.bandFillDim : ""}`}
            />
          );
        })}

        {THRESHOLDS.map((t) => (
          <g key={t}>
            <line x1={padLeft} y1={py(t)} x2={W - padRight} y2={py(t)} className={styles.threshold} />
            {labelled.has(t) && (
              <text x={padLeft - 8} y={py(t) + 4} className={styles.axisLabel} textAnchor="end">
                {t}
              </text>
            )}
          </g>
        ))}
        <text x={padLeft - 8} y={py(yMax) + 4} className={styles.axisLabel} textAnchor="end">
          {yMax}
        </text>
        <text x={padLeft - 8} y={PAD_TOP - 16} className={styles.axisHint} textAnchor="end">
          TV
        </text>

        <AnimatePresence>
          {showHours && (
            <motion.g
              key="hours"
              initial={reduce ? false : { opacity: 0, scaleY: 0 }}
              animate={{ opacity: 1, scaleY: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scaleY: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              style={{ originY: 1 }}
            >
              {weeks.map((w, i) => (
                <rect
                  key={w}
                  x={px(w) - barW / 2}
                  y={hy(hours[i])}
                  width={barW}
                  height={baseline - hy(hours[i])}
                  className={`${styles.bar} ${hovered === i ? styles.barActive : ""}`}
                />
              ))}
            </motion.g>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showHours && (
            <motion.g
              key="hours-axis"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {hourTicks.map((v) => (
                <text key={v} x={W - padRight + 8} y={hy(v) + 4} className={styles.axisLabel}>
                  {v}h
                </text>
              ))}
              <text x={W - padRight + 8} y={hy(hTop) - 14} className={styles.axisHint}>
                hrs
              </text>
            </motion.g>
          )}
        </AnimatePresence>

        <line x1={padLeft} y1={baseline} x2={W - padRight} y2={baseline} className={styles.grid} />
        {yearTicks.map((t) => (
          <g key={t.year}>
            <line x1={t.x} y1={baseline} x2={t.x} y2={baseline + 6} className={styles.grid} />
            <text x={t.x} y={baseline + 20} className={styles.yearLabel} textAnchor="middle">
              {narrow ? `’${t.year.slice(2)}` : t.year}
            </text>
          </g>
        ))}

        <motion.path
          key={drawKey}
          d={path}
          className={styles.line}
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />

        <circle cx={lastX} cy={lastY} r={9} fill={BAND_COLOR[last.band]} className={styles.halo} />
        <circle cx={lastX} cy={lastY} r={4.5} fill={BAND_COLOR[last.band]} />

        {activeWeek && (
          <g>
            <line x1={tipX} y1={PAD_TOP} x2={tipX} y2={baseline} className={styles.guide} />
            {activePoint && (
              <circle
                cx={tipX}
                cy={py(activePoint.tv)}
                r={5}
                fill="var(--bg)"
                stroke={BAND_COLOR[activePoint.band]}
                strokeWidth={2}
              />
            )}
          </g>
        )}

        <rect
          x={padLeft}
          y={0}
          width={plotW}
          height={H}
          fill="transparent"
          className={styles.hit}
          onPointerMove={(e) => track(e.clientX)}
          onPointerDown={(e) => track(e.clientX)}
          // Touch fires pointerleave on lift; keep the tapped week showing until the next tap.
          onPointerLeave={(e) => {
            if (e.pointerType === "touch") return;
            const next = e.relatedTarget;
            if (next instanceof Node && tipRef.current?.contains(next)) return;
            setHovered(null);
          }}
        />
      </svg>

      {activeWeek && (
        <div
          ref={tipRef}
          className={styles.tipAnchor}
          style={{
            left: `${tipFrac * 100}%`,
            top: `${(tipY / H) * 100}%`,
            transform: `translate(${tipShift}, -100%)`,
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "touch") return;
            setHovered(null);
          }}
        >
          <div className={styles.tip} style={{ borderColor: tipColor }}>
            <span className={styles.tipValue} style={{ color: tipColor }}>
              {activePoint ? `${fmtTv(activePoint.tv)} · ${activePoint.band}` : "No TV · nothing logged"}
            </span>
            <span className={styles.tipMeta}>
              <b>{activeHours.toFixed(1)} h</b> this week
              {activePoint && ` · ${activePoint.mean_hours.toFixed(1)} h/wk avg`}
            </span>
            <span className={styles.tipDate}>Week ending {formatDate(activeWeek)}</span>
            <span className={styles.tipLinks}>
              {sessionsHref && <Link href={sessionsHref}>Sessions</Link>}
              {yearHref && <Link href={yearHref}>{activeWeek.slice(0, 4)} on the log</Link>}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

/** Round an axis maximum up to a friendly number: 13.2 → 15, 27 → 30, 4.1 → 6. */
function niceMax(v: number): number {
  const step = v <= 10 ? 2 : v <= 30 ? 5 : 10;
  return Math.max(step, Math.ceil(v / step) * step);
}
