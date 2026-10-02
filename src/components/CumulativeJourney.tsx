import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import { data, lifetime, type RaceDistance } from "../lib/data";
import { fmt } from "../lib/format";
import { raceKey, raceSessionHref, type RaceFocus } from "../lib/races";
import { navigate } from "../lib/router";
import { RaceChartTip } from "./RaceLinks";
import styles from "./CumulativeJourney.module.css";

// ---- geometry (static; data is baked in) --------------------------------
const W = 1000;
const H = 380;
const PAD_X = 16;
const PAD_TOP = 56;
const PAD_BOTTOM = 28;

const months = data.monthly;
const N = months.length;
const MAX_CUM = months[N - 1].cumulative;

const px = (i: number) => PAD_X + (i / (N - 1)) * (W - 2 * PAD_X);
const py = (cum: number) => H - PAD_BOTTOM - (cum / MAX_CUM) * (H - PAD_TOP - PAD_BOTTOM);

const PATH = months
  .map((m, i) => `${i === 0 ? "M" : "L"} ${px(i).toFixed(1)} ${py(m.cumulative).toFixed(1)}`)
  .join(" ");

// A few iconic, well-spread milestones that resolve as the line climbs.
// Kept sparse and spaced out so labels never collide on the compressed
// early-years portion of the curve.
const MILESTONES = [
  { miles: 874, label: "the length of Britain" },
  { miles: 2760, label: "Chicago to Miami and back" },
  { miles: 6786, label: "the Moon's circumference" },
  { miles: 12450, label: "halfway around the Earth" },
]
  .filter((m) => m.miles <= MAX_CUM)
  .map((m) => {
    const idx = months.findIndex((mo) => mo.cumulative >= m.miles);
    const i = idx === -1 ? N - 1 : idx;
    return { ...m, i, x: px(i), y: py(months[i].cumulative), frac: i / (N - 1) };
  });

// Year boundaries along the x-axis — one tick at the first logged month of each year.
const YEAR_TICKS = (() => {
  const seen = new Set<string>();
  const ticks: { year: string; x: number; frac: number }[] = [];
  months.forEach((m, i) => {
    const yr = m.month.slice(0, 4);
    if (!seen.has(yr)) {
      seen.add(yr);
      ticks.push({ year: yr, x: px(i), frac: i / (N - 1) });
    }
  });
  return ticks;
})();

// pathLength reveals over scroll progress [0.05, 0.95]; this maps an x-fraction
// to the progress value at which the drawing pen reaches it, so markers pop in
// exactly as the line passes them.
const penAt = (frac: number) => 0.05 + 0.9 * frac;

// Race markers: a colored line that shoots up off the cumulative line at the
// race's date, labelled with the race type. Colors + heights are per type
// (marathon tallest → 5K shortest) so different types separate vertically even
// when their dates are close.
const RACE_STYLE: Record<string, { color: string; label: string; stem: number }> = {
  marathon: { color: "#c0432f", label: "Marathon", stem: 30 },
  half: { color: "#1f7a5c", label: "Half", stem: 24 },
  "10K": { color: "#2f6db0", label: "10K", stem: 19 },
  "5K": { color: "#8a5a9e", label: "5K", stem: 14 },
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtMonth = (iso: string) => `${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;

const daysInMonth = (iso: string) => new Date(+iso.slice(0, 4), +iso.slice(5, 7), 0).getDate();

const RACE_MARKERS = data.raceEvents
  .map((r) => {
    const ym = r.date.slice(0, 7);
    const idx = months.findIndex((m) => m.month === ym);
    if (idx === -1) return null;
    const dayFrac = Math.min(0.999, (+r.date.slice(8, 10) - 1) / daysInMonth(r.date));
    const fi = idx + dayFrac;
    const c0 = months[idx].cumulative;
    const c1 = months[Math.min(N - 1, idx + 1)].cumulative;
    const cum = c0 + (c1 - c0) * dayFrac;
    return { ...r, x: px(fi), y: py(cum), frac: fi / (N - 1) };
  })
  .filter((m): m is NonNullable<typeof m> => m !== null);

type TipAnchor = { left: string; top: string; color: string };

function markerAnchor(marker: (typeof RACE_MARKERS)[number]): TipAnchor {
  return {
    left: `${(marker.x / W) * 100}%`,
    top: `${(Math.max(12, marker.y - RACE_STYLE[marker.distance].stem) / H) * 100}%`,
    color: RACE_STYLE[marker.distance].color,
  };
}

export function CumulativeJourney({
  raceFocus,
  onFocusRace,
}: {
  raceFocus: RaceFocus;
  onFocusRace: (focus: RaceFocus) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);
  const [tipKey, setTipKey] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<TipAnchor | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  const pathLength = useTransform(scrollYProgress, [0.05, 0.95], [0, 1]);

  function showMarker(index: number) {
    const marker = RACE_MARKERS[index];
    if (!marker) return;
    const key = raceKey(marker);
    setHovered(index);
    setTipKey(key);
    setAnchor(markerAnchor(marker));
    onFocusRace({ key, pin: false });
  }

  function showRelated(key: string) {
    onFocusRace({ key, pin: false });
    const index = RACE_MARKERS.findIndex((marker) => raceKey(marker) === key);
    setHovered(index >= 0 ? index : null);
    // Keep the card under the pointer. Moving it would drop the hover.
    setTipKey(key);
  }

  function pointerLeftChart(event: ReactPointerEvent) {
    const next = event.relatedTarget;
    if (next instanceof Node && tipRef.current?.contains(next)) return;
    setHovered(null);
    setTipKey(null);
  }

  return (
    <section ref={ref} className={styles.section} aria-label="Cumulative distance over time">
      <div className={styles.sticky}>
        <p className="eyebrow">The long way</p>
        <JourneyTotal progress={scrollYProgress} reduce={reduce} />

        <div className={styles.chartWrap}>
          <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg}>
            <path d={PATH} className={styles.track} />
            {YEAR_TICKS.map((t) => (
              <YearTick key={t.year} t={t} progress={scrollYProgress} reduce={reduce} />
            ))}
            <motion.path
              d={PATH}
              className={styles.draw}
              style={{ pathLength: reduce ? 1 : pathLength }}
            />
            {MILESTONES.map((m) => (
              <Milestone key={m.miles} m={m} progress={scrollYProgress} reduce={reduce} />
            ))}
            {RACE_MARKERS.map((r, i) => (
              <RaceMarker
                key={`${r.date}-${i}`}
                r={r}
                active={hovered === i || raceFocus?.key === raceKey(r)}
                progress={scrollYProgress}
                reduce={reduce}
                onEnter={() => showMarker(i)}
                onLeave={pointerLeftChart}
              />
            ))}
          </svg>

          {tipKey && anchor && (
            <RaceChartTip
              ref={tipRef}
              raceKeyValue={tipKey}
              anchor={anchor}
              onRelate={showRelated}
              onPointerLeave={pointerLeftChart}
            />
          )}
        </div>

        <div className={styles.legend} aria-hidden>
          {Object.values(RACE_STYLE).map((s) => (
            <span key={s.label} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>

        <p className={styles.cue}>
          Hover a marker for the race, then open its session or another race on this log. Click the marker to
          open that session. The line is every mile, stacked end to end.
        </p>
      </div>
    </section>
  );
}

function JourneyTotal({ progress, reduce }: { progress: MotionValue<number>; reduce: boolean | null }) {
  const miles = useTransform(progress, [0.05, 0.95], [0, MAX_CUM]);
  const [display, setDisplay] = useState(reduce ? lifetime.miles : 0);
  useMotionValueEvent(miles, "change", (v) => {
    if (!reduce) setDisplay(v);
  });
  return (
    <div className={styles.total}>
      <span className={styles.totalNum}>{fmt(display)}</span>
      <span className={styles.totalUnit}>miles, and counting</span>
    </div>
  );
}

function Milestone({
  m,
  progress,
  reduce,
}: {
  m: { miles: number; label: string; x: number; y: number; frac: number };
  progress: MotionValue<number>;
  reduce: boolean | null;
}) {
  const at = penAt(m.frac);
  const start = Math.max(0, at - 0.04);
  const end = Math.min(1, Math.max(start + 0.001, at));
  const opacity = useTransform(progress, [start, end], [0, 1]);
  const ty = useTransform(progress, [start, end], [8, 0]);

  const labelY = m.y - 22;
  const anchor = m.x > W * 0.8 ? "end" : m.x < W * 0.12 ? "start" : "middle";
  return (
    <motion.g style={reduce ? { opacity: 1 } : { opacity, y: ty }}>
      <line x1={m.x} y1={m.y} x2={m.x} y2={labelY + 5} className={styles.leader} />
      <circle cx={m.x} cy={m.y} r={4} className={styles.dot} />
      <text x={m.x} y={labelY} className={styles.label} textAnchor={anchor}>
        {fmt(m.miles)} mi · {m.label}
      </text>
    </motion.g>
  );
}

function RaceMarker({
  r,
  active,
  progress,
  reduce,
  onEnter,
  onLeave,
}: {
  r: { date: string; distance: RaceDistance; x: number; y: number; frac: number };
  active: boolean;
  progress: MotionValue<number>;
  reduce: boolean | null;
  onEnter: () => void;
  onLeave: (event: ReactPointerEvent<SVGRectElement>) => void;
}) {
  const href = raceSessionHref(r);
  const label = `${RACE_STYLE[r.distance].label} ${fmtMonth(r.date)}`;
  const s = RACE_STYLE[r.distance];
  const topY = Math.max(12, r.y - s.stem);

  const at = penAt(r.frac);
  const start = Math.max(0, at - 0.025);
  const end = Math.min(1, Math.max(start + 0.001, at));
  const opacity = useTransform(progress, [start, end], [0, 1]);
  const lineTop = useTransform(progress, [start, end], [r.y, topY]); // shoots up

  return (
    <motion.g style={reduce ? { opacity: 1 } : { opacity }}>
      <motion.line
        x1={r.x}
        y1={r.y}
        x2={r.x}
        y2={reduce ? topY : lineTop}
        stroke={s.color}
        strokeWidth={active ? 3.5 : 2.25}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={r.x} cy={topY} r={active ? 5 : 3.5} fill={s.color} />
      <circle cx={r.x} cy={r.y} r={1.8} fill={s.color} />
      {/* invisible, generous hit target. A click opens the session. */}
      <a
        href={href ?? undefined}
        aria-label={`${label}. Open the session in Activity Lookup.`}
        onClick={(event) => {
          if (!href) return;
          const touch = event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === "touch";
          if (touch && !active) {
            event.preventDefault();
            onEnter();
            return;
          }
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          navigate(href);
        }}
      >
        <rect
          x={r.x - 9}
          y={topY - 8}
          width={18}
          height={r.y - topY + 16}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onPointerEnter={onEnter}
          onPointerLeave={onLeave}
        />
      </a>
    </motion.g>
  );
}

function YearTick({
  t,
  progress,
  reduce,
}: {
  t: { year: string; x: number; frac: number };
  progress: MotionValue<number>;
  reduce: boolean | null;
}) {
  const at = penAt(t.frac);
  const start = Math.max(0, at - 0.03);
  const end = Math.min(1, Math.max(start + 0.001, at));
  const opacity = useTransform(progress, [start, end], [0, 1]);

  const baseline = H - PAD_BOTTOM;
  const anchor = t.x < W * 0.04 ? "start" : t.x > W * 0.96 ? "end" : "middle";
  return (
    <motion.g style={reduce ? { opacity: 0.9 } : { opacity }}>
      <line x1={t.x} y1={baseline} x2={t.x} y2={baseline + 7} className={styles.yearTick} />
      <text x={t.x} y={baseline + 22} className={styles.yearLabel} textAnchor={anchor}>
        {t.year}
      </text>
    </motion.g>
  );
}
