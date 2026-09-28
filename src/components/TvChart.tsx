import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { formatDate } from "../lib/format";
import { BANDS, BAND_COLOR, DAY0, DAY1, fmtTv, toDays, type TvPoint } from "../lib/training";
import styles from "./TvChart.module.css";

const W = 1000;
const H = 260;
const PAD_LEFT = 44; // room for threshold labels
const PAD_RIGHT = 16;
const PAD_TOP = 14;
const PAD_BOTTOM = 30;

const THRESHOLDS = BANDS.slice(1).map((b) => b.min);
const MIN_LABEL_GAP = 20; // viewBox units; clears the enlarged mobile label size

const px = (iso: string) =>
  PAD_LEFT + ((toDays(iso) - DAY0) / (DAY1 - DAY0)) * (W - PAD_LEFT - PAD_RIGHT);

interface Props {
  points: TvPoint[];
  label: string;
}

export function TvChart({ points, label }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);

  // Floor of 100 keeps every band visible; spiky series (e.g. a bike block
  // after weeks off) extend the axis instead of being clipped.
  const peak = Math.max(...points.map((p) => p.tv));
  const yMax = Math.max(100, Math.ceil(peak / 50) * 50);
  const py = (v: number) => PAD_TOP + (1 - v / yMax) * (H - PAD_TOP - PAD_BOTTOM);

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

  const coords = points.map((p) => ({ ...p, x: px(p.week_end), y: py(p.tv) }));

  // Weeks with no training in the whole window have no defined TV; break the
  // line there rather than bridging the gap.
  const path = coords
    .map((c, i) => {
      const gap = i > 0 && toDays(c.week_end) - toDays(coords[i - 1].week_end) > 7;
      return `${i === 0 || gap ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
    })
    .join(" ");

  const yearTicks = (() => {
    const seen = new Set<string>();
    const ticks: { year: string; x: number }[] = [];
    coords.forEach((c) => {
      const yr = c.week_end.slice(0, 4);
      if (!seen.has(yr)) {
        seen.add(yr);
        ticks.push({ year: yr, x: c.x });
      }
    });
    return ticks;
  })();

  const last = coords[coords.length - 1];
  const active = hovered === null ? null : coords[hovered];

  function track(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < coords.length; i++) {
      if (Math.abs(coords[i].x - x) < Math.abs(coords[best].x - x)) best = i;
    }
    setHovered(best);
  }

  const baseline = H - PAD_BOTTOM;
  const tipFrac = active ? active.x / W : 0;
  const tipShift = tipFrac < 0.18 ? "-12%" : tipFrac > 0.82 ? "-88%" : "-50%";

  return (
    <div className={styles.wrap}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        role="img"
        aria-label={`${label} training variability by week. Latest: ${fmtTv(last.tv)}, ${last.band}.`}
      >
        {BANDS.map((b) => {
          const top = Math.min(b.max, yMax);
          return (
            <rect
              key={b.name}
              x={PAD_LEFT}
              y={py(top)}
              width={W - PAD_LEFT - PAD_RIGHT}
              height={py(b.min) - py(top)}
              fill={b.color}
              className={styles.bandFill}
            />
          );
        })}

        {THRESHOLDS.map((t) => (
          <g key={t}>
            <line x1={PAD_LEFT} y1={py(t)} x2={W - PAD_RIGHT} y2={py(t)} className={styles.threshold} />
            {labelled.has(t) && (
              <text x={PAD_LEFT - 10} y={py(t) + 4} className={styles.axisLabel} textAnchor="end">
                {t}
              </text>
            )}
          </g>
        ))}
        <text x={PAD_LEFT - 10} y={py(yMax) + 4} className={styles.axisLabel} textAnchor="end">
          {yMax}
        </text>

        <line x1={PAD_LEFT} y1={baseline} x2={W - PAD_RIGHT} y2={baseline} className={styles.grid} />
        {yearTicks.map((t) => (
          <g key={t.year}>
            <line x1={t.x} y1={baseline} x2={t.x} y2={baseline + 7} className={styles.grid} />
            <text x={t.x} y={baseline + 22} className={styles.yearLabel} textAnchor="middle">
              {t.year}
            </text>
          </g>
        ))}

        <motion.path
          d={path}
          className={styles.line}
          initial={reduce ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: "-8%" }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />

        <circle cx={last.x} cy={last.y} r={9} fill={BAND_COLOR[last.band]} className={styles.halo} />
        <circle cx={last.x} cy={last.y} r={4.5} fill={BAND_COLOR[last.band]} />

        {active && (
          <g>
            <line x1={active.x} y1={PAD_TOP} x2={active.x} y2={baseline} className={styles.guide} />
            <circle
              cx={active.x}
              cy={active.y}
              r={5}
              fill="var(--bg)"
              stroke={BAND_COLOR[active.band]}
              strokeWidth={2}
            />
          </g>
        )}

        <rect
          x={PAD_LEFT}
          y={0}
          width={W - PAD_LEFT - PAD_RIGHT}
          height={H}
          fill="transparent"
          className={styles.hit}
          onPointerMove={(e) => track(e.clientX)}
          onPointerDown={(e) => track(e.clientX)}
          onPointerLeave={() => setHovered(null)}
        />
      </svg>

      {active && (
        <div
          className={styles.tip}
          style={{
            left: `${tipFrac * 100}%`,
            top: `${(active.y / H) * 100}%`,
            transform: `translate(${tipShift}, -118%)`,
            borderColor: BAND_COLOR[active.band],
          }}
        >
          <span className={styles.tipValue} style={{ color: BAND_COLOR[active.band] }}>
            {fmtTv(active.tv)} · {active.band}
          </span>
          <span className={styles.tipMeta}>
            {active.mean_hours.toFixed(1)} h/wk avg
            {active.zero_weeks > 0 &&
              ` · ${active.zero_weeks} week${active.zero_weeks === 1 ? "" : "s"} off`}
          </span>
          <span className={styles.tipDate}>Week ending {formatDate(active.week_end)}</span>
        </div>
      )}
    </div>
  );
}
