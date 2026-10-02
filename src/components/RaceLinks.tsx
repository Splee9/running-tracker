import { forwardRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { formatDate, formatMonthDay, formatTime } from "../lib/format";
import { loggedRaces, raceByKey } from "../lib/loggedRaces";
import {
  RACE_DISTANCE_COLOR,
  raceKey,
  raceSessionHref,
  raceTitle,
  raceWeekHref,
  raceYearHref,
  relatedRaceGroups,
  seriesStep,
  type LoggedRace,
} from "../lib/races";
import { Link } from "../lib/router";
import styles from "./RaceLinks.module.css";

function relatedLabel(race: LoggedRace, other: LoggedRace, series: boolean): string {
  if (series) {
    const step = seriesStep(race, other);
    const name = other.name ?? `${raceTitle(other)} · ${formatMonthDay(other.date)}`;
    return step ? `${step} · ${name}` : name;
  }
  if (other.name) return `${other.name} · ${other.year}`;
  return `${raceTitle(other)} · ${formatMonthDay(other.date)}, ${other.year}`;
}

/** Week and year hops that already exist, plus the other races on this log. */
export function RaceConnections({
  race,
  onRelate,
}: {
  race: LoggedRace;
  onRelate: (key: string) => void;
}) {
  const week = raceWeekHref(race);
  const groups = relatedRaceGroups(race, loggedRaces);
  return (
    <div className={styles.connections}>
      <p className={styles.handoff}>
        {week && <Link href={week}>That week</Link>}
        <Link href={raceYearHref(race)}>Sessions in {race.year}</Link>
      </p>
      {groups.map((group) => (
        <p key={group.id} className={styles.group}>
          <span className={styles.groupLabel}>{group.label}</span>
          {group.races.map((other) => (
            <button
              key={raceKey(other)}
              type="button"
              className={styles.relate}
              onClick={() => onRelate(raceKey(other))}
            >
              {relatedLabel(race, other, group.id === "series")}
              {other.pr ? " · PR" : ""}
            </button>
          ))}
        </p>
      ))}
    </div>
  );
}

export function RaceSessionLink({ race, className }: { race: LoggedRace; className?: string }) {
  const href = raceSessionHref(race);
  const title = raceTitle(race);
  if (!href) return <span className={className}>{title}</span>;
  return (
    <Link href={href} className={className}>
      {title}
    </Link>
  );
}

export function RaceSummary({ race }: { race: LoggedRace }) {
  return (
    <p className={styles.summary}>
      <span>{formatDate(race.date)}</span>
      {race.seconds != null && <span>{formatTime(race.seconds)}</span>}
    </p>
  );
}

/** The race list under the year chart. The name opens the session. */
export function RaceList({
  races,
  pinnedKey,
  linkedKey,
  onPin,
  onRelate,
}: {
  races: readonly LoggedRace[];
  /** Expanded row. Chart hovers leave this null so the list does not grow. */
  pinnedKey: string | null;
  linkedKey: string | null;
  onPin: (key: string) => void;
  onRelate: (key: string) => void;
}) {
  if (races.length === 0) return null;
  return (
    <ul className={styles.list}>
      {races.map((race) => {
        const key = raceKey(race);
        const pinned = pinnedKey === key;
        return (
          <li key={key} className={`${styles.item} ${pinned || linkedKey === key ? styles.itemOn : ""}`}>
            <div className={styles.itemLine}>
              <span className={styles.dot} style={{ background: RACE_DISTANCE_COLOR[race.distance] }} />
              <RaceSessionLink race={race} className={styles.name} />
              {race.pr && <span className={styles.pr}>PR</span>}
              <span className={styles.when}>{formatDate(race.date)}</span>
              {race.seconds != null && <span className={styles.time}>{formatTime(race.seconds)}</span>}
            </div>
            {pinned ? (
              <RaceConnections race={race} onRelate={onRelate} />
            ) : (
              <button type="button" className={styles.related} onClick={() => onPin(key)}>
                Related races
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Hover card on a race marker. Absolute, so it does not reflow the chart. */
export const RaceChartTip = forwardRef<
  HTMLDivElement,
  {
    raceKeyValue: string;
    anchor: { left: string; top: string; color: string };
    onRelate: (key: string) => void;
    onPointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => void;
  }
>(function RaceChartTip({ raceKeyValue, anchor, onRelate, onPointerLeave }, ref) {
  const race = raceByKey(raceKeyValue);
  if (!race) return null;
  return (
    <div
      ref={ref}
      className={styles.tip}
      style={{ left: anchor.left, top: anchor.top, borderColor: anchor.color, color: anchor.color } as CSSProperties}
      onPointerLeave={onPointerLeave}
    >
      <div className={styles.tipName}>
        <RaceSessionLink race={race} />
        {race.pr && <span className={styles.pr}>PR</span>}
      </div>
      <RaceSummary race={race} />
      <RaceConnections race={race} onRelate={onRelate} />
    </div>
  );
});
