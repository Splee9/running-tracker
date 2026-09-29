import { describe, it, expect } from "vitest";
import { 
  classifyIntent, 
  searchActivities, 
  buildIndex,
  type Activity
} from "./activitySearch";

describe("activitySearch", () => {
  describe("classifyIntent", () => {
    describe("fastest with distance bands", () => {
      it("should classify 'fastest 10km run this year' as deterministic", () => {
        const result = classifyIntent("fastest 10km run this year");
        expect(result.isDeterministic).toBe(true);
        expect(result.intent).toEqual({
          kind: "fastest",
          sport: "run",
          distanceBand: "10k",
        });
        expect(result.dateWindow).toEqual({
          start: "2026-01-01",
          end: "2026-09-29",
        });
        expect(result.remainingTokens).toEqual([]);
      });

      it("should classify 'fastest 10k' as deterministic", () => {
        const result = classifyIntent("fastest 10k");
        expect(result.isDeterministic).toBe(true);
        expect(result.intent).toEqual({
          kind: "fastest",
          distanceBand: "10k",
        });
        expect(result.dateWindow).toBeNull();
        expect(result.remainingTokens).toEqual([]);
      });

      it("should classify 'best 10k time this year' as deterministic", () => {
        const result = classifyIntent("fastest 10k time this year");
        expect(result.isDeterministic).toBe(true);
        expect(result.intent).toEqual({
          kind: "fastest",
          distanceBand: "10k",
        });
        expect(result.dateWindow).toEqual({
          start: "2026-01-01",
          end: "2026-09-29",
        });
      });

      it("should classify '10km PR this year' with PR as remaining token", () => {
        const result = classifyIntent("10km PR this year");
        // "PR" is not consumed, so not deterministic
        expect(result.isDeterministic).toBe(false);
        expect(result.dateWindow).toEqual({
          start: "2026-01-01",
          end: "2026-09-29",
        });
        expect(result.remainingTokens).toContain("10km");
        expect(result.remainingTokens).toContain("pr");
      });

      it("should classify 'fastest 10 kilometer run 2026' as deterministic", () => {
        const result = classifyIntent("fastest 10km run 2026");
        expect(result.isDeterministic).toBe(true);
        expect(result.intent).toEqual({
          kind: "fastest",
          sport: "run",
          distanceBand: "10k",
        });
        expect(result.dateWindow).toEqual({
          start: "2026-01-01",
          end: "2026-12-31",
        });
        expect(result.remainingTokens).toEqual([]);
      });

      it("should classify 'fastest 5k run' as deterministic", () => {
        const result = classifyIntent("fastest 5k run");
        expect(result.isDeterministic).toBe(true);
        expect(result.intent).toEqual({
          kind: "fastest",
          sport: "run",
          distanceBand: "5k",
        });
      });

      it("should classify 'fastest 5km' as deterministic", () => {
        const result = classifyIntent("fastest 5km");
        expect(result.isDeterministic).toBe(true);
        expect(result.intent).toEqual({
          kind: "fastest",
          distanceBand: "5k",
        });
      });

      it("should classify 'fastest half marathon this year' as deterministic", () => {
        const result = classifyIntent("fastest half marathon this year");
        expect(result.isDeterministic).toBe(true);
        expect(result.intent).toEqual({
          kind: "fastest",
          distanceBand: "half",
        });
        expect(result.dateWindow).toEqual({
          start: "2026-01-01",
          end: "2026-09-29",
        });
      });

      it("should classify 'fastest marathon 2026' as deterministic", () => {
        const result = classifyIntent("fastest marathon 2026");
        expect(result.isDeterministic).toBe(true);
        expect(result.intent).toEqual({
          kind: "fastest",
          distanceBand: "marathon",
        });
        expect(result.dateWindow).toEqual({
          start: "2026-01-01",
          end: "2026-12-31",
        });
      });
    });

    describe("longest with distance bands", () => {
      it("should classify 'longest 10k run' as deterministic", () => {
        const result = classifyIntent("longest 10k run");
        expect(result.isDeterministic).toBe(true);
        expect(result.intent).toEqual({
          kind: "longest",
          sport: "run",
          distanceBand: "10k",
        });
      });
    });

    describe("place filtering with superlatives", () => {
      it("should classify 'longest run in Chicago' as deterministic", () => {
        const result = classifyIntent("longest run in Chicago");
        expect(result.isDeterministic).toBe(true);
        expect(result.intent).toEqual({
          kind: "longest",
          sport: "run",
          place: "chicago",
        });
      });

      it("should classify 'fastest 10k in Boston' as deterministic", () => {
        const result = classifyIntent("fastest 10k in Boston");
        expect(result.isDeterministic).toBe(true);
        expect(result.intent).toEqual({
          kind: "fastest",
          distanceBand: "10k",
          place: "boston",
        });
      });

      it("should classify 'fastest 10k run in Chicago this year' as deterministic", () => {
        const result = classifyIntent("fastest 10k run in Chicago this year");
        expect(result.isDeterministic).toBe(true);
        expect(result.intent).toEqual({
          kind: "fastest",
          sport: "run",
          distanceBand: "10k",
          place: "chicago",
        });
        expect(result.dateWindow).toEqual({
          start: "2026-01-01",
          end: "2026-09-29",
        });
      });

      it("should classify 'longest Chicago run' as deterministic", () => {
        const result = classifyIntent("longest Chicago run");
        expect(result.isDeterministic).toBe(true);
        expect(result.intent).toEqual({
          kind: "longest",
          sport: "run",
          place: "chicago",
        });
      });
    });
  });

  describe("searchActivities", () => {
    const createActivity = (overrides: Partial<Activity>): Activity => ({
      id: 1,
      name: "Morning Run",
      sport_type: "Run",
      start_date_local: "2026-09-15T07:00:00Z",
      distance_m: 10000,
      moving_time_s: 3000,
      elevation_gain_m: 50,
      workout_type: null,
      trainer: false,
      ...overrides,
    });

    describe("fastest 10k queries", () => {
      it("should filter and sort by pace for 'fastest 10km run this year'", () => {
        const activities: Activity[] = [
          createActivity({
            id: 1,
            name: "Fast 10k",
            distance_m: 10000,
            moving_time_s: 2400, // 4:00/km pace
            start_date_local: "2026-09-15T07:00:00Z",
          }),
          createActivity({
            id: 2,
            name: "Slow 10k",
            distance_m: 10200,
            moving_time_s: 3060, // 5:00/km pace
            start_date_local: "2026-08-15T07:00:00Z",
          }),
          createActivity({
            id: 3,
            name: "Long Run",
            distance_m: 15000,
            moving_time_s: 4500, // 5:00/km pace
            start_date_local: "2026-09-10T07:00:00Z",
          }),
          createActivity({
            id: 4,
            name: "5k Race",
            distance_m: 5000,
            moving_time_s: 1100, // 3:40/km pace (fastest, but wrong distance)
            start_date_local: "2026-09-01T07:00:00Z",
          }),
          createActivity({
            id: 5,
            name: "Old 10k",
            distance_m: 10000,
            moving_time_s: 2200, // 3:40/km pace (fastest 10k, but wrong year)
            start_date_local: "2025-09-15T07:00:00Z",
          }),
        ];

        const index = buildIndex(activities);
        const results = searchActivities(index, "fastest 10km run this year");

        // Should return the two 10k runs from 2026, sorted by pace
        expect(results.length).toBe(2);
        expect(results[0].activity.id).toBe(1); // Fast 10k (4:00/km)
        expect(results[1].activity.id).toBe(2); // Slow 10k (5:00/km)
      });

      it("should handle 'fastest 10k' without year filter", () => {
        const activities: Activity[] = [
          createActivity({
            id: 1,
            name: "Recent 10k",
            distance_m: 10000,
            moving_time_s: 2400, // 4:00/km pace
            start_date_local: "2026-09-15T07:00:00Z",
          }),
          createActivity({
            id: 2,
            name: "Old Fast 10k",
            distance_m: 10000,
            moving_time_s: 2200, // 3:40/km pace (faster)
            start_date_local: "2025-09-15T07:00:00Z",
          }),
        ];

        const index = buildIndex(activities);
        const results = searchActivities(index, "fastest 10k");

        // Should return both, with faster one first
        expect(results.length).toBe(2);
        expect(results[0].activity.id).toBe(2); // Old Fast 10k (3:40/km)
        expect(results[1].activity.id).toBe(1); // Recent 10k (4:00/km)
      });

      it("should handle 'fastest 5k run this year'", () => {
        const activities: Activity[] = [
          createActivity({
            id: 1,
            name: "Fast 5k",
            distance_m: 5000,
            moving_time_s: 1100, // 3:40/km pace
            start_date_local: "2026-09-15T07:00:00Z",
          }),
          createActivity({
            id: 2,
            name: "Slow 5k",
            distance_m: 5100,
            moving_time_s: 1530, // 5:00/km pace
            start_date_local: "2026-08-15T07:00:00Z",
          }),
          createActivity({
            id: 3,
            name: "10k Run",
            distance_m: 10000,
            moving_time_s: 2200, // 3:40/km pace (same pace but wrong distance)
            start_date_local: "2026-09-10T07:00:00Z",
          }),
        ];

        const index = buildIndex(activities);
        const results = searchActivities(index, "fastest 5k run this year");

        // Should return only 5k runs
        expect(results.length).toBe(2);
        expect(results[0].activity.id).toBe(1); // Fast 5k
        expect(results[1].activity.id).toBe(2); // Slow 5k
      });

      it("should handle 'fastest half marathon 2026'", () => {
        const activities: Activity[] = [
          createActivity({
            id: 1,
            name: "Fast Half",
            distance_m: 21100,
            moving_time_s: 5400, // ~4:15/km pace
            start_date_local: "2026-09-15T07:00:00Z",
          }),
          createActivity({
            id: 2,
            name: "Slow Half",
            distance_m: 21097,
            moving_time_s: 6300, // ~5:00/km pace
            start_date_local: "2026-08-15T07:00:00Z",
          }),
          createActivity({
            id: 3,
            name: "10k Run",
            distance_m: 10000,
            moving_time_s: 2400,
            start_date_local: "2026-09-10T07:00:00Z",
          }),
        ];

        const index = buildIndex(activities);
        const results = searchActivities(index, "fastest half marathon 2026");

        // Should return only half marathons
        expect(results.length).toBe(2);
        expect(results[0].activity.id).toBe(1); // Fast Half
        expect(results[1].activity.id).toBe(2); // Slow Half
      });

      it("should handle 'fastest marathon this year'", () => {
        const activities: Activity[] = [
          createActivity({
            id: 1,
            name: "Chicago Marathon",
            distance_m: 42195,
            moving_time_s: 10800, // ~4:15/km pace
            start_date_local: "2026-09-15T07:00:00Z",
          }),
          createActivity({
            id: 2,
            name: "Berlin Marathon",
            distance_m: 42200,
            moving_time_s: 12600, // ~5:00/km pace
            start_date_local: "2026-08-15T07:00:00Z",
          }),
          createActivity({
            id: 3,
            name: "Half Marathon",
            distance_m: 21100,
            moving_time_s: 5400,
            start_date_local: "2026-09-10T07:00:00Z",
          }),
        ];

        const index = buildIndex(activities);
        const results = searchActivities(index, "fastest marathon this year");

        // Should return only marathons
        expect(results.length).toBe(2);
        expect(results[0].activity.id).toBe(1); // Chicago Marathon
        expect(results[1].activity.id).toBe(2); // Berlin Marathon
      });
    });

    describe("place filtering with superlatives", () => {
      it("should filter 'longest run in Chicago'", () => {
        const activities: Activity[] = [
          createActivity({
            id: 1,
            name: "Chicago Marathon",
            distance_m: 42195,
            moving_time_s: 10800,
            start_date_local: "2026-09-15T07:00:00Z",
            place: "Chicago",
          }),
          createActivity({
            id: 2,
            name: "Long Run",
            distance_m: 25000,
            moving_time_s: 7500,
            start_date_local: "2026-08-15T07:00:00Z",
            place: "Chicago",
          }),
          createActivity({
            id: 3,
            name: "Boston Marathon",
            distance_m: 42195,
            moving_time_s: 11000,
            start_date_local: "2026-09-10T07:00:00Z",
            place: "Boston",
          }),
        ];

        const index = buildIndex(activities);
        const results = searchActivities(index, "longest run in Chicago");

        // Should return only Chicago runs, sorted by distance
        expect(results.length).toBe(2);
        expect(results[0].activity.id).toBe(1); // Chicago Marathon (42.2k)
        expect(results[1].activity.id).toBe(2); // Long Run (25k)
      });

      it("should filter 'fastest 10k in Boston'", () => {
        const activities: Activity[] = [
          createActivity({
            id: 1,
            name: "Boston 10k",
            distance_m: 10000,
            moving_time_s: 2400,
            start_date_local: "2026-09-15T07:00:00Z",
            place: "Boston",
          }),
          createActivity({
            id: 2,
            name: "Chicago 10k",
            distance_m: 10000,
            moving_time_s: 2200,
            start_date_local: "2026-08-15T07:00:00Z",
            place: "Chicago",
          }),
          createActivity({
            id: 3,
            name: "Boston 5k",
            distance_m: 5000,
            moving_time_s: 1100,
            start_date_local: "2026-09-10T07:00:00Z",
            place: "Boston",
          }),
        ];

        const index = buildIndex(activities);
        const results = searchActivities(index, "fastest 10k in Boston");

        // Should return only Boston 10k runs
        expect(results.length).toBe(1);
        expect(results[0].activity.id).toBe(1); // Boston 10k
      });

      it("should combine distance band and place filtering", () => {
        const activities: Activity[] = [
          createActivity({
            id: 1,
            name: "Chicago 10k A",
            distance_m: 10000,
            moving_time_s: 2400,
            start_date_local: "2026-09-15T07:00:00Z",
            place: "Chicago",
          }),
          createActivity({
            id: 2,
            name: "Chicago 10k B",
            distance_m: 10100,
            moving_time_s: 2500,
            start_date_local: "2026-08-15T07:00:00Z",
            place: "Chicago",
          }),
          createActivity({
            id: 3,
            name: "Chicago Half",
            distance_m: 21100,
            moving_time_s: 5000,
            start_date_local: "2026-09-10T07:00:00Z",
            place: "Chicago",
          }),
          createActivity({
            id: 4,
            name: "Boston 10k",
            distance_m: 10000,
            moving_time_s: 2200,
            start_date_local: "2026-09-05T07:00:00Z",
            place: "Boston",
          }),
        ];

        const index = buildIndex(activities);
        const results = searchActivities(index, "fastest 10k in Chicago");

        // Should return only Chicago 10k runs, sorted by pace
        expect(results.length).toBe(2);
        expect(results[0].activity.id).toBe(1); // Chicago 10k A (faster)
        expect(results[1].activity.id).toBe(2); // Chicago 10k B (slower)
      });
    });
  });
});
