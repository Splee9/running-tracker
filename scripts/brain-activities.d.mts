import type { Activity } from "../src/lib/activitySearch.ts";

export const BRAIN_REPO: string;
export const DEFAULT_ACTIVITIES_PATH: string;

export function fetchBrainActivities(options: {
  token: string;
  path?: string;
  ref?: string;
  signal?: AbortSignal;
}): Promise<{ records: number; activities: Activity[] }>;
