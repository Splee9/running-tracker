// Minimal verification for the three required examples

function tokenize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function detectSuperlativeIntent(query) {
  const tokens = tokenize(query);
  let intent = null;
  let consumedIndices = new Set();

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

  const mostIdx = tokens.findIndex(t => t === "most");
  const intervalIdx = tokens.findIndex(t => ["intervals", "reps", "repeats"].includes(t));
  if (mostIdx >= 0 && intervalIdx >= 0) {
    intent = { kind: "most_intervals" };
    consumedIndices.add(mostIdx);
    consumedIndices.add(intervalIdx);
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
  return { intent, remainingTokens, isDeterministic };
}

console.log("Testing three required examples:\n");

const tests = [
  ["longest run", { isDeterministic: true, kind: "longest", sport: "run" }],
  ["most intervals", { isDeterministic: true, kind: "most_intervals" }],
  ["Chicago races", { isDeterministic: true, kind: "place_filter", place: "chicago", filterType: "race" }]
];

let allPassed = true;

for (const [query, expected] of tests) {
  const result = detectSuperlativeIntent(query);
  const pass = result.isDeterministic === expected.isDeterministic && 
                result.intent?.kind === expected.kind;
  
  if (expected.sport) {
    if (result.intent?.sport !== expected.sport) allPassed = false;
  }
  if (expected.place) {
    if (result.intent?.place !== expected.place) allPassed = false;
  }
  if (expected.filterType) {
    if (result.intent?.filterType !== expected.filterType) allPassed = false;
  }
  
  const status = pass ? "✅" : "❌";
  console.log(`${status} "${query}"`);
  console.log(`   isDeterministic: ${result.isDeterministic}, kind: ${result.intent?.kind || "null"}`);
  if (result.intent && "sport" in result.intent) console.log(`   sport: ${result.intent.sport}`);
  if (result.intent && "place" in result.intent) console.log(`   place: ${result.intent.place}, filterType: ${result.intent.filterType}`);
  console.log();
  
  allPassed = allPassed && pass;
}

if (allPassed) {
  console.log("✅ All three required examples pass deterministic intent detection");
  process.exit(0);
} else {
  console.log("❌ Some tests failed");
  process.exit(1);
}
