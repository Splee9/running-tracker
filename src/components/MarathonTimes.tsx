import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { marathonResults } from "../lib/data";
import { formatTime } from "../lib/format";
import styles from "./MarathonTimes.module.css";

// ---- geometry (static; data is baked in) --------------------------------
const W = 1000;
const H = 400;
const PAD_LEFT = 58; // room for y-axis time labels
const PAD_RIGHT = 22;
const PAD_TOP = 64;
const PAD_BOTTOM = 34;

const MARATHON_COLOR = "#c0432f"; // matches "The long way" marathon markers

const M = [...marathonResults].sort((a, b) => a.date.localeCompare(b.date));

const toDays = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

// x: date domain (with a little breathing room on each side)
const days = M.map((r) => toDays(r.date));
const t0 = days.length ? Math.min(...days) : 0;
const t1 = days.length ? Math.max(...days) : 1;
const tSpan = Math.max(1, t1 - t0);
const domX0 = t0 - tSpan * 0.06;
const domX1 = t1 + tSpan * 0.06;

// y: finish-time domain, INVERTED so faster (fewer seconds) sits higher
const secs = M.map((r) => r.seconds);
const sMin = secs.length ? Math.min(...secs) : 0;
const sMax = secs.length ? Math.max(...secs) : 1;
const sPad = Math.max(60, (sMax - sMin) * 0.22);
const domY0 = sMin - sPad; // fastest end (top)
const domY1 = sMax + sPad; // slowest end (bottom)

const px = (iso: string) =>
  PAD_LEFT + ((toDays(iso) - domX0) / (domX1 - domX0)) * (W - PAD_LEFT - PAD_RIGHT);
const py = (s: number) =>
  PAD_TOP + ((s - domY0) / (domY1 - domY0)) * (H - PAD_TOP - PAD_BOTTOM);

// reveal pen: maps an x-fraction to the scroll-progress at which it appears
const penAt = (frac: number) => 0.06 + 0.88 * frac;

const POINTS = M.map((r) => {
  const x = px(r.date);
  const frac = (x - PAD_LEFT) / (W - PAD_LEFT - PAD_RIGHT);
  return { ...r, x, y: py(r.seconds), frac, revealAt: penAt(frac) };
});

const LINE_PATH = POINTS.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

const BEST = secs.length ? Math.min(...secs) : 0;
const DEBUT = POINTS.length ? POINTS[0].seconds : 0;

// y-axis gridlines on 15-minute (900 s) boundaries inside the domain
const GRID: number[] = [];
for (let t = Math.ceil(domY0 / 900) * 900; t <= domY1; t += 900) GRID.push(t);
const hhmm = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
};

// one x-tick per year, placed at that year's first marathon
const YEAR_TICKS = (() => {
  const seen = new Set<string>();
  const ticks: { year: string; x: number; frac: number }[] = [];
  POINTS.forEach((p) => {
    const yr = p.date.slice(0, 4);
    if (!seen.has(yr)) {
      seen.add(yr);
      ticks.push({ year: yr, x: p.x, frac: p.frac });
    }
  });
  return ticks;
})();

export function MarathonTimes() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  const lineLength = useTransform(scrollYProgress, [0.06, 0.94], [0, 1]);
  const hoveredPoint = hovered === null ? null : POINTS[hovered];

  if (!POINTS.length) return null;

  return (
    <section ref={ref} className={styles.section} aria-label="Marathon finish times over time">
      <div className={styles.sticky}>
        <p className="eyebrow">Getting faster</p>
        <BestTime progress={scrollYProgress} reduce={reduce} />

        <div className={styles.chartWrap}>
          <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg}>
            {/* y gridlines + time labels (faster at top) */}
            {GRID.map((t) => {
              const y = py(t);
              return (
                <g key={t}>
                  <line x1={PAD_LEFT} y1={y} x2={W - PAD_RIGHT} y2={y} className={styles.grid} />
                  <text x={PAD_LEFT - 10} y={y + 4} className={styles.gridLabel} textAnchor="end">
                    {hhmm(t)}
                  </text>
                </g>
              );
            })}

            {/* x baseline + year ticks */}
            <line
              x1={PAD_LEFT}
              y1={H - PAD_BOTTOM}
              x2={W - PAD_RIGHT}
              y2={H - PAD_BOTTOM}
              className={styles.grid}
            />
            {YEAR_TICKS.map((tk) => (
              <YearTick key={tk.year} t={tk} progress={scrollYProgress} reduce={reduce} />
            ))}

            {/* "faster" axis hint */}
            <text x={PAD_LEFT - 10} y={PAD_TOP - 20} className={styles.axisHint} textAnchor="end">
              faster ↑
            </text>

            {/* connecting line draws in as you scroll */}
            <motion.path
              d={LINE_PATH}
              className={styles.line}
              style={{ pathLength: reduce ? 1 : lineLength }}
            />

            {/* points pop in chronologically */}
            {POINTS.map((p, i) => (
              <ResultPoint
                key={`${p.date}-${i}`}
                p={p}
                active={hovered === i}
                progress={scrollYProgress}
                reduce={reduce}
                onEnter={() => setHovered(i)}
                onLeave={() => setHovered((h) => (h === i ? null : h))}
              />
            ))}
          </svg>

          {hoveredPoint && (
            <div
              className={styles.tip}
              style={{
                left: `${(hoveredPoint.x / W) * 100}%`,
                top: `${(hoveredPoint.y / H) * 100}%`,
              }}
            >
              <span className={styles.tipName}>
                {hoveredPoint.name}
                {hoveredPoint.pr && <span className={styles.tipPr}>PR</span>}
              </span>
              <span className={styles.tipTime}>{formatTime(hoveredPoint.seconds)}</span>
              <span className={styles.tipDate}>{hoveredPoint.date.slice(0, 4)}</span>
            </div>
          )}
        </div>

        <p className={styles.cue}>
          Six marathons, fastest to the top. Hover a dot for the race — filled dots are PRs.
        </p>
      </div>
    </section>
  );
}

function BestTime({ progress, reduce }: { progress: MotionValue<number>; reduce: boolean | null }) {
  const [secsDisplay, setSecsDisplay] = useState(reduce ? BEST : DEBUT);
  useMotionValueEvent(progress, "change", (v) => {
    if (reduce) return;
    let best: number | null = null;
    for (const p of POINTS) {
      if (v >= p.revealAt - 0.01) best = best === null ? p.seconds : Math.min(best, p.seconds);
    }
    setSecsDisplay(best === null ? DEBUT : best);
  });
  return (
    <div className={styles.best}>
      <span className={styles.bestNum}>{formatTime(secsDisplay)}</span>
      <span className={styles.bestUnit}>marathon best</span>
    </div>
  );
}

function ResultPoint({
  p,
  active,
  progress,
  reduce,
  onEnter,
  onLeave,
}: {
  p: { date: string; name: string; seconds: number; pr: boolean; x: number; y: number; revealAt: number };
  active: boolean;
  progress: MotionValue<number>;
  reduce: boolean | null;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const start = Math.max(0, p.revealAt - 0.04);
  const end = Math.min(1, Math.max(start + 0.001, p.revealAt));
  const opacity = useTransform(progress, [start, end], [0, 1]);
  const ty = useTransform(progress, [start, end], [10, 0]);

  const r = p.pr ? 7 : 5.5;
  return (
    <motion.g style={reduce ? { opacity: 1 } : { opacity, y: ty }}>
      {/* drop line to the baseline for a sense of "where on the clock" */}
      <line x1={p.x} y1={p.y} x2={p.x} y2={H - PAD_BOTTOM} className={styles.drop} />
      {active && <circle cx={p.x} cy={p.y} r={r + 5} className={styles.halo} />}
      <circle
        cx={p.x}
        cy={p.y}
        r={active ? r + 1.5 : r}
        fill={p.pr ? MARATHON_COLOR : "var(--bg)"}
        stroke={MARATHON_COLOR}
        strokeWidth={2}
      />
      {/* generous invisible hit target */}
      <circle
        cx={p.x}
        cy={p.y}
        r={16}
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
  return (
    <motion.g style={reduce ? { opacity: 0.9 } : { opacity }}>
      <line x1={t.x} y1={baseline} x2={t.x} y2={baseline + 7} className={styles.yearTick} />
      <text x={t.x} y={baseline + 23} className={styles.yearLabel} textAnchor="middle">
        {t.year}
      </text>
    </motion.g>
  );
}
