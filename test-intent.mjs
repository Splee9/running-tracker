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
  
  // Reference date: 2026-09-29 (America/Chicago)
  const today = new Date('2026-09-29T12:00:00-05:00');
  const currentYear = today.getFullYear();
  
  // Check for "this year" or "ytd"
  const thisIdx = tokens.indexOf("this");
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
  const lastIdx = tokens.indexOf("last");
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

function detectSuperlativeIntent(query) {
  const tokens = tokenize(query);
  let intent = null;
  let consumedIndices = new Set();

  // Parse date window first
  const { window: dateWindow, consumedIndices: dateIndices } = parseDateWindow(tokens);
  dateIndices.forEach(i => consumedIndices.add(i));

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
    
    // Extract place tokens (after consuming superlative and sport)
    const placeTokens = tokens.filter((t, i) => 
      !consumedIndices.has(i) && !["in", "at", "from", "near"].includes(t)
    );
    if (placeTokens.length > 0) {
      intent.place = placeTokens.join(" ");
      // Consume place tokens and prepositions
      tokens.forEach((t, i) => {
        if (placeTokens.includes(t) || ["in", "at", "from", "near"].includes(t)) {
          consumedIndices.add(i);
        }
      });
    }
  }

  const mostIdx = tokens.findIndex(t => t === "most");
  const intervalIdx = tokens.findIndex(t => ["intervals", "reps", "repeats"].includes(t));
  if (mostIdx >= 0 && intervalIdx >= 0 && !intent) {
    intent = { kind: "most_intervals" };
    consumedIndices.add(mostIdx);
    consumedIndices.add(intervalIdx);
    
    // Extract place tokens
    const placeTokens = tokens.filter((t, i) => 
      !consumedIndices.has(i) && !["in", "at", "from", "near"].includes(t)
    );
    if (placeTokens.length > 0) {
      intent.place = placeTokens.join(" ");
      tokens.forEach((t, i) => {
        if (placeTokens.includes(t) || ["in", "at", "from", "near"].includes(t)) {
          consumedIndices.add(i);
        }
      });
    }
  }

  // Detect fastest
  const fastestIdx = tokens.findIndex(t => ["fastest", "quickest"].includes(t));
  if (fastestIdx >= 0 && !intent) {
    intent = { kind: "fastest" };
    consumedIndices.add(fastestIdx);
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
    
    // Extract place tokens
    const placeTokens = tokens.filter((t, i) => 
      !consumedIndices.has(i) && !["in", "at", "from", "near"].includes(t)
    );
    if (placeTokens.length > 0) {
      intent.place = placeTokens.join(" ");
      tokens.forEach((t, i) => {
        if (placeTokens.includes(t) || ["in", "at", "from", "near"].includes(t)) {
          consumedIndices.add(i);
        }
      });
    }
  }

  // Detect hilliest/most climbing
  const hilliestIdx = tokens.findIndex(t => ["hilliest", "climbing"].includes(t));
  const mostClimbingIdx = mostIdx >= 0 && tokens.findIndex(t => t === "climbing") >= 0;
  if ((hilliestIdx >= 0 || mostClimbingIdx) && !intent) {
    intent = { kind: "hilliest" };
    if (hilliestIdx >= 0) consumedIndices.add(hilliestIdx);
    if (mostClimbingIdx) {
      consumedIndices.add(mostIdx);
      const climbIdx = tokens.findIndex(t => t === "climbing");
      consumedIndices.add(climbIdx);
    }
    
    // Extract place tokens
    const placeTokens = tokens.filter((t, i) => 
      !consumedIndices.has(i) && !["in", "at", "from", "near"].includes(t)
    );
    if (placeTokens.length > 0) {
      intent.place = placeTokens.join(" ");
      tokens.forEach((t, i) => {
        if (placeTokens.includes(t) || ["in", "at", "from", "near"].includes(t)) {
          consumedIndices.add(i);
        }
      });
    }
  }

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

  const remainingTokens = tokens.filter((_, i) => !consumedIndices.has(i));
  const isDeterministic = intent !== null && remainingTokens.length === 0;
  return { intent, dateWindow, remainingTokens, isDeterministic };
}

console.log("Testing intent detection with date windows:\n");

const tests = [
  // Original tests
  ["longest run", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: null }],
  ["most intervals", { isDeterministic: true, kind: "most_intervals", dateWindow: null }],
  ["Chicago races", { isDeterministic: true, kind: "place_filter", place: "chicago", filterType: "race", dateWindow: null }],
  
  // New date window tests
  ["longest run this year", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2026-01-01", end: "2026-09-29" } }],
  ["longest run 2024", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2024-01-01", end: "2024-12-31" } }],
  ["longest run in 2024", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2024-01-01", end: "2024-12-31" } }],
  ["most intervals last year", { isDeterministic: true, kind: "most_intervals", dateWindow: { start: "2025-01-01", end: "2025-12-31" } }],
  ["Chicago races 2025", { isDeterministic: true, kind: "place_filter", place: "chicago", filterType: "race", dateWindow: { start: "2025-01-01", end: "2025-12-31" } }],
  ["longest run ytd", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2026-01-01", end: "2026-09-29" } }],
  ["longest run this month", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2026-09-01", end: "2026-09-29" } }],
  ["longest run march 2024", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2024-03-01", end: "2024-03-31" } }],
  ["longest run last 3 months", { isDeterministic: true, kind: "longest", sport: "run", dateWindow: { start: "2026-06-29", end: "2026-09-29" } }],
  
  // New place-based superlative tests (the bug fix)
  ["longest run in Chicago", { isDeterministic: true, kind: "longest", sport: "run", place: "chicago", dateWindow: null }],
  ["longest Chicago run", { isDeterministic: true, kind: "longest", sport: "run", place: "chicago", dateWindow: null }],
  ["longest run Chicago", { isDeterministic: true, kind: "longest", sport: "run", place: "chicago", dateWindow: null }],
  ["fastest run in Boston", { isDeterministic: true, kind: "fastest", sport: "run", place: "boston", dateWindow: null }],
  ["hilliest in Denver", { isDeterministic: true, kind: "hilliest", place: "denver", dateWindow: null }],
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
  if (result.intent && "sport" in result.intent && result.intent.sport) console.log(`   sport: ${result.intent.sport}`);
  if (result.intent && "place" in result.intent && result.intent.place) console.log(`   place: ${result.intent.place}`);
  if (result.intent && "filterType" in result.intent && result.intent.filterType) console.log(`   filterType: ${result.intent.filterType}`);
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
