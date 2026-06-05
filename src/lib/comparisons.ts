// Reframes raw mileage into something visceral — the product's core idea.
// Ported from the original static page. Bold spans are marked with **…** and
// rendered by the <Rich> component, so this stays plain data + pure functions.

export interface Journey {
  from: string;
  to: string;
  short: string;
  miles: number; // one-way
}

export const JOURNEYS: Journey[] = [
  // Chicago is the home hub — most city-pair analogies radiate out from it.
  { from: "Chicago", to: "New York", short: "Chicago to New York", miles: 790 },
  { from: "Chicago", to: "Denver", short: "Chicago to Denver", miles: 1000 },
  { from: "Chicago", to: "Miami", short: "Chicago to Miami", miles: 1380 },
  { from: "Chicago", to: "Los Angeles", short: "Chicago to Los Angeles", miles: 2015 },
  { from: "Chicago", to: "San Francisco", short: "Chicago to San Francisco", miles: 2130 },
  { from: "San Francisco", to: "Seattle", short: "San Francisco to Seattle", miles: 808 },
  { from: "Land's End", to: "John o' Groats (end to end of Britain)", short: "the length of Britain", miles: 874 },
  { from: "London", to: "Rome", short: "London to Rome", miles: 890 },
  { from: "Paris", to: "Berlin", short: "Paris to Berlin", miles: 545 },
  { from: "Tokyo", to: "the tip of Japan", short: "the length of Japan", miles: 1860 },
  { from: "the start", to: "the end of the Appalachian Trail", short: "the Appalachian Trail", miles: 2190 },
  { from: "the start", to: "the end of the Pacific Crest Trail", short: "the Pacific Crest Trail", miles: 2650 },
];

export const GLOBE = [
  { name: "Earth's circumference", miles: 24901 },
  { name: "the Moon's circumference", miles: 6786 },
];

const stripParen = (s: string) => s.replace(/\s*\(.*\)/, "");

/** A headline sentence ("That's running London to Rome — and most of the way back."). */
export function headlineFor(miles: number): string {
  const half = miles / 2;

  // Best round-trip match (there and most of the way back).
  let best: { j: Journey; err: number } | null = null;
  for (const j of JOURNEYS) {
    const ratio = half / j.miles;
    if (ratio >= 0.85 && ratio <= 1.18) {
      const err = Math.abs(1 - ratio);
      if (!best || err < best.err) best = { j, err };
    }
  }
  if (best) {
    return `That's running **${best.j.from} to ${stripParen(best.j.to)}** — and most of the way back.`;
  }

  // Otherwise, a whole-number multiple of a single journey.
  let pick: { j: Journey; mult: number; err: number } | null = null;
  for (const j of JOURNEYS) {
    const mult = miles / j.miles;
    if (mult >= 0.9 && mult <= 4.5) {
      const err = Math.abs(mult - Math.round(mult));
      if (!pick || err < pick.err) pick = { j, mult, err };
    }
  }
  if (pick) {
    const m = pick.mult;
    if (m >= 0.9 && m <= 1.15) return `That's running **${pick.j.short}** — the whole way.`;
    return `That's running **${pick.j.short}** **${m.toFixed(1)}×** over.`;
  }

  // Fallback: fraction of the way around the planet.
  const pct = (miles / GLOBE[0].miles) * 100;
  return `That's **${pct.toFixed(0)}%** of the way around the planet.`;
}

export interface Card {
  big: string;
  desc: string;
}

/** Three stat cards: marathons, a round-trip journey, and a slice of the globe. */
export function cardsFor(miles: number): Card[] {
  const marathons = miles / 26.2;
  const earthPct = (miles / GLOBE[0].miles) * 100;

  let trip = JOURNEYS[0];
  let bestErr = Infinity;
  for (const j of JOURNEYS) {
    const back = miles / (j.miles * 2);
    if (back >= 0.5 && back <= 6) {
      const err = Math.abs(back - Math.round(back));
      if (err < bestErr) {
        bestErr = err;
        trip = j;
      }
    }
  }
  const roundTrips = miles / (trip.miles * 2);

  return [
    { big: fmtInt(marathons), desc: "marathons, back to back" },
    {
      big: roundTrips >= 1 ? roundTrips.toFixed(1) + "×" : (miles / trip.miles).toFixed(1) + "×",
      desc: roundTrips >= 1 ? `${trip.from} to ${stripParen(trip.to)} and back` : `the length of ${trip.short}`,
    },
    {
      big: earthPct >= 100 ? (miles / GLOBE[0].miles).toFixed(2) + "×" : earthPct.toFixed(0) + "%",
      desc: earthPct >= 100 ? "around the Earth" : "of the way around the Earth",
    },
  ];
}

const fmtInt = (n: number) => Math.round(n).toLocaleString();
