import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AnimatedNumber } from "../AnimatedNumber";
import { data, PHASE_VAR, TYPE_VAR, type WeekDatum } from "../../lib/chicago-data";
import { fmt1, formatDate } from "../../lib/chicago-format";
import styles from "./WeeklyLoad.module.css";

const W = 1000;
const H = 340;
const PAD = { t: 20, r: 14, b: 38, l: 36 };
const plotW = W - PAD.l - PAD.r;
const plotH = H - PAD.t - PAD.b;

export function WeeklyLoad() {
  const reduce = useReducedMotion();
  const { weeks, typeOrder, typeLabels } = data;
  const [selected, setSelected] = useState<number>(weeks.length - 1);
  const sel = weeks[selected];

  const maxMiles = Math.max(...weeks.map((w) => w.miles), ...weeks.map((w) => w.rolling4)) * 1.15;
  const n = weeks.length;
  const slot = plotW / n;
  const barW = Math.min(slot * 0.6, 46);
  const cx = (i: number) => PAD.l + slot * (i + 0.5);
  const y = (v: number) => PAD.t + plotH * (1 - v / maxMiles);

  const rollPts = weeks.map((w, i) => `${cx(i)},${y(w.rolling4)}`).join(" ");

  // EF sparkline geometry (own vertical scale, drawn in its own card).
  const efVals = weeks.map((w) => w.easyEF).filter((v): v is number => v != null);
  const efMin = Math.min(...efVals) - 0.02;
  const efMax = Math.max(...efVals) + 0.02;
  const efY = (v: number) => 24 + 56 * (1 - (v - efMin) / (efMax - efMin));
  const EF_BASE = 92; // area-fill baseline in the EF chart's viewBox

  // Index of the best (highest-EF) week, for a "best" marker.
  let efBestIdx = -1;
  let efBestVal = -Infinity;
  weeks.forEach((w, i) => {
    if (w.easyEF != null && w.easyEF > efBestVal) {
      efBestVal = w.easyEF;
      efBestIdx = i;
    }
  });

  // Points + filled-area path for the EF trend.
  const efPts = weeks
    .map((w, i) => (w.easyEF != null ? { x: cx(i), y: efY(w.easyEF) } : null))
    .filter((p): p is { x: number; y: number } => p != null);
  const efLinePts = efPts.map((p) => `${p.x},${p.y}`).join(" ");
  const efAreaPath = efPts.length
    ? `M ${efPts[0].x},${EF_BASE} ` +
      efPts.map((p) => `L ${p.x},${p.y}`).join(" ") +
      ` L ${efPts[efPts.length - 1].x},${EF_BASE} Z`
    : "";

  return (
    <section className={styles.section} aria-label="Weekly training load">
      <p className="eyebrow">Week by week</p>
      <h2 className={styles.heading}>
        Every week of the build — mileage, what kind of running it was, and the
        4-week rolling average underneath.
      </h2>

      <WeekReadout week={sel} />

      <div className={styles.chartWrap}>
        <svg
          className={styles.chart}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Weekly mileage by workout type with a 4-week rolling average"
        >
          {/* y gridlines */}
          {gridTicks(maxMiles).map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y(v) + 4} className={styles.axisLabel} textAnchor="end">
                {v}
              </text>
            </g>
          ))}

          {/* stacked bars */}
          {weeks.map((w, i) => {
            let yCursor = y(0);
            const isSel = i === selected;
            return (
              <g
                key={w.week}
                className={styles.barGroup}
                onMouseEnter={() => setSelected(i)}
                onClick={() => setSelected(i)}
                tabIndex={0}
                role="button"
                aria-label={`Week ${w.week}, ${w.miles} miles`}
                onFocus={() => setSelected(i)}
              >
                {/* hit area */}
                <rect x={cx(i) - slot / 2} y={PAD.t} width={slot} height={plotH} fill="transparent" />
                {typeOrder.map((t) => {
                  const miles = w.types[t];
                  if (miles <= 0) return null;
                  const h = (plotH * miles) / maxMiles;
                  yCursor -= h;
                  return (
                    <motion.rect
                      key={t}
                      x={cx(i) - barW / 2}
                      width={barW}
                      y={yCursor}
                      height={h}
                      fill={`var(${TYPE_VAR[t]})`}
                      opacity={isSel ? 1 : 0.82}
                      style={{ transformBox: "fill-box", transformOrigin: "bottom" }}
                      initial={reduce ? false : { scaleY: 0 }}
                      whileInView={reduce ? undefined : { scaleY: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.7, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                    />
                  );
                })}
                {/* partial-week hatch cue */}
                {w.partial && (
                  <text x={cx(i)} y={y(w.miles) - 8} className={styles.partialTag} textAnchor="middle">
                    so far
                  </text>
                )}
                {/* week label */}
                <text
                  x={cx(i)}
                  y={H - PAD.b + 18}
                  className={`${styles.weekLabel} ${isSel ? styles.weekLabelSel : ""}`}
                  textAnchor="middle"
                >
                  {w.week}
                </text>
                <rect
                  x={cx(i) - barW / 2}
                  y={H - PAD.b + 24}
                  width={barW}
                  height={3}
                  rx={1.5}
                  fill={`var(${PHASE_VAR[w.phase]})`}
                  opacity={0.7}
                />
              </g>
            );
          })}

          {/* rolling-average line */}
          <motion.polyline
            points={rollPts}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={2.5}
            strokeDasharray="2 5"
            strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0 }}
            whileInView={reduce ? undefined : { pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          />
          {weeks.map((w, i) => (
            <circle key={w.week} cx={cx(i)} cy={y(w.rolling4)} r={2.5} fill="var(--ink)" />
          ))}
        </svg>
        <p className={styles.axisCaption}>
          week of the build · <span className={styles.dashKey}>– –</span> 4-week rolling avg
        </p>
      </div>

      <div className={styles.legend}>
        {typeOrder.map((t) => (
          <span key={t} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: `var(${TYPE_VAR[t]})` }} />
            {typeLabels[t]}
          </span>
        ))}
      </div>

      {/* EF trend */}
      <div className={styles.efCard}>
        <div className={styles.efHead}>
          <span className="eyebrow">Aerobic efficiency</span>
          <span className={styles.efNote}>
            meters per heartbeat on easy runs — higher means more pace for the same effort.
            Hover a point to pull that week up top.
          </span>
        </div>
        <svg className={styles.efChart} viewBox="0 0 1000 104" role="img" aria-label="Easy-run efficiency trend">
          <defs>
            <linearGradient id="efFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--p3)" stopOpacity={0.24} />
              <stop offset="100%" stopColor="var(--p3)" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* area fill */}
          {efAreaPath && (
            <motion.path
              d={efAreaPath}
              fill="url(#efFill)"
              initial={reduce ? false : { opacity: 0 }}
              whileInView={reduce ? undefined : { opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.25 }}
            />
          )}

          {/* trend line */}
          <motion.polyline
            points={efLinePts}
            fill="none"
            stroke="var(--p3)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0 }}
            whileInView={reduce ? undefined : { pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* selected-week guide */}
          {sel.easyEF != null && (
            <line
              x1={cx(selected)}
              x2={cx(selected)}
              y1={efY(sel.easyEF)}
              y2={EF_BASE}
              stroke="var(--p3)"
              strokeWidth={1}
              strokeDasharray="2 3"
              opacity={0.45}
            />
          )}

          {weeks.map((w, i) =>
            w.easyEF != null ? (
              <g
                key={w.week}
                className={styles.efPoint}
                onMouseEnter={() => setSelected(i)}
                onFocus={() => setSelected(i)}
                tabIndex={0}
                role="button"
                aria-label={`Week ${w.week} aerobic efficiency ${w.easyEF.toFixed(3)}`}
                style={{ cursor: "pointer" }}
              >
                {/* hit area */}
                <rect x={cx(i) - slot / 2} y={0} width={slot} height={104} fill="transparent" />
                {i === efBestIdx && (
                  <text x={cx(i)} y={efY(w.easyEF) + 16} className={styles.efBest} textAnchor="middle">
                    best
                  </text>
                )}
                {i === selected && (
                  <circle
                    cx={cx(i)}
                    cy={efY(w.easyEF)}
                    r={9}
                    fill="none"
                    stroke="var(--p3)"
                    strokeWidth={1.5}
                    opacity={0.5}
                  />
                )}
                <circle
                  cx={cx(i)}
                  cy={efY(w.easyEF)}
                  r={i === selected ? 5.5 : 3}
                  fill="var(--p3)"
                  style={{ transition: "r 0.15s ease" }}
                />
                <text
                  x={cx(i)}
                  y={efY(w.easyEF) - 11}
                  className={`${styles.efLabel} ${i === selected ? styles.efLabelSel : ""}`}
                  textAnchor="middle"
                >
                  {w.easyEF.toFixed(3)}
                </text>
              </g>
            ) : null,
          )}
        </svg>
      </div>
    </section>
  );
}

function WeekReadout({ week }: { week: WeekDatum }) {
  const { typeOrder, typeLabels, phases } = data;
  const phase = phases[week.phase];
  const types = typeOrder.filter((t) => week.types[t] > 0);
  return (
    <div className={styles.readout}>
      <div className={styles.readoutTop}>
        <div>
          <div className={styles.readoutMiles}>
            <AnimatedNumber value={week.miles} format={fmt1} duration={0.5} />
            <span className={styles.readoutUnit}>mi</span>
          </div>
          <p className={styles.readoutMeta}>
            Week {week.week} · {formatDate(week.weekStart)} · {phase.name}
            {week.partial && " · in progress"}
          </p>
        </div>
        <div className={styles.readoutStats}>
          <Stat label="4-wk avg" value={`${fmt1(week.rolling4)} mi`} />
          <Stat label="longest" value={`${fmt1(week.longest)} mi`} />
          <Stat label="runs" value={String(week.runs)} />
          <Stat label="easy EF" value={week.easyEF != null ? week.easyEF.toFixed(3) : "—"} />
        </div>
      </div>
      {/* composition bar */}
      <div className={styles.compBar} role="img" aria-label="Workout-type composition">
        {types.map((t) => (
          <div
            key={t}
            className={styles.compSeg}
            style={{ flexGrow: week.types[t], background: `var(${TYPE_VAR[t]})` }}
            title={`${typeLabels[t]}: ${fmt1(week.types[t])} mi`}
          />
        ))}
      </div>
      <div className={styles.compLabels}>
        {types.map((t) => (
          <span key={t} className={styles.compLabel}>
            {typeLabels[t]} {fmt1(week.types[t])}
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function gridTicks(max: number): number[] {
  const step = max > 70 ? 25 : 20;
  const out: number[] = [];
  for (let v = step; v < max; v += step) out.push(v);
  return out;
}
