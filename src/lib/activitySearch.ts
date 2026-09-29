export type Activity = {
  id: number;
  name: string;
  sport_type: string;
  start_date_local: string;
  distance_m: number;
  moving_time_s: number;
  elevation_gain_m: number;
  workout_type: number | null;
  trainer: boolean;
  // v2 enrichment (optional, backward compatible)
  primary_stimulus?: string;
  modifiers?: string[];
  place?: string;
  place_source?: "name" | "gps";
  lap_count?: number;
  hard_lap_count?: number;
  has_intervals?: boolean;
  interval_score?: number;
  // v3 enrichment (optional, backward compatible)
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed?: number; // m/s
  max_speed?: number; // m/s
  average_watts?: number;
  weighted_average_watts?: number;
  // MMP fields (optional, public-activities-v4 schema)
  best_watts_5s?: number;
  best_watts_1m?: number;
  best_watts_5m?: number;
  best_watts_20m?: number;
  best_watts_60m?: number;
};

export type MatchKind = "keyword" | "fuzzy";

export type SearchHit = {
  activity: Activity;
  score: number;
  kind: MatchKind;
  matched: string[];
};

type IndexedActivity = {
  activity: Activity;
  words: string[];
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Strava workout_type codes: runs 1/2/3, rides 11/12.
const WORKOUT_TAGS: Record<number, string[]> = {
  1: ["race"],
  2: ["long", "long run"],
  3: ["workout", "session"],
  11: ["race"],
  12: ["workout", "session"],
};

export function sportLabel(sport: string): string {
  return sport.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function isRun(a: Activity) {
  return /Run$/.test(a.sport_type);
}

export function isRide(a: Activity) {
  return /Ride$/.test(a.sport_type);
}

function distanceTags(a: Activity): string[] {
  const km = a.distance_m / 1000;
  const tags: string[] = [];
  if (isRun(a)) {
    const near = (target: number, tol: number) => Math.abs(km - target) <= tol;
    if (near(5, 0.3)) tags.push("5k");
    if (near(10, 0.4)) tags.push("10k");
    if (near(21.1, 0.6)) tags.push("half", "half marathon");
    if (near(42.2, 1)) tags.push("marathon");
    if (km >= 25) tags.push("long");
    if (km > 0 && km < 6) tags.push("short");
  }
  if (isRide(a)) {
    if (km >= 100) tags.push("century", "long");
    if (km > 0 && km < 25) tags.push("short");
  }
  return tags;
}

function derivedTags(a: Activity): string[] {
  const d = new Date(a.start_date_local.replace(/Z$/, ""));
  const hour = d.getHours();
  const tags = [
    sportLabel(a.sport_type),
    isRun(a) ? "run running" : "",
    isRide(a) ? "ride riding bike cycling" : "",
    MONTHS[d.getMonth()],
    WEEKDAYS[d.getDay()],
    String(d.getFullYear()),
    hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening",
    ...(WORKOUT_TAGS[a.workout_type ?? -1] ?? []),
    ...distanceTags(a),
  ];
  if (a.trainer || a.sport_type.startsWith("Virtual")) tags.push("indoor", "trainer", "virtual");
  const km = a.distance_m / 1000;
  if (km > 0) {
    const mPerKm = a.elevation_gain_m / km;
    if (mPerKm >= 15) tags.push("hilly", "hills", "climbing");
    else if (mPerKm < 4) tags.push("flat");
  }
  // v2 enrichment tags
  if (a.primary_stimulus) tags.push(a.primary_stimulus);
  if (a.modifiers) tags.push(...a.modifiers);
  if (a.place) tags.push(...tokenize(a.place));
  if (a.has_intervals) tags.push("intervals", "reps", "repeats");
  // v3 enrichment tags: HR zones, power zones
  if (a.average_heartrate) {
    tags.push("hr", "heartrate", "heart rate");
    if (a.average_heartrate >= 170) tags.push("high hr", "hard effort");
    else if (a.average_heartrate >= 150) tags.push("moderate hr");
  }
  if (a.average_watts || a.weighted_average_watts) {
    tags.push("power", "watts");
    const watts = a.weighted_average_watts ?? a.average_watts ?? 0;
    if (watts >= 250) tags.push("high power");
  }
  return tags;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Parse date window from tokens, returning window and indices to consume
// Assumes America/Chicago timezone; today is 2026-09-29
function parseDateWindow(tokens: string[]): { window: DateWindow | null; consumedIndices: Set<number> } {
  const consumedIndices = new Set<number>();
  
  // Helper to format date as YYYY-MM-DD
  const formatDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Reference date: 2026-09-29 (America/Chicago) is a Monday
  const today = new Date('2026-09-29T12:00:00-05:00');
  const currentYear = today.getFullYear();
  
  // Check for "today"
  const todayIdx = tokens.indexOf("today");
  if (todayIdx >= 0) {
    consumedIndices.add(todayIdx);
    return {
      window: { start: formatDate(today), end: formatDate(today) },
      consumedIndices
    };
  }
  
  // Check for "yesterday"
  const yesterdayIdx = tokens.indexOf("yesterday");
  if (yesterdayIdx >= 0) {
    consumedIndices.add(yesterdayIdx);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      window: { start: formatDate(yesterday), end: formatDate(yesterday) },
      consumedIndices
    };
  }
  
  // Check for "this week"
  const thisIdx = tokens.indexOf("this");
  const weekIdx = tokens.indexOf("week");
  if (thisIdx >= 0 && weekIdx === thisIdx + 1) {
    consumedIndices.add(thisIdx);
    consumedIndices.add(weekIdx);
    // "This week" = from the Monday of the week containing (today-7 days) to today
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dayOfWeek = sevenDaysAgo.getDay();
    const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
    const daysToMonday = isoDayOfWeek - 1;
    const weekStart = new Date(sevenDaysAgo);
    weekStart.setDate(weekStart.getDate() - daysToMonday);
    return {
      window: { start: formatDate(weekStart), end: formatDate(today) },
      consumedIndices
    };
  }
  
  // Check for "last week" or "previous week"
  const lastIdx = tokens.indexOf("last");
  const previousIdx = tokens.indexOf("previous");
  const weekIdx2 = tokens.indexOf("week");
  
  if ((lastIdx >= 0 && weekIdx2 === lastIdx + 1) || (previousIdx >= 0 && weekIdx2 === previousIdx + 1)) {
    if (lastIdx >= 0 && weekIdx2 === lastIdx + 1) {
      consumedIndices.add(lastIdx);
      consumedIndices.add(weekIdx2);
    }
    if (previousIdx >= 0 && weekIdx2 === previousIdx + 1) {
      consumedIndices.add(previousIdx);
      consumedIndices.add(weekIdx2);
    }
    // "Last week" = the complete Monday-Sunday week containing (today-14 days)
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const dayOfWeek = fourteenDaysAgo.getDay();
    const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
    const daysToMonday = isoDayOfWeek - 1;
    const lastWeekStart = new Date(fourteenDaysAgo);
    lastWeekStart.setDate(lastWeekStart.getDate() - daysToMonday);
    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
    return {
      window: { start: formatDate(lastWeekStart), end: formatDate(lastWeekEnd) },
      consumedIndices
    };
  }
  
  // Check for "last N days"
  const daysIdx = tokens.indexOf("days");
  const dayIdx = tokens.indexOf("day");
  const finalDayIdx = daysIdx >= 0 ? daysIdx : dayIdx;
  
  if (lastIdx >= 0 && finalDayIdx >= 0) {
    // Find number between "last" and "day(s)"
    for (let i = lastIdx + 1; i < finalDayIdx; i++) {
      const num = parseInt(tokens[i], 10);
      if (!isNaN(num) && num > 0 && num <= 365) {
        consumedIndices.add(lastIdx);
        consumedIndices.add(i);
        consumedIndices.add(finalDayIdx);
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - num);
        return {
          window: { start: formatDate(startDate), end: formatDate(today) },
          consumedIndices
        };
      }
    }
  }
  
  // Check for "this year" or "ytd"
  const yearIdx = tokens.indexOf("year");
  const ytdIdx = tokens.indexOf("ytd");
  
  if ((thisIdx >= 0 && yearIdx === thisIdx + 1) || ytdIdx >= 0) {
    if (thisIdx >= 0 && yearIdx === thisIdx + 1) {
      consumedIndices.add(thisIdx);
      consumedIndices.add(yearIdx);
    }
    if (ytdIdx >= 0) {
      consumedIndices.add(ytdIdx);
    }
    return {
      window: { start: `${currentYear}-01-01`, end: formatDate(today) },
      consumedIndices
    };
  }
  
  // Check for "last year"
  if (lastIdx >= 0 && yearIdx === lastIdx + 1) {
    consumedIndices.add(lastIdx);
    consumedIndices.add(yearIdx);
    const lastYear = currentYear - 1;
    return {
      window: { start: `${lastYear}-01-01`, end: `${lastYear}-12-31` },
      consumedIndices
    };
  }
  
  // Check for "this month"
  const monthIdx = tokens.indexOf("month");
  if (thisIdx >= 0 && monthIdx === thisIdx + 1) {
    consumedIndices.add(thisIdx);
    consumedIndices.add(monthIdx);
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    return {
      window: { 
        start: `${year}-${String(month).padStart(2, '0')}-01`, 
        end: formatDate(today)
      },
      consumedIndices
    };
  }
  
  // Check for "last N months" - must have "last", a number, and "month"/"months"
  let monthsIdx = tokens.indexOf("months");
  if (monthsIdx < 0) monthsIdx = tokens.indexOf("month");
  
  if (lastIdx >= 0 && monthsIdx >= 0) {
    // Find number between "last" and "month(s)"
    for (let i = lastIdx + 1; i < monthsIdx; i++) {
      const num = parseInt(tokens[i], 10);
      if (!isNaN(num) && num > 0 && num <= 24) {
        consumedIndices.add(lastIdx);
        consumedIndices.add(i);
        consumedIndices.add(monthsIdx);
        const startDate = new Date(today);
        startDate.setMonth(startDate.getMonth() - num);
        return {
          window: { start: formatDate(startDate), end: formatDate(today) },
          consumedIndices
        };
      }
    }
  }
  
  // Check for named month + year (e.g., "march 2024") - CHECK THIS BEFORE standalone year
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];
  for (let i = 0; i < tokens.length - 1; i++) {
    const monthNum = monthNames.indexOf(tokens[i]);
    if (monthNum >= 0) {
      const year = parseInt(tokens[i + 1], 10);
      if (tokens[i + 1].length === 4 && year >= 2000 && year <= currentYear + 1) {
        consumedIndices.add(i);
        consumedIndices.add(i + 1);
        const month = monthNum + 1;
        const lastDay = new Date(year, month, 0).getDate();
        return {
          window: { 
            start: `${year}-${String(month).padStart(2, '0')}-01`,
            end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
          },
          consumedIndices
        };
      }
    }
  }
  
  // Check for standalone year (e.g., "2024", "2025")
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const year = parseInt(token, 10);
    if (token.length === 4 && year >= 2000 && year <= currentYear + 1) {
      consumedIndices.add(i);
      // Also consume "in" if it precedes the year
      if (i > 0 && tokens[i - 1] === "in") {
        consumedIndices.add(i - 1);
      }
      return {
        window: { start: `${year}-01-01`, end: `${year}-12-31` },
        consumedIndices
      };
    }
  }
  
  return { window: null, consumedIndices };
}

export type DateWindow = {
  start: string; // ISO date string (YYYY-MM-DD)
  end: string;   // ISO date string (YYYY-MM-DD)
};

export type SuperlativeIntent = {
  kind: "longest" | "fastest" | "most_intervals" | "hilliest" | "highest_hr";
  sport?: "run" | "ride";
} | {
  kind: "place_filter";
  place: string;
  filterType?: "race" | "workout";
} | {
  kind: "mmp_power";
  field: "best_watts_5s" | "best_watts_1m" | "best_watts_5m" | "best_watts_20m" | "best_watts_60m";
} | {
  kind: "highest_power";
} | {
  kind: "list";
  sport?: "run" | "ride";
} | null;

export type IntentClassification = {
  intent: SuperlativeIntent;
  dateWindow: DateWindow | null;
  remainingTokens: string[];
  isDeterministic: boolean;
};

function detectSuperlativeIntent(query: string): IntentClassification {
  const tokens = tokenize(query);
  let intent: SuperlativeIntent = null;
  let consumedIndices = new Set<number>();

  // Parse date window first
  const { window: dateWindow, consumedIndices: dateIndices } = parseDateWindow(tokens);
  dateIndices.forEach(i => consumedIndices.add(i));

  // Detect MMP power queries: "top/best/highest/max" + duration + optional "power/watts"
  // Durations: 5s, 5 sec, 1 min, 5 min, 20 min, 20m, 60 min, 1 hour, ftp (→ 20m)
  const powerTriggers = ["top", "best", "highest", "max"];
  const powerTriggerIdx = tokens.findIndex(t => powerTriggers.includes(t));
  
  if (powerTriggerIdx >= 0) {
    consumedIndices.add(powerTriggerIdx);
    
    // Look for duration tokens
    let mmpField: "best_watts_5s" | "best_watts_1m" | "best_watts_5m" | "best_watts_20m" | "best_watts_60m" | null = null;
    
    // Check for "ftp" (maps to 20m)
    const ftpIdx = tokens.indexOf("ftp");
    if (ftpIdx >= 0) {
      mmpField = "best_watts_20m";
      consumedIndices.add(ftpIdx);
    }
    
    // Check for duration patterns like "5s", "1m", "20m", "5 sec", "1 min", "20 min", "1 hour"
    for (let i = 0; i < tokens.length; i++) {
      if (consumedIndices.has(i)) continue;
      
      const token = tokens[i];
      const nextToken = i + 1 < tokens.length ? tokens[i + 1] : "";
      
      // Pattern: number + unit (e.g., "5s", "1m", "20m")
      if (/^(\d+)(s|sec|seconds?|m|min|minutes?|h|hour|hours?)$/.test(token)) {
        const match = token.match(/^(\d+)(s|sec|seconds?|m|min|minutes?|h|hour|hours?)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          const unit = match[2];
          
          if ((unit === "s" || unit === "sec" || unit.startsWith("second")) && num === 5) {
            mmpField = "best_watts_5s";
            consumedIndices.add(i);
          } else if ((unit === "m" || unit === "min" || unit.startsWith("minute")) && num === 1) {
            mmpField = "best_watts_1m";
            consumedIndices.add(i);
          } else if ((unit === "m" || unit === "min" || unit.startsWith("minute")) && num === 5) {
            mmpField = "best_watts_5m";
            consumedIndices.add(i);
          } else if ((unit === "m" || unit === "min" || unit.startsWith("minute")) && num === 20) {
            mmpField = "best_watts_20m";
            consumedIndices.add(i);
          } else if ((unit === "m" || unit === "min" || unit.startsWith("minute")) && num === 60) {
            mmpField = "best_watts_60m";
            consumedIndices.add(i);
          } else if ((unit === "h" || unit === "hour" || unit.startsWith("hour")) && num === 1) {
            mmpField = "best_watts_60m";
            consumedIndices.add(i);
          }
        }
      }
      
      // Pattern: number followed by separate unit token (e.g., "5 sec", "1 min", "20 min")
      const num = parseInt(token, 10);
      if (!isNaN(num) && nextToken) {
        if ((nextToken === "s" || nextToken === "sec" || nextToken.startsWith("second")) && num === 5) {
          mmpField = "best_watts_5s";
          consumedIndices.add(i);
          consumedIndices.add(i + 1);
        } else if ((nextToken === "m" || nextToken === "min" || nextToken.startsWith("minute")) && num === 1) {
          mmpField = "best_watts_1m";
          consumedIndices.add(i);
          consumedIndices.add(i + 1);
        } else if ((nextToken === "m" || nextToken === "min" || nextToken.startsWith("minute")) && num === 5) {
          mmpField = "best_watts_5m";
          consumedIndices.add(i);
          consumedIndices.add(i + 1);
        } else if ((nextToken === "m" || nextToken === "min" || nextToken.startsWith("minute")) && num === 20) {
          mmpField = "best_watts_20m";
          consumedIndices.add(i);
          consumedIndices.add(i + 1);
        } else if ((nextToken === "m" || nextToken === "min" || nextToken.startsWith("minute")) && num === 60) {
          mmpField = "best_watts_60m";
          consumedIndices.add(i);
          consumedIndices.add(i + 1);
        } else if ((nextToken === "h" || nextToken === "hour" || nextToken.startsWith("hour")) && num === 1) {
          mmpField = "best_watts_60m";
          consumedIndices.add(i);
          consumedIndices.add(i + 1);
        }
      }
    }
    
    // Consume optional "power" or "watts"
    const powerIdx = tokens.indexOf("power");
    const wattsIdx = tokens.indexOf("watts");
    if (powerIdx >= 0) consumedIndices.add(powerIdx);
    if (wattsIdx >= 0) consumedIndices.add(wattsIdx);
    
    if (mmpField) {
      intent = { kind: "mmp_power", field: mmpField };
    } else {
      // No duration specified, use average/weighted fallback (existing "highest power" behavior)
      intent = { kind: "highest_power" };
    }
  }

  // Detect longest/farthest (only if no power intent)
  if (!intent) {
    const longestIdx = tokens.findIndex(t => ["longest", "farthest"].includes(t));
    if (longestIdx >= 0) {
      intent = { kind: "longest" };
      consumedIndices.add(longestIdx);
      const sportIdx = tokens.findIndex(t => ["run", "runs", "running"].includes(t));
      if (sportIdx >= 0) {
        intent.sport = "run";
        consumedIndices.add(sportIdx);
      }
      const bikeIdx = tokens.findIndex(t => ["ride", "rides", "bike", "cycling"].includes(t));
      if (bikeIdx >= 0) {
        intent.sport = "ride";
        consumedIndices.add(bikeIdx);
      }
    }
  }

  // Detect most intervals
  if (!intent) {
    const mostIdx = tokens.findIndex(t => t === "most");
    const intervalIdx = tokens.findIndex(t => ["intervals", "reps", "repeats"].includes(t));
    if (mostIdx >= 0 && intervalIdx >= 0) {
      intent = { kind: "most_intervals" };
      consumedIndices.add(mostIdx);
      consumedIndices.add(intervalIdx);
    }
  }

  // Detect fastest
  if (!intent) {
    const fastestIdx = tokens.findIndex(t => ["fastest", "quickest"].includes(t));
    if (fastestIdx >= 0) {
      intent = { kind: "fastest" };
      consumedIndices.add(fastestIdx);
      const sportIdx = tokens.findIndex(t => ["run", "runs", "running"].includes(t));
      if (sportIdx >= 0) {
        intent.sport = "run";
        consumedIndices.add(sportIdx);
      }
    }
  }

  // Detect hilliest/most climbing
  if (!intent) {
    const hilliestIdx = tokens.findIndex(t => ["hilliest", "climbing"].includes(t));
    const mostIdx = tokens.findIndex(t => t === "most");
    const mostClimbingIdx = mostIdx >= 0 && tokens.findIndex(t => t === "climbing") >= 0;
    if (hilliestIdx >= 0 || mostClimbingIdx) {
      intent = { kind: "hilliest" };
      if (hilliestIdx >= 0) consumedIndices.add(hilliestIdx);
      if (mostClimbingIdx) {
        consumedIndices.add(mostIdx);
        const climbIdx = tokens.findIndex(t => t === "climbing");
        consumedIndices.add(climbIdx);
      }
    }
  }

  // Detect highest HR (e.g., "highest heart rate", "highest hr", "highest average hr")
  const highestIdx = tokens.findIndex(t => ["highest", "max"].includes(t));
  const hrIdx = tokens.findIndex(t => ["hr", "heartrate", "heart"].includes(t));
  const avgIdx = tokens.findIndex(t => ["avg", "average"].includes(t));
  if (highestIdx >= 0 && hrIdx >= 0) {
    intent = { kind: "highest_hr" };
    consumedIndices.add(highestIdx);
    consumedIndices.add(hrIdx);
    if (avgIdx >= 0) consumedIndices.add(avgIdx);
    // Also consume "rate" if it follows "heart"
    const rateIdx = tokens.findIndex(t => t === "rate");
    if (rateIdx >= 0 && rateIdx === hrIdx + 1) consumedIndices.add(rateIdx);
  }

  // Detect highest power (e.g., "highest power", "highest watts", "highest average watts")
  const powerIdx = tokens.findIndex(t => ["power", "watts", "watt"].includes(t));
  if (highestIdx >= 0 && powerIdx >= 0) {
    intent = { kind: "highest_power" };
    consumedIndices.add(highestIdx);
    consumedIndices.add(powerIdx);
    if (avgIdx >= 0) consumedIndices.add(avgIdx);
    // Also consume "average" or "weighted" before power/watts
    const weightedIdx = tokens.findIndex(t => t === "weighted");
    if (weightedIdx >= 0) consumedIndices.add(weightedIdx);
  }

  // Detect place filters (e.g., "Chicago races")
  if (!intent) {
    const raceIdx = tokens.findIndex(t => ["race", "races"].includes(t));
    const workoutIdx = tokens.findIndex(t => ["workout", "workouts", "session", "sessions"].includes(t));
    
    // If we have remaining tokens that could be place names
    const remainingAfterSuperlative = tokens.filter((_, i) => !consumedIndices.has(i));
    if (remainingAfterSuperlative.length > 0 && (raceIdx >= 0 || workoutIdx >= 0)) {
      // Try to extract place: anything that's not race/workout
      const placeTokens = remainingAfterSuperlative.filter(t => 
        !["race", "races", "workout", "workouts", "session", "sessions", "run", "runs", "running", "ride", "rides", "bike", "cycling"].includes(t)
      );
      if (placeTokens.length > 0) {
        const place = placeTokens.join(" ");
        const filterType = raceIdx >= 0 ? "race" as const : workoutIdx >= 0 ? "workout" as const : undefined;
        intent = { kind: "place_filter", place, filterType };
        consumedIndices.add(raceIdx >= 0 ? raceIdx : workoutIdx);
        // Consume place tokens
        placeTokens.forEach(pt => {
          const idx = tokens.indexOf(pt);
          if (idx >= 0) consumedIndices.add(idx);
        });
      }
    }
  }

  // Detect list intent: pure date window with optional sport, optional "activities/workouts/rides/runs"
  // Synonyms: activities, workouts, rides, runs
  if (!intent && dateWindow) {
    const listSynonyms = ["activities", "activity", "workouts", "workout", "rides", "runs"];
    const listIdx = tokens.findIndex(t => listSynonyms.includes(t));
    if (listIdx >= 0) consumedIndices.add(listIdx);
    
    // Check for sport
    let sport: "run" | "ride" | undefined = undefined;
    const runIdx = tokens.findIndex(t => ["run", "runs", "running"].includes(t));
    const rideIdx = tokens.findIndex(t => ["ride", "rides", "bike", "cycling"].includes(t));
    if (runIdx >= 0) {
      sport = "run";
      consumedIndices.add(runIdx);
    } else if (rideIdx >= 0) {
      sport = "ride";
      consumedIndices.add(rideIdx);
    }
    
    // Also consume possessive "'s" if present
    const possessiveIdx = tokens.indexOf("s");
    if (possessiveIdx >= 0 && possessiveIdx > 0) {
      // Check if it follows a date window token (e.g., "week's")
      consumedIndices.add(possessiveIdx);
    }
    
    const remainingTokens = tokens.filter((_, i) => !consumedIndices.has(i));
    if (remainingTokens.length === 0) {
      intent = { kind: "list", sport };
    }
  }

  const remainingTokens = tokens.filter((_, i) => !consumedIndices.has(i));
  // Deterministic if we have an intent and no remaining semantic tokens
  const isDeterministic = intent !== null && remainingTokens.length === 0;
  return { intent, dateWindow, remainingTokens, isDeterministic };
}

export function classifyIntent(query: string): IntentClassification {
  return detectSuperlativeIntent(query);
}

export function buildIndex(activities: Activity[]): IndexedActivity[] {
  return activities.map((activity) => ({
    activity,
    words: Array.from(new Set(tokenize([activity.name, ...derivedTags(activity)].join(" ")))),
  }));
}

// Optimal string alignment distance with an early exit once `max` is exceeded.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

function scoreToken(token: string, words: string[]): { score: number; fuzzy: boolean } {
  let best = 0;
  let fuzzy = false;
  // Years and distances ("2025", "10k") must not fuzz into their neighbours.
  const maxEdits = /\d/.test(token) ? 0 : token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0;
  for (const w of words) {
    if (w === token) return { score: 1, fuzzy: false };
    if (w.startsWith(token) && token.length >= 2) {
      if (0.85 > best) [best, fuzzy] = [0.85, false];
      continue;
    }
    if (maxEdits === 0 || best >= 0.85) continue;
    const prefix = w.slice(0, token.length + maxEdits);
    const d = Math.min(editDistance(token, w, maxEdits), editDistance(token, prefix, maxEdits));
    if (d <= maxEdits) {
      const s = 0.7 - 0.15 * (d - 1);
      if (s > best) [best, fuzzy] = [s, true];
    }
  }
  return { score: best, fuzzy };
}

export function searchActivities(
  index: IndexedActivity[],
  query: string,
  limit = 200,
): SearchHit[] {
  const { intent, dateWindow, remainingTokens, isDeterministic } = detectSuperlativeIntent(query);
  const tokens = Array.from(new Set(remainingTokens.length > 0 ? remainingTokens : tokenize(query)));

  let candidates: IndexedActivity[] = index;

  // Apply date window filter first (before any other filtering)
  if (dateWindow) {
    candidates = candidates.filter(({ activity }) => {
      const activityDate = activity.start_date_local.slice(0, 10); // YYYY-MM-DD
      return activityDate >= dateWindow.start && activityDate <= dateWindow.end;
    });
  }

  // Apply intent-based filtering
  if (intent) {
    if (intent.kind === "place_filter") {
      const placeLower = intent.place.toLowerCase();
      candidates = candidates.filter(({ activity }) => {
        const placeMatch = activity.place?.toLowerCase().includes(placeLower);
        if (!placeMatch) return false;
        
        // Additional filter type checks
        if (intent.filterType === "race") {
          return activity.primary_stimulus === "race" || 
                 activity.workout_type === 1 || 
                 activity.workout_type === 11 ||
                 activity.name.toLowerCase().includes("race");
        }
        if (intent.filterType === "workout") {
          return activity.workout_type === 3 || activity.workout_type === 12;
        }
        return true;
      });
    } else if (intent.kind === "mmp_power") {
      // Filter to rides that have the MMP field
      candidates = candidates.filter(({ activity }) => 
        isRide(activity) && activity[intent.field] != null
      );
    } else if (intent.kind === "highest_power") {
      // Filter to rides that have average_watts or weighted_average_watts
      candidates = candidates.filter(({ activity }) => 
        isRide(activity) && (activity.average_watts != null || activity.weighted_average_watts != null)
      );
    } else if (intent.kind === "longest" && intent.sport) {
      candidates = candidates.filter(({ activity }) => 
        intent.sport === "run" ? isRun(activity) : isRide(activity)
      );
    } else if (intent.kind === "fastest" && intent.sport) {
      candidates = candidates.filter(({ activity }) => 
        intent.sport === "run" ? isRun(activity) : isRide(activity)
      );
    } else if (intent.kind === "list") {
      // Filter by sport if specified
      if (intent.sport) {
        candidates = candidates.filter(({ activity }) => 
          intent.sport === "run" ? isRun(activity) : isRide(activity)
        );
      }
    }
  }

  if (isDeterministic) {
    // Deterministic intent: no keyword matching, just apply metric/filter sorting
    const hits = candidates.map(({ activity }): SearchHit => ({
      activity,
      score: 1,
      kind: "keyword",
      matched: [],
    }));
    return applySuperlativeSorting(hits, intent, limit);
  }

  // Regular keyword/fuzzy search with optional superlative sorting
  if (tokens.length === 0) return [];

  const full: SearchHit[] = [];
  const partial: SearchHit[] = [];
  for (const { activity, words } of candidates) {
    let total = 0;
    let hitCount = 0;
    let anyFuzzy = false;
    const matched: string[] = [];
    for (const t of tokens) {
      const { score, fuzzy } = scoreToken(t, words);
      if (score > 0) {
        hitCount++;
        total += score;
        matched.push(t);
        anyFuzzy ||= fuzzy;
      }
    }
    if (hitCount === 0) continue;
    const hit: SearchHit = {
      activity,
      score: total / tokens.length,
      kind: anyFuzzy ? "fuzzy" : "keyword",
      matched,
    };
    if (hitCount === tokens.length) full.push(hit);
    else if (hitCount * 2 >= tokens.length) partial.push(hit);
  }

  const byScore = (a: SearchHit, b: SearchHit) =>
    b.score - a.score || b.activity.start_date_local.localeCompare(a.activity.start_date_local);
  full.sort(byScore);
  partial.sort(byScore);
  const results = (full.length >= 10 ? full : [...full, ...partial]);
  
  // Apply superlative sorting if intent exists
  if (intent && intent.kind !== "place_filter") {
    return applySuperlativeSorting(results, intent, limit);
  }

  return results.slice(0, limit);
}

function applySuperlativeSorting(
  hits: SearchHit[],
  intent: SuperlativeIntent,
  limit: number,
): SearchHit[] {
  if (!intent || intent.kind === "place_filter") return hits.slice(0, limit);

  const sorted = [...hits];
  
  if (intent.kind === "longest") {
    sorted.sort((a, b) => b.activity.distance_m - a.activity.distance_m);
  } else if (intent.kind === "fastest") {
    // Sort by pace (ascending time per distance for runs with sufficient distance)
    sorted.sort((a, b) => {
      const paceA = a.activity.distance_m > 0 ? a.activity.moving_time_s / a.activity.distance_m : Infinity;
      const paceB = b.activity.distance_m > 0 ? b.activity.moving_time_s / b.activity.distance_m : Infinity;
      return paceA - paceB;
    });
  } else if (intent.kind === "most_intervals") {
    // Sort by interval_score (desc), then hard_lap_count (desc), then has_intervals
    sorted.sort((a, b) => {
      const scoreA = a.activity.interval_score ?? 0;
      const scoreB = b.activity.interval_score ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      
      const lapsA = a.activity.hard_lap_count ?? 0;
      const lapsB = b.activity.hard_lap_count ?? 0;
      if (lapsB !== lapsA) return lapsB - lapsA;
      
      const hasA = a.activity.has_intervals ? 1 : 0;
      const hasB = b.activity.has_intervals ? 1 : 0;
      return hasB - hasA;
    });
  } else if (intent.kind === "hilliest") {
    sorted.sort((a, b) => b.activity.elevation_gain_m - a.activity.elevation_gain_m);
  } else if (intent.kind === "highest_hr") {
    // Sort by average heart rate (desc), filter out activities without HR data
    const withHr = sorted.filter(h => h.activity.average_heartrate !== undefined);
    withHr.sort((a, b) => (b.activity.average_heartrate ?? 0) - (a.activity.average_heartrate ?? 0));
    return withHr.slice(0, limit);
  } else if (intent.kind === "mmp_power") {
    // Sort by MMP field descending
    sorted.sort((a, b) => {
      const valA = a.activity[intent.field] ?? 0;
      const valB = b.activity[intent.field] ?? 0;
      return valB - valA;
    });
  } else if (intent.kind === "highest_power") {
    // Sort by weighted average watts (or average watts if weighted not available), filter out activities without power data
    const withPower = sorted.filter(h => 
      h.activity.average_watts !== undefined || h.activity.weighted_average_watts !== undefined
    );
    withPower.sort((a, b) => {
      const powerA = a.activity.weighted_average_watts ?? a.activity.average_watts ?? 0;
      const powerB = b.activity.weighted_average_watts ?? b.activity.average_watts ?? 0;
      return powerB - powerA;
    });
    return withPower.slice(0, limit);
  } else if (intent.kind === "list") {
    // Sort by start_date_local descending (most recent first)
    sorted.sort((a, b) => b.activity.start_date_local.localeCompare(a.activity.start_date_local));
  }

  return sorted.slice(0, limit);
}

export function describeActivity(a: Activity): string {
  const km = a.distance_m / 1000;
  const parts = [
    `"${a.name}"`,
    sportLabel(a.sport_type),
    a.start_date_local.slice(0, 10),
    km > 0 ? `${km.toFixed(1)} km` : "",
    formatDuration(a.moving_time_s),
    a.elevation_gain_m > 0 ? `${a.elevation_gain_m} m climbing` : "",
    ...(WORKOUT_TAGS[a.workout_type ?? -1]?.slice(0, 1) ?? []),
    a.trainer ? "indoor" : "",
  ];
  // v2 enrichment for Jev
  if (a.primary_stimulus) parts.push(a.primary_stimulus);
  if (a.modifiers && a.modifiers.length > 0) {
    parts.push(a.modifiers.slice(0, 3).join(", "));
  }
  if (a.place) parts.push(a.place);
  if (a.has_intervals) {
    const intervalDesc = a.hard_lap_count 
      ? `${a.hard_lap_count} hard laps`
      : "intervals";
    parts.push(intervalDesc);
  }
  // v3 enrichment for Jev
  if (a.average_heartrate) {
    const hrDesc = a.max_heartrate 
      ? `${Math.round(a.average_heartrate)} bpm avg (max ${Math.round(a.max_heartrate)})`
      : `${Math.round(a.average_heartrate)} bpm avg`;
    parts.push(hrDesc);
  }
  if (a.average_watts || a.weighted_average_watts) {
    const watts = Math.round(a.weighted_average_watts ?? a.average_watts ?? 0);
    const powerDesc = a.weighted_average_watts 
      ? `${watts}W weighted avg`
      : `${watts}W avg`;
    parts.push(powerDesc);
  }
  // MMP data (show best 20m when present)
  if (a.best_watts_20m) parts.push(`${Math.round(a.best_watts_20m)}W 20min`);
  return parts.filter(Boolean).join(", ");
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
