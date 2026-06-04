import raw from "../data.json";

export interface YearDatum {
  year: number;
  miles: number;
  runs: number;
  partial: boolean;
}

export interface MonthDatum {
  month: string; // "YYYY-MM"
  miles: number;
  cumulative: number;
}

export interface TrackerData {
  years: YearDatum[];
  monthly: MonthDatum[];
  firstRun: string; // ISO "YYYY-MM-DD"
  ytdFraction: number; // fraction of the current year elapsed at build
  lastUpdated: string; // ISO "YYYY-MM-DD"
}

export const data = raw as TrackerData;

export const lifetime = {
  miles: data.years.reduce((sum, y) => sum + y.miles, 0),
  runs: data.years.reduce((sum, y) => sum + y.runs, 0),
};
