import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { Chip } from "./Chip";
import { RaceChartTip } from "./RaceLinks";
import { data, marathonResults, type RaceDistance } from "../lib/data";
import { data as chicago } from "../lib/chicago-data";
import { fmt, formatTime } from "../lib/format";
import { lookupYearHref } from "../lib/links";
import { RACE_DISTANCE_COLOR, raceKey, raceSessionHref, type RaceFocus } from "../lib/races";
import { Link, navigate } from "../lib/router";
import type { MilesScope } from "../hooks/useMilesYear";
import styles from "./Timeline.module.css";

// ---- one stage, two views ---------------------------------------------------
// Distance: every mile stacked end to end, race markers on the line.
// Speed: the marathon markers leave the line and settle on finish time.

const W = 1000;
const H = 400;
const PAD_LEFT = 58;
const PAD_RIGHT = 22;
const PAD_TOP = 60;
const PAD_BOTTOM = 34;
const BASE = H - PAD_BOTTOM;

// Scroll progress (section start → end) for each beat.
const DRAW: [number, number] = [0.03, 0.46];
const MORPH: [number, number] = [0.54, 0.7];
const SPEED_DRAW: [number, number] = [0.7, 0.88];
const GHOST: [number, number] = [0.86, 0.92];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtMonth = (ym: string) => `${MON[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const daysInMonth = (iso: string) => new Date(+iso.slice(0, 4), +iso.slice(5, 7), 0).getDate();
const toDays = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

// ---- distance geometry --------------------------------------------------------
const months = data.monthly;
const N = months.length;
const MAX_CUM = months[N - 1].cumulative;
const dx = (i: number) => PAD_LEFT + (i / (N - 1)) * (W - PAD_LEFT - PAD_RIGHT);
const dy = (cum: number) => BASE - (cum / MAX_CUM) * (BASE - PAD_TOP);
const PATH = months.map((m, i) => `${i === 0 ? "M" : "L"} ${dx(i).toFixed(1)} ${dy(m.cumulative).toFixed(1)}`).join(" ");

/** Pen position for a fractional month index: where the line is drawn to at progress p. */
const penAt = (frac: number) => DRAW[0] + (DRAW[1] - DRAW[0]) * frac;

const MILESTONES = [
  { miles: 874, label: "the length of Britain" },
  { miles: 2760, label: "Chicago to Miami and back" },
  { miles: 6786, label: "the Moon's circumference" },
  { miles: 12450, label: "halfway around the Earth" },
]
  .filter((m) => m.miles <= MAX_CUM)
  .map((m) => {
    const i = Math.max(0, months.findIndex((mo) => mo.cumulative >= m.miles));
    return { ...m, x: dx(i), y: dy(months[i].cumulative), frac: i / (N - 1) };
  });

const DIST_YEARS = (() => {
  const out: { year: number; x: number; x1: number; frac: number }[] = [];
  months.forEach((m, i) => {
    const year = +m.month.slice(0, 4);
    const last = out.at(-1);
    if (last?.year === year) last.x1 = dx(i);
    else out.push({ year, x: dx(i), x1: dx(i), frac: i / (N - 1) });
  });
  return out;
})();

const STEM: Record<RaceDistance, number> = { marathon: 30, half: 24, "10K": 19, "5K": 14 };
const LABEL: Record<RaceDistance, string> = { marathon: "Marathon", half: "Half", "10K": "10K", "5K": "5K" };

function onLine(date: string) {
  const idx = months.findIndex((m) => m.month === date.slice(0, 7));
  if (idx === -1) return null;
  const dayFrac = Math.min(0.999, (+date.slice(8, 10) - 1) / daysInMonth(date));
  const fi = idx + dayFrac;
  const c0 = months[idx].cumulative;
  const c1 = months[Math.min(N - 1, idx + 1)].cumulative;
  return { x: dx(fi), y: dy(c0 + (c1 - c0) * dayFrac), frac: fi / (N - 1) };
}

// ---- speed geometry ---------------------------------------------------------------
const RESULTS = [...marathonResults].sort((a, b) => a.date.localeCompare(b.date));

const GOAL_SECONDS = (() => {
  const m = /(\d+):(\d{2}):(\d{2})/.exec(chicago.meta.goal);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
})();
// The goal dot is for a race still ahead. Once a result lands on that date it is a real point.
const GHOST_RACE =
  GOAL_SECONDS != null && !RESULTS.some((r) => r.date === chicago.meta.raceDate) && RESULTS.length > 0
    ? { date: chicago.meta.raceDate, seconds: GOAL_SECONDS }
    : null;

const sDates = [...RESULTS.map((r) => toDays(r.date)), ...(GHOST_RACE ? [toDays(GHOST_RACE.date)] : [])];
const t0 = Math.min(...sDates);
const t1 = Math.max(...sDates);
const tPad = Math.max(30, (t1 - t0) * 0.06);
const sx = (iso: string) =>
  PAD_LEFT + ((toDays(iso) - (t0 - tPad)) / (t1 - t0 + 2 * tPad)) * (W - PAD_LEFT - PAD_RIGHT);

const secs = [...RESULTS.map((r) => r.seconds), ...(GHOST_RACE ? [GHOST_RACE.seconds] : [])];
const sPad = Math.max(60, (Math.max(...secs) - Math.min(...secs)) * 0.22);
const yFast = Math.min(...secs) - sPad;
const ySlow = Math.max(...secs) + sPad;
const sy = (s: number) => PAD_TOP + ((s - yFast) / (ySlow - yFast)) * (BASE - PAD_TOP);

const GRID: number[] = [];
for (let t = Math.ceil(yFast / 900) * 900; t <= ySlow; t += 900) GRID.push(t);
const hhmm = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;

const SPEED_YEARS = (() => {
  const out: { year: number; x: number }[] = [];
  const first = +new Date((t0 - tPad) * 86_400_000).toISOString().slice(0, 4);
  const last = +new Date((t1 + tPad) * 86_400_000).toISOString().slice(0, 4);
  for (let y = first + 1; y <= last; y++) out.push({ year: y, x: sx(`${y}-01-01`) });
  return out.filter((t) => t.x > PAD_LEFT + 10 && t.x < W - PAD_RIGHT - 10);
})();

const BEST = Math.min(...RESULTS.map((r) => r.seconds));
const DEBUT = RESULTS[0]?.seconds ?? BEST;

// ---- markers ------------------------------------------------------------------------
type Marker = {
  key: string;
  date: string;
  distance: RaceDistance;
  year: number;
  // distance view
  x: number;
  y: number;
  top: number;
  frac: number;
  // speed view (marathons only)
  speed: { x: number; y: number; seconds: number; pr: boolean; revealAt: number } | null;
};

const MARKERS: Marker[] = data.raceEvents.flatMap((r) => {
  const p = onLine(r.date);
  if (!p) return [];
  const result = r.distance === "marathon" ? RESULTS.find((m) => m.date === r.date) : undefined;
  const speedX = result ? sx(result.date) : 0;
  return [
    {
      key: raceKey(r),
      date: r.date,
      distance: r.distance,
      year: +r.date.slice(0, 4),
      ...p,
      top: Math.max(12, p.y - STEM[r.distance]),
      speed: result
        ? {
            x: speedX,
            y: sy(result.seconds),
            seconds: result.seconds,
            pr: result.pr,
            revealAt: SPEED_DRAW[0] + (SPEED_DRAW[1] - SPEED_DRAW[0]) * ((speedX - PAD_LEFT) / (W - PAD_LEFT - PAD_RIGHT)),
          }
        : null,
    },
  ];
});
const SPEED_MARKERS = MARKERS.filter((m) => m.speed).sort((a, b) => a.date.localeCompare(b.date));
const SPEED_PATH = SPEED_MARKERS.map(
  (m, i) => `${i === 0 ? "M" : "L"} ${m.speed!.x.toFixed(1)} ${m.speed!.y.toFixed(1)}`,
).join(" ");

const GHOST_POINT = GHOST_RACE ? { x: sx(GHOST_RACE.date), y: sy(GHOST_RACE.seconds) } : null;
const LAST_SPEED = SPEED_MARKERS.at(-1)?.speed ?? null;

type TipAnchor = { left: string; top: string; color: string };

export function Timeline({
  selected,
  onChoose,
  raceFocus,
  onFocusRace,
}: {
  selected: MilesScope;
  onChoose: (scope: MilesScope) => void;
  raceFocus: RaceFocus;
  onFocusRace: (focus: RaceFocus) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  // Reduced motion has no scroll runway: the view chips set the stage directly.
  const manual = useMotionValue(0);
  const scrollMorph = useTransform(scrollYProgress, MORPH, [0, 1]);
  const morph = reduce ? manual : scrollMorph;
  const scrollDraw = useTransform(scrollYProgress, DRAW, [0, 1]);
  const draw = reduce ? manual : scrollDraw;
  const progress = reduce ? manual : scrollYProgress;

  const [view, setView] = useState<"distance" | "speed">("distance");
  useMotionValueEvent(morph, "change", (v) => setView(v >= 0.5 ? "speed" : "distance"));

  const [hovered, setHovered] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<TipAnchor | null>(null);

  function show(marker: Marker) {
    const t = clamp01(morph.get());
    const speed = marker.speed && t >= 0.5;
    const x = marker.speed ? lerp(marker.x, marker.speed.x, t) : marker.x;
    const y = speed ? marker.speed!.y : marker.top;
    setHovered(marker.key);
    setAnchor({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, color: RACE_DISTANCE_COLOR[marker.distance] });
    onFocusRace({ key: marker.key, pin: false });
  }

  function showRelated(key: string) {
    onFocusRace({ key, pin: false });
    // Keep the card under the pointer. Moving it would drop the hover.
    setHovered(key);
  }

  function leave(event: ReactPointerEvent) {
    const next = event.relatedTarget;
    if (next instanceof Node && tipRef.current?.contains(next)) return;
    setHovered(null);
  }

  function jump(to: "distance" | "speed") {
    if (reduce) {
      manual.set(to === "speed" ? 1 : 0);
      setView(to);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const runway = el.offsetHeight - window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const at = to === "speed" ? SPEED_DRAW[1] + 0.02 : DRAW[1];
    window.scrollTo({ top: top + runway * at, behavior: "smooth" });
  }

  const distOpacity = useTransform(morph, [0, 0.45], [1, 0]);
  const speedOpacity = useTransform(morph, [0.55, 1], [0, 1]);
  const distEvents = useTransform(morph, (v) => (v < 0.5 ? "auto" : "none"));
  const speedEvents = useTransform(morph, (v) => (v >= 0.5 ? "auto" : "none"));
  const speedLine = useTransform(progress, SPEED_DRAW, [0, 1]);
  const ghostOpacity = useTransform(progress, GHOST, [0, 1]);

  const band = selected === "lifetime" ? null : DIST_YEARS.find((y) => y.year === selected) ?? null;

  return (
    <section ref={ref} className={styles.section} aria-label="Distance and marathon times over time">
      <div className={styles.sticky}>
        <div className={styles.head}>
          <p className="eyebrow">{view === "distance" ? "The long way" : "Getting faster"}</p>
          <div className={styles.views} role="group" aria-label="Timeline view">
            <Chip active={view === "distance"} onClick={() => jump("distance")}>
              Distance
            </Chip>
            <Chip active={view === "speed"} onClick={() => jump("speed")}>
              Marathon times
            </Chip>
          </div>
        </div>

        {view === "distance" ? <PenReadout draw={draw} /> : <BestReadout progress={progress} reduce={reduce} />}

        <div className={styles.chartWrap}>
          <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg}>
            {/* ---- distance layer ---- */}
            <motion.g style={{ opacity: distOpacity, pointerEvents: distEvents }}>
              {band && (
                <rect
                  x={band.x - 4}
                  y={PAD_TOP - 24}
                  width={Math.max(8, band.x1 - band.x + 8)}
                  height={BASE - PAD_TOP + 24}
                  rx={6}
                  className={styles.band}
                />
              )}
              <line x1={PAD_LEFT} y1={BASE} x2={W - PAD_RIGHT} y2={BASE} className={styles.axis} />
              <path d={PATH} className={styles.track} />
              {DIST_YEARS.map((t) => (
                <YearTick
                  key={t.year}
                  year={t.year}
                  x={t.x}
                  active={selected === t.year}
                  progress={progress}
                  at={penAt(t.frac)}
                  reduce={reduce}
                  onChoose={onChoose}
                />
              ))}
              <motion.path d={PATH} className={styles.draw} style={{ pathLength: draw }} />
              {MILESTONES.map((m) => (
                <Milestone key={m.miles} m={m} progress={progress} reduce={reduce} />
              ))}
            </motion.g>

            {/* ---- speed layer ---- */}
            <motion.g style={{ opacity: speedOpacity, pointerEvents: speedEvents }}>
              {GRID.map((t) => (
                <g key={t}>
                  <line x1={PAD_LEFT} y1={sy(t)} x2={W - PAD_RIGHT} y2={sy(t)} className={styles.grid} />
                  <text x={PAD_LEFT - 10} y={sy(t) + 4} className={styles.gridLabel} textAnchor="end">
                    {hhmm(t)}
                  </text>
                </g>
              ))}
              <line x1={PAD_LEFT} y1={BASE} x2={W - PAD_RIGHT} y2={BASE} className={styles.axis} />
              <text x={PAD_LEFT - 10} y={PAD_TOP - 22} className={styles.axisHint} textAnchor="end">
                faster ↑
              </text>
              {SPEED_YEARS.map((t) => (
                <YearTick
                  key={t.year}
                  year={t.year}
                  x={t.x}
                  active={selected === t.year}
                  progress={progress}
                  at={0}
                  reduce={reduce}
                  onChoose={onChoose}
                />
              ))}
              <motion.path d={SPEED_PATH} className={styles.speedLine} style={{ pathLength: speedLine }} />
              {GHOST_POINT && LAST_SPEED && (
                <motion.g style={{ opacity: ghostOpacity }}>
                  <line
                    x1={LAST_SPEED.x}
                    y1={LAST_SPEED.y}
                    x2={GHOST_POINT.x}
                    y2={GHOST_POINT.y}
                    className={styles.ghostLine}
                  />
                  <Link href="/training/chicago" aria-label="Chicago Marathon build: training tracker">
                    <circle cx={GHOST_POINT.x} cy={GHOST_POINT.y} r={9} className={styles.ghost} />
                    <circle cx={GHOST_POINT.x} cy={GHOST_POINT.y} r={18} fill="transparent" />
                    <text
                      x={GHOST_POINT.x - 16}
                      y={GHOST_POINT.y - 16}
                      className={styles.ghostLabel}
                      textAnchor="end"
                    >
                      Chicago · goal {formatTime(GHOST_RACE!.seconds)}
                    </text>
                  </Link>
                </motion.g>
              )}
            </motion.g>

            {/* ---- race markers: marathons travel between the views ---- */}
            {MARKERS.map((m) => (
              <RaceMarker
                key={m.key}
                m={m}
                active={hovered === m.key || raceFocus?.key === m.key || (selected !== "lifetime" && selected === m.year)}
                morph={morph}
                progress={progress}
                reduce={reduce}
                onEnter={() => show(m)}
                onLeave={leave}
              />
            ))}
          </svg>

          {hovered && anchor && (
            <RaceChartTip
              ref={tipRef}
              raceKeyValue={hovered}
              anchor={anchor}
              onRelate={showRelated}
              onPointerLeave={leave}
            />
          )}
        </div>

        <div className={styles.foot}>
          {view === "distance" ? (
            <div className={styles.legend} aria-hidden>
              {(Object.keys(LABEL) as RaceDistance[]).map((d) => (
                <span key={d} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: RACE_DISTANCE_COLOR[d] }} />
                  {LABEL[d]}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.cue}>
              {SPEED_MARKERS.length} marathons, fastest at the top. Filled dots are PRs.
            </p>
          )}
          <p className={styles.links}>
            {selected !== "lifetime" && <Link href={lookupYearHref(selected)}>Sessions in {selected}</Link>}
            <Link href="/training/chicago">The Chicago build</Link>
            <Link href="/training">How steady the training is</Link>
          </p>
        </div>
      </div>
    </section>
  );
}

/** Fades in as the pen reaches `at`. Reduced motion shows it. */
function useRevealAt(progress: MotionValue<number>, at: number, lead: number, reduce: boolean | null) {
  const start = Math.max(0, at - lead);
  const end = Math.min(1, Math.max(start + 0.001, at));
  const opacity = useTransform(progress, [start, end], [0, 1]);
  return reduce ? 1 : opacity;
}

function PenReadout({ draw }: { draw: MotionValue<number> }) {
  const [t, setT] = useState(() => clamp01(draw.get()));
  useMotionValueEvent(draw, "change", (v) => setT(clamp01(v)));
  const fi = t * (N - 1);
  const i = Math.floor(fi);
  const a = months[i];
  const b = months[Math.min(N - 1, i + 1)];
  const miles = t <= 0 ? 0 : lerp(a.cumulative, b.cumulative, fi - i);
  return (
    <div className={styles.readout}>
      <span className={styles.readNum}>{fmt(miles)}</span>
      <span className={styles.readUnit}>miles by {fmtMonth(months[Math.round(fi)].month)}</span>
    </div>
  );
}

function BestReadout({ progress, reduce }: { progress: MotionValue<number>; reduce: boolean | null }) {
  const best = (v: number) => {
    if (reduce) return BEST;
    let out: number | null = null;
    for (const m of SPEED_MARKERS) if (v >= m.speed!.revealAt - 0.01) out = Math.min(out ?? Infinity, m.speed!.seconds);
    return out ?? DEBUT;
  };
  const [secsShown, setSecs] = useState(() => best(progress.get()));
  useMotionValueEvent(progress, "change", (v) => setSecs(best(v)));
  return (
    <div className={styles.readout}>
      <span className={styles.readNum}>{formatTime(secsShown)}</span>
      <span className={styles.readUnit}>marathon best</span>
    </div>
  );
}

function YearTick({
  year,
  x,
  active,
  progress,
  at,
  reduce,
  onChoose,
}: {
  year: number;
  x: number;
  active: boolean;
  progress: MotionValue<number>;
  /** Progress at which the tick appears. 0 shows it from the start. */
  at: number;
  reduce: boolean | null;
  onChoose: (scope: MilesScope) => void;
}) {
  const opacity = useRevealAt(progress, at, 0.03, reduce);
  const anchor = x < PAD_LEFT + 20 ? "start" : x > W - PAD_RIGHT - 20 ? "end" : "middle";
  return (
    <motion.g style={{ opacity }}>
      <line x1={x} y1={BASE} x2={x} y2={BASE + 7} className={styles.yearTick} />
      <text
        x={x}
        y={BASE + 23}
        className={`${styles.yearLabel} ${active ? styles.yearLabelOn : ""}`}
        textAnchor={anchor}
        role="button"
        tabIndex={0}
        aria-pressed={active}
        aria-label={`Show ${year} up top`}
        onClick={() => onChoose(active ? "lifetime" : year)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onChoose(active ? "lifetime" : year);
          }
        }}
      >
        {year}
      </text>
    </motion.g>
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
  const opacity = useRevealAt(progress, penAt(m.frac), 0.04, reduce);
  const labelY = m.y - 22;
  const anchor = m.x > W * 0.8 ? "end" : m.x < W * 0.15 ? "start" : "middle";
  return (
    <motion.g style={{ opacity }}>
      <line x1={m.x} y1={m.y} x2={m.x} y2={labelY + 5} className={styles.leader} />
      <circle cx={m.x} cy={m.y} r={4} className={styles.dot} />
      <text x={m.x} y={labelY} className={styles.label} textAnchor={anchor}>
        {fmt(m.miles)} mi · {m.label}
      </text>
    </motion.g>
  );
}

function RaceMarker({
  m,
  active,
  morph,
  progress,
  reduce,
  onEnter,
  onLeave,
}: {
  m: Marker;
  active: boolean;
  morph: MotionValue<number>;
  progress: MotionValue<number>;
  reduce: boolean | null;
  onEnter: () => void;
  onLeave: (event: ReactPointerEvent<SVGCircleElement>) => void;
}) {
  const color = RACE_DISTANCE_COLOR[m.distance];
  const href = raceSessionHref(m);
  const reveal = useRevealAt(progress, penAt(m.frac), 0.025, reduce);
  const stemOpacity = useTransform(morph, [0, 0.4], [1, 0]);
  // Non-marathons leave with the distance layer; marathons travel to their finish time.
  const away = useTransform(morph, [0, 0.45], [1, 0]);
  const cx = useTransform(morph, (t) => (m.speed ? lerp(m.x, m.speed.x, clamp01(t)) : m.x));
  const cy = useTransform(morph, (t) => (m.speed ? lerp(m.top, m.speed.y, clamp01(t)) : m.top));
  const events = useTransform(morph, (t) => (m.speed || t < 0.5 ? "auto" : "none"));
  const r = m.speed ? (m.speed.pr ? 7 : 5.5) : 3.5;
  const label = `${LABEL[m.distance]} ${fmtMonth(m.date.slice(0, 7))}`;

  return (
    <motion.g style={{ opacity: reveal }}>
      <motion.g style={{ opacity: m.speed ? 1 : away, pointerEvents: events }}>
        <motion.line
          x1={m.x}
          y1={m.y}
          x2={m.x}
          y2={m.top}
          stroke={color}
          strokeWidth={active ? 3.5 : 2.25}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ opacity: stemOpacity }}
        />
        <motion.circle cx={m.x} cy={m.y} r={1.8} fill={color} style={{ opacity: stemOpacity }} />
        {active && m.speed && <motion.circle cx={cx} cy={cy} r={r + 6} fill={color} opacity={0.14} />}
        <motion.circle
          cx={cx}
          cy={cy}
          r={active ? r + 1.5 : r}
          fill={!m.speed || m.speed.pr ? color : "var(--bg)"}
          stroke={color}
          strokeWidth={m.speed ? 2 : 0}
        />
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
          <motion.circle
            cx={cx}
            cy={cy}
            r={14}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onPointerEnter={onEnter}
            onPointerLeave={onLeave}
          />
        </a>
      </motion.g>
    </motion.g>
  );
}
