/**
 * Joins across the separate feeds. Callers pass the records they already loaded.
 * This module does not import activities, variability, Chicago, or the miles log.
 */

import { formatMonthDay } from "./format.ts";
import { chicagoWeekHref, milesYearHref, trainingWeekHref } from "./links.ts";
import { parseISODay, weekMonday, weekSunday, yearOf } from "./week.ts";

export interface PhaseSpan {
  short: string;
  start: string;
  end: string;
}

export interface WeekSpan {
  week: number;
  weekStart: string;
  phase: number;
  phaseShort: string;
  miles: number;
  partial: boolean;
}

export interface RaceSpan {
  date: string;
  distance: "marathon" | "half" | "10K" | "5K";
}

export type ContextChip =
  | { kind: "link"; key: string; label: string; href: string }
  | { kind: "label"; key: string; label: string };

const DISTANCE_LABEL: Record<RaceSpan["distance"], string> = {
  marathon: "Marathon",
  half: "Half",
  "10K": "10K",
  "5K": "5K",
};

export function findChicagoDay<P extends PhaseSpan, W extends WeekSpan>(
  phases: readonly P[],
  weeks: readonly W[],
  isoDay: string,
): { phase: P; week: W | null; monday: string } | null {
  const day = parseISODay(isoDay.slice(0, 10));
  if (!day) return null;
  const phase = phases.find((item) => day >= item.start && day <= item.end);
  if (!phase) return null;
  const monday = weekMonday(day);
  if (!monday) return null;
  const week = weeks.find((item) => item.weekStart === monday) ?? null;
  return { phase, week, monday };
}

function weekMiles(miles: number): string {
  const rounded = Math.round(miles * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export interface StripFacts {
  sentence: string;
  monday: string;
  year: number;
  partial: boolean;
}

/** Current phase and week mileage. The race label shortens a Chicago marathon to "Chicago". */
export function describeChicagoStrip(
  meta: { raceName: string; raceDate: string; currentWeek: number },
  phases: readonly PhaseSpan[],
  weeks: readonly WeekSpan[],
): StripFacts | null {
  const week = weeks.find((item) => item.week === meta.currentWeek) ?? weeks.at(-1);
  if (!week) return null;
  const phase = phases[week.phase];
  const phaseShort = phase?.short ?? week.phaseShort;
  const miles = `${weekMiles(week.miles)} mi${week.partial ? " so far" : ""}`;
  const year = yearOf(week.weekStart);
  if (year == null) return null;
  const raceName = /chicago/i.test(meta.raceName) ? "Chicago" : meta.raceName;
  return {
    sentence: `${phaseShort} · week ${week.week} · ${miles} · ${raceName} ${formatMonthDay(meta.raceDate)}`,
    monday: week.weekStart,
    year,
    partial: week.partial,
  };
}

/**
 * Run / TrailRun / VirtualRun match Lookup `isRun` (`/Run$/`).
 * Ride / VirtualRide match `isRide`. Other sports use All only when a point exists.
 */
export function lookupTvSport(sportType: string): "run" | "bike" | "all" {
  if (/Run$/.test(sportType)) return "run";
  if (/Ride$/.test(sportType)) return "bike";
  return "all";
}

export function contextChips(
  input: { start_date_local: string; race?: unknown },
  sources: {
    phases: readonly PhaseSpan[];
    weeks: readonly WeekSpan[];
    years: readonly number[];
    raceEvents: readonly RaceSpan[];
    marathonResults: readonly { date: string; name: string }[];
  },
): ContextChip[] {
  const day = parseISODay(input.start_date_local.slice(0, 10));
  if (!day) return [];
  const chips: ContextChip[] = [];

  const chicago = findChicagoDay(sources.phases, sources.weeks, day);
  if (chicago) {
    const href = chicago.week ? chicagoWeekHref(chicago.monday) : "/training/chicago";
    const label = chicago.week
      ? `${chicago.phase.short} · week of ${formatMonthDay(chicago.monday)}`
      : chicago.phase.short;
    if (href) chips.push({ kind: "link", key: "chicago", label, href });
  }

  const year = yearOf(day);
  if (year != null && sources.years.includes(year)) {
    const href = milesYearHref(year);
    if (href) chips.push({ kind: "link", key: "year", label: String(year), href });
  }

  const monday = weekMonday(day);
  const sunday = weekSunday(day);
  if (monday && sunday) {
    const names = new Map(sources.marathonResults.map((result) => [result.date, result.name]));
    const excludeOwnDate = input.race ? day : null;
    for (const race of sources.raceEvents) {
      if (race.date < monday || race.date > sunday) continue;
      if (excludeOwnDate && race.date === excludeOwnDate) continue;
      const named = race.distance === "marathon" ? names.get(race.date) : undefined;
      const label = named ?? `${DISTANCE_LABEL[race.distance]} · ${formatMonthDay(race.date)}`;
      chips.push({ kind: "label", key: `race-${race.date}-${race.distance}`, label });
    }
  }

  return chips;
}

type BandName = "Steady" | "Moderate" | "Uneven" | "Erratic";
type TvSport = "run" | "bike" | "all";

export interface TvBandSource {
  last_complete_week_end: string;
  horizons: { medium: { weeks: number } };
  series: Record<TvSport, { medium: { week_end: string; band: BandName }[] }>;
}

export type TvBandResult =
  | { status: "band" | "pending"; label: string; href: string }
  | { status: "absent" };

/** Medium-horizon band for the Sunday of `isoDay`. Pending is the in-progress week. */
export function tvBandFrom(
  source: TvBandSource,
  isoDay: string,
  sport: TvSport,
  allowPending = true,
): TvBandResult {
  const monday = weekMonday(isoDay);
  const sunday = monday ? weekSunday(monday) : null;
  if (!monday || !sunday) return { status: "absent" };
  const href = trainingWeekHref(monday, sport, "medium");
  if (!href) return { status: "absent" };
  const point = source.series[sport].medium.find((item) => item.week_end === sunday);
  if (point) {
    return { status: "band", label: `${point.band} · ${source.horizons.medium.weeks}-week`, href };
  }
  if (allowPending && sunday > source.last_complete_week_end) {
    return { status: "pending", label: "Variability not in yet", href };
  }
  return { status: "absent" };
}
