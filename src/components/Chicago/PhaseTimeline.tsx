import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { data, PHASE_VAR } from "../../lib/chicago-data";
import { formatDate } from "../../lib/chicago-format";
import styles from "./PhaseTimeline.module.css";

// Geometry for the volume-arc SVG.
const W = 1000;
const H = 260;
const PAD = { t: 24, r: 16, b: 44, l: 40 };
const plotW = W - PAD.l - PAD.r;
const plotH = H - PAD.t - PAD.b;

interface WeekTarget {
  week: number; // 1-based
  phase: number;
  target: number; // target mpw
}

/** Build a per-week target-volume series by interpolating each phase's arc. */
function buildTargets(): WeekTarget[] {
  const out: WeekTarget[] = [];
  let week = 1;
  data.phases.forEach((p, pi) => {
    for (let i = 0; i < p.weeks; i++) {
      const frac = p.weeks <= 1 ? 1 : i / (p.weeks - 1);
      out.push({ week: week++, phase: pi, target: Math.round(p.volStart + (p.volEnd - p.volStart) * frac) });
    }
  });
  return out;
}

export function PhaseTimeline() {
  const reduce = useReducedMotion();
  const [hoverPhase, setHoverPhase] = useState<number | null>(null);
  const { meta, phases } = data;
  const targets = buildTargets();
  const totalWeeks = targets.length;

  const maxV = Math.max(...targets.map((t) => t.target), meta.peakMpw) + 6;
  const x = (week: number) => PAD.l + (plotW * (week - 0.5)) / totalWeeks;
  const y = (v: number) => PAD.t + plotH * (1 - v / maxV);

  // Phase band x-extents (week ranges).
  let acc = 0;
  const bands = phases.map((p, pi) => {
    const startW = acc + 1;
    acc += p.weeks;
    const endW = acc;
    return {
      pi,
      x0: PAD.l + (plotW * (startW - 1)) / totalWeeks,
      x1: PAD.l + (plotW * endW) / totalWeeks,
    };
  });

  const linePts = targets.map((t) => `${x(t.week)},${y(t.target)}`).join(" ");
  const curX = x(meta.currentWeek);

  return (
    <section className={styles.section} aria-label="Training plan by phase">
      <p className="eyebrow">The 23-week plan</p>
      <h2 className={styles.heading}>
        Four mesocycles, {meta.blockStart.slice(5).replace("-", "/")} to race day — volume
        climbing {phases[0].volStart} → {meta.peakMpw} mpw, then taper.
      </h2>

      <div className={styles.chartWrap}>
        <svg
          className={styles.chart}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Target weekly mileage across the four training phases"
          preserveAspectRatio="none"
        >
          {/* y gridlines */}
          {[25, 50, 75, 88].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y(v) + 4} className={styles.axisLabel} textAnchor="end">
                {v}
              </text>
            </g>
          ))}

          {/* phase bands */}
          {bands.map((b) => (
            <rect
              key={b.pi}
              x={b.x0}
              y={PAD.t}
              width={b.x1 - b.x0}
              height={plotH}
              fill={`var(${PHASE_VAR[b.pi]})`}
              style={{
                opacity: hoverPhase === null ? 0.1 : hoverPhase === b.pi ? 0.26 : 0.05,
                cursor: "pointer",
                transition: "opacity 0.25s ease",
              }}
              onMouseEnter={() => setHoverPhase(b.pi)}
              onMouseLeave={() => setHoverPhase(null)}
            />
          ))}

          {/* hovered-phase name label */}
          {hoverPhase !== null && (
            <text
              x={(bands[hoverPhase].x0 + bands[hoverPhase].x1) / 2}
              y={PAD.t + 16}
              textAnchor="middle"
              className={styles.bandLabel}
              style={{ pointerEvents: "none" }}
            >
              {phases[hoverPhase].name}
            </text>
          )}

          {/* target volume line */}
          <motion.polyline
            points={linePts}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0 }}
            whileInView={reduce ? undefined : { pathLength: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* target points */}
          {targets.map((t) => {
            const isCur = t.week === meta.currentWeek;
            const inHover = hoverPhase === t.phase;
            return (
              <circle
                key={t.week}
                cx={x(t.week)}
                cy={y(t.target)}
                r={isCur ? 5 : inHover ? 4 : 2.5}
                fill={isCur || inHover ? `var(${PHASE_VAR[t.phase]})` : "var(--ink)"}
                style={{ transition: "r 0.2s ease, fill 0.2s ease" }}
              />
            );
          })}

          {/* "you are here" marker */}
          <line x1={curX} x2={curX} y1={PAD.t} y2={PAD.t + plotH} stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
          <text x={curX} y={PAD.t + plotH + 30} className={styles.nowLabel} textAnchor="middle">
            you are here · wk {meta.currentWeek}
          </text>
        </svg>
      </div>

      <div className={styles.phaseCards}>
        {phases.map((p, pi) => {
          const isCurrent = pi === meta.currentPhase;
          return (
            <div
              key={p.name}
              className={`${styles.phaseCard} ${isCurrent ? styles.current : ""} ${
                hoverPhase === pi ? styles.cardHover : ""
              }`}
              style={{ borderTopColor: `var(${PHASE_VAR[pi]})` }}
              onMouseEnter={() => setHoverPhase(pi)}
              onMouseLeave={() => setHoverPhase(null)}
              onFocus={() => setHoverPhase(pi)}
              onBlur={() => setHoverPhase(null)}
              tabIndex={0}
            >
              <div className={styles.phaseHead}>
                <span className={styles.phaseNum} style={{ color: `var(${PHASE_VAR[pi]})` }}>
                  {pi + 1}
                </span>
                <span className={styles.phaseName}>{p.name}</span>
                {isCurrent && <span className={styles.nowChip}>now</span>}
              </div>
              <p className={styles.phaseDates}>
                {formatDate(p.start)} – {formatDate(p.end)}
              </p>
              <p className={styles.phaseVol}>
                {p.weeks} wks · {p.volStart}
                {p.volEnd >= p.volStart ? " → " : " → "}
                {p.volEnd} mpw
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
