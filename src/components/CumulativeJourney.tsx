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
  { miles: 2790, label: "coast to coast, U.S." },
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

export function CumulativeJourney() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  const pathLength = useTransform(scrollYProgress, [0.05, 0.95], [0, 1]);

  return (
    <section ref={ref} className={styles.section} aria-label="Cumulative distance over time">
      <div className={styles.sticky}>
        <p className="eyebrow">The long way</p>
        <JourneyTotal progress={scrollYProgress} reduce={reduce} />

        <div className={styles.chartWrap}>
          <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} aria-hidden>
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
          </svg>
        </div>

        <p className={styles.cue}>Keep scrolling — the line is every mile, stacked end to end.</p>
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
