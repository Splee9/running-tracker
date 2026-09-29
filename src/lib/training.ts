import raw from "../training-variability.json";
import rawHours from "../training-weekly-hours.json";

export type Sport = "run" | "bike" | "all";
export type Horizon = "short" | "medium" | "long";
export type Band = "Steady" | "Moderate" | "Uneven" | "Erratic";

/** Date range presets for viewing rolling averages with useful context. */
export type DateRange = "12wk" | "26wk" | "52wk" | "2yr" | "all";

export interface DateRangePreset {
  id: DateRange;
  label: string;
  weeks: number | null; // null means "all available data"
}

export interface TvPoint {
  week_end: string; // ISO "YYYY-MM-DD" (the Sunday closing a Mon–Sun week)
  tv: number;
  band: Band;
  mean_hours: number;
  zero_weeks: number;
}

export interface TrainingVariability {
  as_of: string;
  last_complete_week_end: string;
  definition: string;
  lower_is_steadier: boolean;
  bands: Record<Band, string>;
  horizons: Record<Horizon, { weeks: number; label: string }>;
  filters: Record<Sport, { label: string; sports: string[] }>;
  series: Record<Sport, Record<Horizon, TvPoint[]>>;
  current: Record<Sport, Record<Horizon, TvPoint>>;
}

export const tv = raw as TrainingVariability;

export interface WeeklyHours {
  weeks: string[]; // week_end ISO dates, oldest first
  hours: Record<Sport, number[]>; // parallel to `weeks`
}

export const weekly = rawHours as WeeklyHours;

export const SPORTS: Sport[] = ["run", "bike", "all"];
export const HORIZONS: Horizon[] = ["short", "medium", "long"];

/**
 * Date range presets suitable for viewing rolling averages. Longer ranges
 * preserve signal; short ones are still available for zooming.
 */
export const DATE_RANGES: DateRangePreset[] = [
  { id: "12wk", label: "12 weeks", weeks: 12 },
  { id: "26wk", label: "26 weeks", weeks: 26 },
  { id: "52wk", label: "52 weeks", weeks: 52 },
  { id: "2yr", label: "2 years", weeks: 104 },
  { id: "all", label: "All", weeks: null },
];

// Thresholds mirror `tv.bands`; colors reuse the site's race palette
// (green → blue → amber → red) so steadier reads cooler.
export const BANDS: { name: Band; min: number; max: number; color: string }[] = [
  { name: "Steady", min: 0, max: 35, color: "#1f7a5c" },
  { name: "Moderate", min: 35, max: 55, color: "#2f6db0" },
  { name: "Uneven", min: 55, max: 80, color: "#9a6412" },
  { name: "Erratic", min: 80, max: Infinity, color: "#c0432f" },
];

export const BAND_COLOR = Object.fromEntries(BANDS.map((b) => [b.name, b.color])) as Record<
  Band,
  string
>;

/** TV with one fixed decimal: 34.29 → "34.3". */
export const fmtTv = (n: number): string => n.toFixed(1);

export const toDays = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** Shared x-domain so every chart lines up week-for-week regardless of sport. */
const allWeeks = SPORTS.flatMap((s) => HORIZONS.flatMap((h) => tv.series[s][h])).map((p) =>
  toDays(p.week_end),
);
export const DAY0 = Math.min(...allWeeks);
export const DAY1 = Math.max(...allWeeks);

/**
 * Filter weeks, hours, and TV points to the selected date range.
 * Returns data for the most recent N weeks (or all data if range.weeks is null).
 */
export function filterToRange(
  sport: Sport,
  horizon: Horizon,
  range: DateRangePreset,
): {
  weeks: string[];
  hours: number[];
  points: TvPoint[];
} {
  const allPoints = tv.series[sport][horizon];
  const allWeeks = weekly.weeks;
  const allHours = weekly.hours[sport];

  // "All" range: return everything
  if (range.weeks === null) {
    return {
      weeks: allWeeks,
      hours: allHours,
      points: allPoints,
    };
  }

  // Slice to the most recent N weeks
  const lastWeek = allWeeks[allWeeks.length - 1];
  const cutoffDays = toDays(lastWeek) - range.weeks * 7;

  const firstVisibleIdx = allWeeks.findIndex((w) => toDays(w) >= cutoffDays);
  const sliceStart = Math.max(0, firstVisibleIdx);

  const weeks = allWeeks.slice(sliceStart);
  const hours = allHours.slice(sliceStart);
  
  // Filter TV points to only those within the visible weeks range
  const firstVisibleWeek = weeks[0];
  const lastVisibleWeek = weeks[weeks.length - 1];
  const points = allPoints.filter(
    (p) => p.week_end >= firstVisibleWeek && p.week_end <= lastVisibleWeek,
  );

  return { weeks, hours, points };
}
