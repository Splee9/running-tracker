import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { data } from "../../lib/chicago-data";
import { fmt1 } from "../../lib/chicago-format";
import styles from "./CrossBuild.module.css";

const W = 1000;
const H = 360;
const PAD = { t: 30, r: 30, b: 56, l: 52 };
const plotW = W - PAD.l - PAD.r;
const plotH = H - PAD.t - PAD.b;

export function CrossBuild() {
  const reduce = useReducedMotion();
  const [hoverBuild, setHoverBuild] = useState<string | null>(null);
  const cb = data.crossBuild;
  if (!cb) return null;

  const builds = cb.completed;
  const h2h = cb.head_to_head;

  // Scatter: x = avg weekly mileage, y = easy EF. Chicago's current head-to-head
  // point is overlaid to show where this build sits versus the others.
  const allAvg = [...builds.map((b) => b.avg), h2h.chi.avg, h2h.indy.avg];
  const allEf = [...builds.map((b) => b.ef), h2h.chi.ef, h2h.indy.ef];
  const xMin = Math.min(...allAvg) - 4;
  const xMax = Math.max(...allAvg) + 4;
  const yMin = Math.min(...allEf) - 0.03;
  const yMax = Math.max(...allEf) + 0.03;
  const x = (v: number) => PAD.l + (plotW * (v - xMin)) / (xMax - xMin);
  const y = (v: number) => PAD.t + plotH * (1 - (v - yMin) / (yMax - yMin));

  const efGain = ((h2h.chi.ef - h2h.indy.ef) / h2h.indy.ef) * 100;
  const avgGain = h2h.chi.avg - h2h.indy.avg;

  const volumePhrase = avgGain >= 0 
    ? `${fmt1(avgGain)} more miles a week` 
    : `${fmt1(Math.abs(avgGain))} fewer miles a week`;
  const efPhrase = efGain >= 0 
    ? `${efGain.toFixed(0)}% higher` 
    : `${Math.abs(efGain).toFixed(0)}% lower`;

  return (
    <section className={styles.section} aria-label="Comparison against prior marathon builds">
      <p className="eyebrow">Against the past</p>
      <h2 className={styles.heading}>
        Six marathon builds in the bank. At the same point out from race day, Chicago
        is carrying <b>{volumePhrase}</b> than the last one — at{" "}
        <b>{efPhrase}</b> aerobic efficiency.
      </h2>

      {/* head-to-head */}
      <div className={styles.h2h}>
        <p className={styles.h2hNote}>{h2h.note}</p>
        <div className={styles.h2hRow}>
          <H2HCol label="Chicago 2026" sub="this build" avg={h2h.chi.avg} ef={h2h.chi.ef} accent />
          <span className={styles.vs}>vs</span>
          <H2HCol label="Indianapolis 2025" sub="2:45:55 — current PR build" avg={h2h.indy.avg} ef={h2h.indy.ef} />
        </div>
      </div>

      {/* scatter */}
      <div className={styles.chartWrap}>
        <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Aerobic efficiency versus weekly mileage across builds">
          {/* axes */}
          {efTicks(yMin, yMax).map((v) => (
            <g key={`y${v}`}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
              <text x={PAD.l - 8} y={y(v) + 4} className={styles.axisLabel} textAnchor="end">
                {v.toFixed(2)}
              </text>
            </g>
          ))}
          {avgTicks(xMin, xMax).map((v) => (
            <text key={`x${v}`} x={x(v)} y={H - PAD.b + 22} className={styles.axisLabel} textAnchor="middle">
              {v}
            </text>
          ))}
          <text x={PAD.l} y={H - 10} className={styles.axisTitle}>
            avg weekly mileage →
          </text>
          <text x={16} y={PAD.t - 12} className={styles.axisTitle}>
            ↑ easy efficiency (m/beat)
          </text>

          {/* completed builds */}
          {builds.map((b, i) => {
            const active = hoverBuild === b.build;
            const dim = hoverBuild !== null && !active;
            return (
              <motion.g
                key={b.build}
                initial={reduce ? false : { opacity: 0, scale: 0.5 }}
                whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                style={{ transformOrigin: `${x(b.avg)}px ${y(b.ef)}px`, cursor: "pointer" }}
                onMouseEnter={() => setHoverBuild(b.build)}
                onMouseLeave={() => setHoverBuild(null)}
              >
                {active && (
                  <circle
                    cx={x(b.avg)}
                    cy={y(b.ef)}
                    r={14}
                    fill="none"
                    stroke="var(--ink)"
                    strokeWidth={1.5}
                    opacity={0.4}
                  />
                )}
                <circle
                  cx={x(b.avg)}
                  cy={y(b.ef)}
                  r={active ? 8 : 6}
                  fill="var(--muted)"
                  style={{
                    opacity: dim ? 0.22 : active ? 0.9 : 0.55,
                    transition: "r 0.2s ease, opacity 0.2s ease",
                  }}
                />
                <text
                  x={x(b.avg)}
                  y={y(b.ef) - 12}
                  className={styles.pointLabel}
                  textAnchor="middle"
                  style={{ opacity: dim ? 0.3 : 1, fontWeight: active ? 700 : 600, transition: "opacity 0.2s ease" }}
                >
                  {b.build.replace(/ 20/, " '")}
                </text>
                <text
                  x={x(b.avg)}
                  y={y(b.ef) + 20}
                  className={styles.pointResult}
                  textAnchor="middle"
                  style={{ opacity: dim ? 0.3 : 1, transition: "opacity 0.2s ease" }}
                >
                  {b.result}
                </text>
              </motion.g>
            );
          })}

          {/* Chicago current */}
          <motion.g
            initial={reduce ? false : { opacity: 0, scale: 0.4 }}
            whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: builds.length * 0.08 + 0.1 }}
            style={{ transformOrigin: `${x(h2h.chi.avg)}px ${y(h2h.chi.ef)}px` }}
          >
            <circle cx={x(h2h.chi.avg)} cy={y(h2h.chi.ef)} r={9} fill="var(--p3)" />
            <circle cx={x(h2h.chi.avg)} cy={y(h2h.chi.ef)} r={15} fill="none" stroke="var(--p3)" strokeWidth={1.5} opacity={0.5} />
            <text x={x(h2h.chi.avg)} y={y(h2h.chi.ef) - 20} className={styles.chiLabel} textAnchor="middle">
              Chicago '26 — now
            </text>
          </motion.g>
        </svg>
      </div>

      {/* build table */}
      <div className={styles.table}>
        <div className={`${styles.trow} ${styles.thead}`}>
          <span>Build</span>
          <span>Finish</span>
          <span>Avg mpw</span>
          <span>Peak</span>
          <span>Easy EF</span>
        </div>
        {builds.map((b) => (
          <div
            className={`${styles.trow} ${styles.trowData} ${hoverBuild === b.build ? styles.trowHover : ""}`}
            key={b.build}
            onMouseEnter={() => setHoverBuild(b.build)}
            onMouseLeave={() => setHoverBuild(null)}
          >
            <span className={styles.tname}>{b.build}</span>
            <span className={styles.tmono}>{b.result}</span>
            <span className={styles.tmono}>{fmt1(b.avg)}</span>
            <span className={styles.tmono}>{fmt1(b.peak)}</span>
            <span className={styles.tmono}>{b.ef.toFixed(3)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function H2HCol({
  label,
  sub,
  avg,
  ef,
  accent,
}: {
  label: string;
  sub: string;
  avg: number;
  ef: number;
  accent?: boolean;
}) {
  return (
    <div className={`${styles.h2hCol} ${accent ? styles.h2hAccent : ""}`}>
      <span className={styles.h2hLabel}>{label}</span>
      <span className={styles.h2hSub}>{sub}</span>
      <div className={styles.h2hStats}>
        <div>
          <span className={styles.h2hVal}>{fmt1(avg)}</span>
          <span className={styles.h2hUnit}>avg mpw</span>
        </div>
        <div>
          <span className={styles.h2hVal}>{ef.toFixed(3)}</span>
          <span className={styles.h2hUnit}>easy EF</span>
        </div>
      </div>
    </div>
  );
}

function efTicks(min: number, max: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(min * 20) / 20; v < max; v += 0.05) out.push(Math.round(v * 100) / 100);
  return out;
}
function avgTicks(min: number, max: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(min / 10) * 10; v < max; v += 10) out.push(v);
  return out;
}
