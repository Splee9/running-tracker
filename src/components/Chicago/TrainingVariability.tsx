import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { data } from "../../lib/chicago-data";
import { fmt1 } from "../../lib/chicago-format";
import styles from "./TrainingVariability.module.css";

const W = 1000;
const H = 360;
const PAD = { t: 30, r: 30, b: 56, l: 52 };
const plotW = W - PAD.l - PAD.r;
const plotH = H - PAD.t - PAD.b;

export function TrainingVariability() {
  const reduce = useReducedMotion();
  const [hoverBuild, setHoverBuild] = useState<string | null>(null);
  const tv = data.trainingVariability;
  if (!tv) return null;

  const builds = tv.completed;
  const h2h = tv.head_to_head;

  // Scatter: x = TV score (lower = steadier), y = running efficiency (m/beat).
  const allTV = [...builds.map((b) => b.tv), h2h.chi.tv, h2h.indy.tv];
  const allEf = [...builds.map((b) => b.ef), h2h.chi.ef, h2h.indy.ef];
  const xMin = 0;
  const xMax = Math.max(...allTV) + 5;
  const yMin = Math.min(...allEf) - 0.03;
  const yMax = Math.max(...allEf) + 0.03;
  const x = (v: number) => PAD.l + (plotW * (v - xMin)) / (xMax - xMin);
  const y = (v: number) => PAD.t + plotH * (1 - (v - yMin) / (yMax - yMin));

  const tvDiff = h2h.chi.tv - h2h.indy.tv;
  const tvDiffPct = ((tvDiff / h2h.indy.tv) * 100).toFixed(0);

  return (
    <section className={styles.section} aria-label="Training Variability comparison">
      <p className="eyebrow">Week-to-week continuity</p>
      <h2 className={styles.heading}>
        Chicago's <b>{tv.window_weeks}-week run variability</b> is{" "}
        <b>{tvDiff.toFixed(1)} points higher</b> than the Indy PB build —{" "}
        <b>{tvDiffPct}% less steady</b> heading into race week.
      </h2>

      {/* head-to-head */}
      <div className={styles.h2h}>
        <p className={styles.h2hNote}>{h2h.note}</p>
        <div className={styles.h2hRow}>
          <TVCol
            label="Chicago 2026"
            sub="this build (7/8 weeks)"
            tv={h2h.chi.tv}
            band={h2h.chi.band}
            ef={h2h.chi.ef}
            meanHWk={h2h.chi.mean_h_wk}
            accent
          />
          <span className={styles.vs}>vs</span>
          <TVCol
            label="Indianapolis 2025"
            sub="2:45:55 — current PR build"
            tv={h2h.indy.tv}
            band={h2h.indy.band}
            ef={h2h.indy.ef}
            meanHWk={h2h.indy.mean_h_wk}
          />
        </div>
      </div>

      {/* scatter */}
      <div className={styles.chartWrap}>
        <svg
          className={styles.chart}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Running efficiency versus Training Variability across builds"
        >
          {/* axes */}
          {efTicks(yMin, yMax).map((v) => (
            <g key={`y${v}`}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
              <text x={PAD.l - 8} y={y(v) + 4} className={styles.axisLabel} textAnchor="end">
                {v.toFixed(2)}
              </text>
            </g>
          ))}
          {tvTicks(xMin, xMax).map((v) => (
            <text key={`x${v}`} x={x(v)} y={H - PAD.b + 22} className={styles.axisLabel} textAnchor="middle">
              {v}
            </text>
          ))}
          <text x={PAD.l} y={H - 10} className={styles.axisTitle}>
            TV (lower = steadier) →
          </text>
          <text x={16} y={PAD.t - 12} className={styles.axisTitle}>
            ↑ running efficiency (m/beat)
          </text>

          {/* band regions (optional subtle background bands) */}
          {/* Steady: <35, Moderate: 35-<55 */}
          <rect x={x(0)} y={PAD.t} width={x(35) - x(0)} height={plotH} fill="var(--t-easy)" opacity={0.15} />
          <rect x={x(35)} y={PAD.t} width={x(55) - x(35)} height={plotH} fill="var(--t-medlong)" opacity={0.12} />

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
                style={{ transformOrigin: `${x(b.tv)}px ${y(b.ef)}px`, cursor: "pointer" }}
                onMouseEnter={() => setHoverBuild(b.build)}
                onMouseLeave={() => setHoverBuild(null)}
              >
                {active && (
                  <circle
                    cx={x(b.tv)}
                    cy={y(b.ef)}
                    r={14}
                    fill="none"
                    stroke="var(--ink)"
                    strokeWidth={1.5}
                    opacity={0.4}
                  />
                )}
                <circle
                  cx={x(b.tv)}
                  cy={y(b.ef)}
                  r={active ? 8 : 6}
                  fill="var(--muted)"
                  style={{
                    opacity: dim ? 0.22 : active ? 0.9 : 0.55,
                    transition: "r 0.2s ease, opacity 0.2s ease",
                  }}
                />
                <text
                  x={x(b.tv)}
                  y={y(b.ef) - 12}
                  className={styles.pointLabel}
                  textAnchor="middle"
                  style={{ opacity: dim ? 0.3 : 1, fontWeight: active ? 700 : 600, transition: "opacity 0.2s ease" }}
                >
                  {b.build.replace(/ 20/, " '")}
                </text>
                <text
                  x={x(b.tv)}
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
            style={{ transformOrigin: `${x(h2h.chi.tv)}px ${y(h2h.chi.ef)}px` }}
          >
            <circle cx={x(h2h.chi.tv)} cy={y(h2h.chi.ef)} r={9} fill="var(--p3)" />
            <circle
              cx={x(h2h.chi.tv)}
              cy={y(h2h.chi.ef)}
              r={15}
              fill="none"
              stroke="var(--p3)"
              strokeWidth={1.5}
              opacity={0.5}
            />
            <text
              x={x(h2h.chi.tv)}
              y={y(h2h.chi.ef) - 20}
              className={styles.chiLabel}
              textAnchor="middle"
            >
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
          <span>TV</span>
          <span>Band</span>
          <span>Easy EF</span>
          <span>Mean h/wk</span>
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
            <span className={styles.tmono}>{b.tv.toFixed(2)}</span>
            <span className={styles.tband}>{b.band}</span>
            <span className={styles.tmono}>{b.ef.toFixed(3)}</span>
            <span className={styles.tmono}>{fmt1(b.mean_h_wk)}</span>
          </div>
        ))}
      </div>

      {/* footnote */}
      <p className={styles.footnote}>
        Training Variability (TV): week-to-week consistency of run hours over the {tv.window_weeks} Mon–Sun weeks
        before race week. Lower = steadier. Chicago '26 is mid-window (7 of 8 weeks) as of{" "}
        {tv.generated}.
      </p>
    </section>
  );
}

function TVCol({
  label,
  sub,
  tv,
  band,
  ef,
  meanHWk,
  accent,
}: {
  label: string;
  sub: string;
  tv: number;
  band: string;
  ef: number;
  meanHWk: number;
  accent?: boolean;
}) {
  return (
    <div className={`${styles.h2hCol} ${accent ? styles.h2hAccent : ""}`}>
      <span className={styles.h2hLabel}>{label}</span>
      <span className={styles.h2hSub}>{sub}</span>
      <div className={styles.h2hStats}>
        <div>
          <span className={styles.h2hVal}>{tv.toFixed(2)}</span>
          <span className={styles.h2hUnit}>TV</span>
        </div>
        <div>
          <span className={styles.h2hBand}>{band}</span>
          <span className={styles.h2hUnit}>band</span>
        </div>
        <div>
          <span className={styles.h2hVal}>{ef.toFixed(3)}</span>
          <span className={styles.h2hUnit}>easy EF</span>
        </div>
        <div>
          <span className={styles.h2hVal}>{fmt1(meanHWk)}</span>
          <span className={styles.h2hUnit}>mean h/wk</span>
        </div>
      </div>
    </div>
  );
}

function tvTicks(min: number, max: number): number[] {
  const out: number[] = [];
  const step = 10;
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

function efTicks(min: number, max: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(min * 20) / 20; v < max; v += 0.05) out.push(Math.round(v * 100) / 100);
  return out;
}
