import { raceWeekTape } from "../../lib/chicago-data";
import { fmt1, formatDate } from "../../lib/chicago-format";
import styles from "./RaceWeekTape.module.css";

export function RaceWeekTape() {
  const tape = raceWeekTape();
  const current = tape.current;
  const prior = tape.priorQuality;
  const qualityThisWeek = current && current.types.quality > 0 ? current.types.quality : null;

  return (
    <section className={styles.tape} aria-label="Race week">
      <p className="eyebrow">Race week</p>
      <dl className={styles.facts}>
        <div>
          <dt>Days to race</dt>
          <dd>{tape.daysToRace}</dd>
        </div>
        <div>
          <dt>Block miles</dt>
          <dd>{fmt1(tape.blockMiles)}</dd>
        </div>
        <div>
          <dt>This week</dt>
          <dd>
            {current
              ? `Wk ${current.week} · ${fmt1(current.miles)} mi${current.partial ? " · in progress" : ""}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Quality miles</dt>
          <dd>
            {qualityThisWeek !== null
              ? `${fmt1(qualityThisWeek)} this week`
              : prior
                ? `${fmt1(prior.types.quality)} · wk ${prior.week}`
                : "None this block"}
          </dd>
        </div>
      </dl>
      <p className={styles.note}>
        {qualityThisWeek !== null && prior
          ? `Previous quality week: wk ${prior.week} · ${fmt1(prior.types.quality)} mi. `
          : null}
        Updated {formatDate(tape.lastUpdated)}. Weekly totals from the build file, not a single session.
      </p>
    </section>
  );
}
