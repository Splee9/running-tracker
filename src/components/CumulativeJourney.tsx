import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { data, lifetime } from "../lib/data";
import { fmt } from "../lib/format";
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

export function CumulativeJourney() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  const pathLength = useTransform(scrollYProgress, [0.05, 0.95], [0, 1]);
  const hoveredRace = hovered === null ? null : RACE_MARKERS[hovered];

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
                active={hovered === i}
                progress={scrollYProgress}
                reduce={reduce}
                onEnter={() => setHovered(i)}
                onLeave={() => setHovered((h) => (h === i ? null : h))}
              />
            ))}
          </svg>

          {hoveredRace && (
            <div
              className={styles.raceTip}
              style={{
                left: `${(hoveredRace.x / W) * 100}%`,
                top: `${(Math.max(12, hoveredRace.y - RACE_STYLE[hoveredRace.distance].stem) / H) * 100}%`,
                color: RACE_STYLE[hoveredRace.distance].color,
                borderColor: RACE_STYLE[hoveredRace.distance].color,
              }}
            >
              <span className={styles.raceTipType}>{RACE_STYLE[hoveredRace.distance].label}</span>
              <span className={styles.raceTipDate}>{fmtMonth(hoveredRace.date)}</span>
            </div>
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

        <p className={styles.cue}>Hover a marker to see the race. The line is every mile, stacked end to end.</p>
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
  r: { date: string; distance: string; x: number; y: number; frac: number };
  active: boolean;
  progress: MotionValue<number>;
  reduce: boolean | null;
  onEnter: () => void;
  onLeave: () => void;
}) {
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
      {/* invisible, generous hit target for hover */}
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
