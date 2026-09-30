import raw from "../chicago-data.json";

export type WorkoutType =
  | "quality"
  | "long"
  | "medlong"
  | "easy"
  | "commute"
  | "other";

export interface Meta {
  raceName: string;
  raceDate: string; // ISO
  blockStart: string; // ISO
  blockWeeks: number;
  goal: string;
  goalPace: string;
  daysToRace: number;
  currentPhase: number; // index into phases
  currentPhaseName: string;
  currentWeek: number;
  blockMilesToDate: number;
  peakMpw: number;
  lastUpdated: string; // ISO
}

export interface Phase {
  name: string;
  short: string;
  start: string; // ISO
  end: string; // ISO
  weeks: number;
  volStart: number;
  volEnd: number;
}

export interface WeekDatum {
  week: number;
  weekStart: string; // ISO Monday
  phase: number; // index into phases
  phaseShort: string;
  miles: number;
  runs: number;
  longest: number;
  easyEF: number | null;
  types: Record<WorkoutType, number>;
  partial: boolean;
  rolling4: number;
}

export interface CompletedBuild {
  build: string;
  result: string; // finish time
  avg: number;
  peak: number;
  ef: number;
}

export interface CrossBuild {
  generated: string;
  window_weeks: number;
  completed: CompletedBuild[];
  head_to_head: {
    weeks_out: number;
    note: string;
    chi: { avg: number; ef: number };
    indy: { avg: number; ef: number };
  };
}

export interface TVBuild {
  build: string;
  result: string;
  tv: number;
  mean_h_wk: number;
  ef: number;
  band: string;
}

export interface TrainingVariability {
  metric: string;
  window_weeks: number;
  definition: string;
  lower_is_steadier: boolean;
  bands: Record<string, string>;
  generated: string;
  completed: TVBuild[];
  head_to_head: {
    weeks_out: number;
    note: string;
    chi: { build: string; tv: number; mean_h_wk: number; ef: number; band: string };
    indy: { build: string; result: string; tv: number; mean_h_wk: number; ef: number; band: string };
  };
}

export interface TrackerData {
  meta: Meta;
  phases: Phase[];
  weeks: WeekDatum[];
  crossBuild: CrossBuild | null;
  trainingVariability: TrainingVariability | null;
  typeOrder: WorkoutType[];
  typeLabels: Record<WorkoutType, string>;
}

export const data = raw as TrackerData;

export type RaceWeekTape = {
  daysToRace: number;
  blockMiles: number;
  lastUpdated: string;
  /** The build file's current week, including a partial week still in progress. */
  current: WeekDatum | null;
  /** Latest earlier week that logged quality miles. A week total, not one session. */
  priorQuality: WeekDatum | null;
};

/** Race-week facts already on the Chicago build file. No figures are invented here. */
export function raceWeekTape(source: TrackerData = data): RaceWeekTape {
  const current =
    source.weeks.find((week) => week.week === source.meta.currentWeek) ?? source.weeks.at(-1) ?? null;
  const priorQuality =
    [...source.weeks].reverse().find((week) => (!current || week.week < current.week) && week.types.quality > 0) ??
    null;
  return {
    daysToRace: source.meta.daysToRace,
    blockMiles: source.meta.blockMilesToDate,
    lastUpdated: source.meta.lastUpdated,
    current,
    priorQuality,
  };
}

/** CSS custom-property name for a phase index (0-3). */
export const PHASE_VAR = ["--p1", "--p2", "--p3", "--p4"] as const;

/** CSS custom-property name for a workout type. */
export const TYPE_VAR: Record<WorkoutType, string> = {
  quality: "--t-quality",
  long: "--t-long",
  medlong: "--t-medlong",
  easy: "--t-easy",
  commute: "--t-commute",
  other: "--t-other",
};
