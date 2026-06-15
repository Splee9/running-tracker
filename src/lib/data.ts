import raw from "../data.json";

export interface RaceCounts {
  marathon: number;
  half: number;
  "10K": number;
  "5K": number;
}

export interface YearDatum {
  year: number;
  miles: number;
  runs: number;
  partial: boolean;
  races: RaceCounts;
}

export interface MonthDatum {
  month: string; // "YYYY-MM"
  miles: number;
  cumulative: number;
}

export type RaceDistance = keyof RaceCounts;

export interface RaceEvent {
  date: string; // ISO "YYYY-MM-DD"
  distance: RaceDistance;
}

export interface MarathonResult {
  date: string; // ISO "YYYY-MM-DD"
  name: string; // race name, e.g. "Indy Marathon"
  seconds: number; // official finish time, in seconds
  pr: boolean; // personal record at the time
}

export interface TrackerData {
  years: YearDatum[];
  monthly: MonthDatum[];
  raceEvents: RaceEvent[];
  marathonResults: MarathonResult[];
  firstRun: string; // ISO "YYYY-MM-DD"
  ytdFraction: number; // fraction of the current year elapsed at build
  lastUpdated: string; // ISO "YYYY-MM-DD"
}

export const data = raw as TrackerData;

export const marathonResults: MarathonResult[] = data.marathonResults ?? [];

export const lifetime = {
  miles: data.years.reduce((sum, y) => sum + y.miles, 0),
  runs: data.years.reduce((sum, y) => sum + y.runs, 0),
};
