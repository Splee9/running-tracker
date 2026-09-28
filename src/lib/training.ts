import raw from "../training-variability.json";

export type Sport = "run" | "bike" | "all";
export type Horizon = "short" | "medium" | "long";
export type Band = "Steady" | "Moderate" | "Uneven" | "Erratic";

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

export const SPORTS: Sport[] = ["run", "bike", "all"];
export const HORIZONS: Horizon[] = ["short", "medium", "long"];

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
