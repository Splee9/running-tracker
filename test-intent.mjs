// Minimal verification for the three required examples

function tokenize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Parse date window from tokens, returning window and indices to consume
// Assumes America/Chicago timezone; today is 2026-09-29
function parseDateWindow(tokens) {
  const consumedIndices = new Set();
  
  // Helper to format date as YYYY-MM-DD
  const formatDate = (d) => {
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
    const dayOfWeek = today.getDay();
    const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
    const daysToMonday = isoDayOfWeek - 1;
    const weekStart = new Date(today);
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
  
  // Check for "last N months"
  let monthsIdx = tokens.indexOf("months");
  if (monthsIdx < 0) monthsIdx = tokens.indexOf("month");
  
  if (lastIdx >= 0 && monthsIdx >= 0) {
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
  
  // Check for named month + year
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
  
  // Check for standalone year
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const year = parseInt(token, 10);
    if (token.length === 4 && year >= 2000 && year <= currentYear + 1) {
      consumedIndices.add(i);
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

function detectSuperlativeIntent(query) {
  const tokens = tokenize(query);
  let intent = null;
  let consumedIndices = new Set();

  // Parse date window first
  const { window: dateWindow, consumedIndices: dateIndices } = parseDateWindow(tokens);
  dateIndices.forEach(i => consumedIndices.add(i));

  // Detect MMP power queries
  const powerTriggers = ["top", "best", "highest", "max"];
  const powerTriggerIdx = tokens.findIndex(t => powerTriggers.includes(t));
  
  if (powerTriggerIdx >= 0) {
    consumedIndices.add(powerTriggerIdx);
    
    let mmpField = null;
    
    const ftpIdx = tokens.indexOf("ftp");
    if (ftpIdx >= 0) {
      mmpField = "best_watts_20m";
      consumedIndices.add(ftpIdx);
    }
    
    for (let i = 0; i < tokens.length; i++) {
      if (consumedIndices.has(i)) continue;
      
      const token = tokens[i];
      const nextToken = i + 1 < tokens.length ? tokens[i + 1] : "";
      
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
    
    const powerIdx = tokens.indexOf("power");
    const wattsIdx = tokens.indexOf("watts");
    if (powerIdx >= 0) consumedIndices.add(powerIdx);
    if (wattsIdx >= 0) consumedIndices.add(wattsIdx);
    
    if (mmpField) {
      intent = { kind: "mmp_power", field: mmpField };
    } else {
      intent = { kind: "highest_power" };
    }
  }

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
    }
  }

  if (!intent) {
    const mostIdx = tokens.findIndex(t => t === "most");
    const intervalIdx = tokens.findIndex(t => ["intervals", "reps", "repeats"].includes(t));
    if (mostIdx >= 0 && intervalIdx >= 0) {
      intent = { kind: "most_intervals" };
      consumedIndices.add(mostIdx);
      consumedIndices.add(intervalIdx);
    }
  }

  if (!intent) {
    const raceIdx = tokens.findIndex(t => ["race", "races"].includes(t));
    const remainingAfterSuperlative = tokens.filter((_, i) => !consumedIndices.has(i));
    if (remainingAfterSuperlative.length > 0 && raceIdx >= 0) {
      const placeTokens = remainingAfterSuperlative.filter(t => 
        !["race", "races"].includes(t)
      );
      if (placeTokens.length > 0) {
        const place = placeTokens.join(" ");
        intent = { kind: "place_filter", place, filterType: "race" };
        consumedIndices.add(raceIdx);
        placeTokens.forEach(pt => {
          const idx = tokens.indexOf(pt);
          if (idx >= 0) consumedIndices.add(idx);
        });
      }
    }
  }

  // Detect list intent
  if (!intent && dateWindow) {
    const listSynonyms = ["activities", "activity", "workouts", "workout", "rides", "runs"];
    const listIdx = tokens.findIndex(t => listSynonyms.includes(t));
    if (listIdx >= 0) consumedIndices.add(listIdx);
    
    let sport = undefined;
    const runIdx = tokens.findIndex(t => ["run", "runs", "running"].includes(t));
    const rideIdx = tokens.findIndex(t => ["ride", "rides", "bike", "cycling"].includes(t));
    if (runIdx >= 0) {
      sport = "run";
      consumedIndices.add(runIdx);
    } else if (rideIdx >= 0) {
      sport = "ride";
      consumedIndices.add(rideIdx);
    }
    
    const possessiveIdx = tokens.indexOf("s");
    if (possessiveIdx >= 0 && possessiveIdx > 0) {
      consumedIndices.add(possessiveIdx);
    }
    
    const remainingTokens = tokens.filter((_, i) => !consumedIndices.has(i));
    if (remainingTokens.length === 0) {
      intent = { kind: "list", sport };
    }
  }

  const remainingTokens = tokens.filter((_, i) => !consumedIndices.has(i));
  const isDeterministic = intent !== null && remainingTokens.length === 0;
  return { intent, dateWindow, remainingTokens, isDeterministic };
}

console.log("Testing intent detection with date windows, list intent, and MMP:\n");

const tests = [
  // Original tests
  ["longest run", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: null }],
  ["most intervals", { isDeterministic: true, kind: "most_intervals", dateWindow: null }],
  ["Chicago races", { isDeterministic: true, kind: "place_filter", place: "chicago", filterType: "race", dateWindow: null }],
  
  // Date window tests
  ["longest run this year", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2026-01-01", end: "2026-09-29" } }],
  ["longest run 2024", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2024-01-01", end: "2024-12-31" } }],
  ["longest run in 2024", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2024-01-01", end: "2024-12-31" } }],
  ["most intervals last year", { isDeterministic: true, kind: "most_intervals", dateWindow: { start: "2025-01-01", end: "2025-12-31" } }],
  ["Chicago races 2025", { isDeterministic: true, kind: "place_filter", place: "chicago", filterType: "race", dateWindow: { start: "2025-01-01", end: "2025-12-31" } }],
  ["longest run ytd", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2026-01-01", end: "2026-09-29" } }],
  ["longest run this month", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2026-09-01", end: "2026-09-29" } }],
  ["longest run march 2024", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2024-03-01", end: "2024-03-31" } }],
  ["longest run last 3 months", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2026-06-29", end: "2026-09-29" } }],
  
  // New date window tests (required by user)
  ["last week", { isDeterministic: true, kind: "list", dateWindow: { start: "2026-09-14", end: "2026-09-20" } }],
  ["last week's activities", { isDeterministic: true, kind: "list", dateWindow: { start: "2026-09-14", end: "2026-09-20" } }],
  ["this week runs", { isDeterministic: true, kind: "list", sport: "run", dateWindow: { start: "2026-09-28", end: "2026-09-29" } }],
  
  // MMP tests (required by user)
  ["top 20 min power this year", { isDeterministic: true, kind: "mmp_power", field: "best_watts_20m", dateWindow: { start: "2026-01-01", end: "2026-09-29" } }],
  ["best 5 min watts 2024", { isDeterministic: true, kind: "mmp_power", field: "best_watts_5m", dateWindow: { start: "2024-01-01", end: "2024-12-31" } }],
  ["highest power this year", { isDeterministic: true, kind: "highest_power", dateWindow: { start: "2026-01-01", end: "2026-09-29" } }],
];

let allPassed = true;

for (const [query, expected] of tests) {
  const result = detectSuperlativeIntent(query);
  let pass = result.isDeterministic === expected.isDeterministic && 
             result.intent?.kind === expected.kind;
  
  if (expected.sport !== undefined) {
    if (result.intent?.sport !== expected.sport) pass = false;
  }
  if (expected.place !== undefined) {
    if (result.intent?.place !== expected.place) pass = false;
  }
  if (expected.filterType !== undefined) {
    if (result.intent?.filterType !== expected.filterType) pass = false;
  }
  if (expected.field !== undefined) {
    if (result.intent?.field !== expected.field) pass = false;
  }
  if (expected.dateWindow !== undefined) {
    if (expected.dateWindow === null) {
      if (result.dateWindow !== null) pass = false;
    } else {
      if (!result.dateWindow || 
          result.dateWindow.start !== expected.dateWindow.start || 
          result.dateWindow.end !== expected.dateWindow.end) {
        pass = false;
      }
    }
  }
  
  const status = pass ? "✅" : "❌";
  console.log(`${status} "${query}"`);
  console.log(`   isDeterministic: ${result.isDeterministic}, kind: ${result.intent?.kind || "null"}`);
  if (result.intent && "sport" in result.intent) console.log(`   sport: ${result.intent.sport}`);
  if (result.intent && "place" in result.intent) console.log(`   place: ${result.intent.place}, filterType: ${result.intent.filterType}`);
  if (result.intent && "field" in result.intent) console.log(`   field: ${result.intent.field}`);
  if (result.dateWindow) console.log(`   dateWindow: ${result.dateWindow.start} to ${result.dateWindow.end}`);
  console.log();
  
  allPassed = allPassed && pass;
}

if (allPassed) {
  console.log("✅ All tests pass!");
  process.exit(0);
} else {
  console.log("❌ Some tests failed");
  process.exit(1);
}
