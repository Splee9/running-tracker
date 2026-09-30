# Activity Lookup v3 Enrichment - HR, Pace, and Power

## Overview

This document describes the v3 enrichment fields added to the Activity Lookup feature to support heart rate, pace, and power data.

## New Activity Fields

All v3 fields are optional and backward compatible:

```typescript
type Activity = {
  // ... existing fields ...
  
  // v3 enrichment (optional)
  average_heartrate?: number;        // beats per minute
  max_heartrate?: number;            // beats per minute
  average_speed?: number;            // meters per second
  max_speed?: number;                // meters per second (optional)
  average_watts?: number;            // power in watts
  weighted_average_watts?: number;   // normalized/weighted power in watts
}
```

## Data Source

These fields are expected in the vault export JSON from the private `spencer-brain` repository at `data/public/strava-activities.json` (schema v3).

## Example Activity with v3 Data

```json
{
  "id": 12345678,
  "name": "Morning Tempo Run",
  "sport_type": "Run",
  "start_date_local": "2026-09-29T07:00:00Z",
  "distance": 16093,
  "moving_time": 3900,
  "total_elevation_gain": 45,
  "workout_type": 3,
  "trainer": false,
  "primary_stimulus": "tempo",
  "place": "Chicago",
  "average_heartrate": 165,
  "max_heartrate": 178,
  "average_speed": 4.13
}
```

## UI Display

### Heart Rate
- **Runs**: Shows both average and max when available
- **Rides**: Shows both average and max when available
- **Format**: `165 bpm (max 178)` or `165 bpm` if only avg available
- **Display**: Shown prominently after pace/speed, before place

### Pace (Derived)
- **Calculation**: Uses `average_speed` when available, otherwise `distance_m / moving_time_s`
- **Runs**: Displayed as `min/mi` (e.g., `7:30 /mi`)
  - Spencer prefers miles, so min/mi is the default for runs
- **Rides**: Displayed as `mph` (e.g., `18.5 mph`)
- **Units**: Respects the user's mi/km toggle selection

### Power (Rides Only)
- **Display**: Only shown for ride activities where power data is present
- **Preference**: Uses `weighted_average_watts` over `average_watts` when both available
- **Format**: `245W (w)` for weighted avg, `245W` for regular avg
- **Position**: Shown after heart rate

## Search Tags

Activities with v3 data automatically get additional search tags:

### Heart Rate Tags
- All activities with HR: `"hr"`, `"heartrate"`, `"heart rate"`
- High HR (≥170 bpm): `"high hr"`, `"hard effort"`
- Moderate HR (≥150 bpm): `"moderate hr"`

### Power Tags
- All activities with power: `"power"`, `"watts"`
- High power (≥250W): `"high power"`

## New Search Intents

Two new deterministic superlative intents were added:

### 1. Highest HR
**Triggers**: "highest hr", "highest heart rate", "highest average hr", "max hr"

**Examples**:
- "highest hr this year"
- "highest average heart rate"
- "max hr 2025"

**Behavior**: 
- Sorts by average heart rate (descending)
- Filters out activities without HR data
- Deterministic (no Jev reranking)

### 2. Highest Power
**Triggers**: "highest power", "highest watts", "highest average watts"

**Examples**:
- "highest power this year"
- "highest average watts"
- "highest weighted power"

**Behavior**:
- Sorts by weighted_average_watts (or average_watts if weighted not available)
- Filters out activities without power data
- Deterministic (no Jev reranking)

## Testing Examples

### Search Queries to Test
1. `"highest hr this year"` - Should return activities sorted by avg HR
2. `"highest power"` - Should return rides sorted by power
3. `"hard effort"` - Should match activities with high HR (≥170 bpm)
4. `"high power"` - Should match activities with ≥250W
5. `"moderate hr"` - Should match activities with ≥150 bpm
6. `"power"` or `"watts"` - Should match all activities with power data
7. `"heart rate"` or `"hr"` - Should match all activities with HR data

### UI Verification
1. Check that pace is displayed correctly:
   - Runs show min/mi format
   - Rides show mph format
   - Respects mi/km toggle
2. Check HR display:
   - Shows "165 bpm (max 178)" when both available
   - Shows "165 bpm" when only avg available
   - Gracefully omitted when HR data missing
3. Check power display:
   - Only shown for rides
   - Shows "(w)" suffix for weighted average
   - Gracefully omitted when power data missing

## Jev Integration

The `describeActivity()` function now includes HR and power data in the text description used by Jev for semantic reranking:

**Example description**:
```
"Morning Tempo Run", Run, 2026-09-29, 10.0 km, 39:00, tempo, Chicago, 165 bpm avg (max 178)
```

This allows Jev to better understand and rank activities based on effort level, power output, and physiological metrics.

## Privacy Considerations

- ✅ Only summary metrics are displayed (avg, max)
- ✅ No stream arrays are requested or shown
- ✅ No GPS coordinates or detailed heart rate/power curves
- ✅ Consistent with existing privacy policy (public activities only, no detailed telemetry)

## Backward Compatibility

- ✅ All v3 fields are optional
- ✅ Activities without v3 data continue to display as before
- ✅ Existing v1 and v2 enrichment fields still work
- ✅ TypeScript types are backward compatible
- ✅ No breaking changes to existing queries or intents

## Production Rollout

The feature will go live when:
1. ✅ This PR is merged to main
2. ⏳ The spencer-brain vault is updated to export v3 schema
3. ⏳ The production rebuild fetches the new v3 data

No additional configuration or deployment steps are required.
