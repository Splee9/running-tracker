/**
 * Per-route title and link-preview text. App.tsx sets document.title from it, and
 * scripts/page-meta.mjs writes a static HTML file per route after `vite build` so link
 * previews (which don't run JS) get the right title, description, and image.
 */

export type PageMeta = {
  title: string;
  description: string;
  /** Preview card, 1200×630 in public/og/ (scripts/render-og.mjs). */
  image: string;
  /** Card text: small label and headline. */
  eyebrow: string;
  headline: string;
};

const home: PageMeta = {
  title: "Spencer Lee — Value Engineering, Applied AI",
  description:
    "Personal ops on a training log: typed Jev decisions for activity lookup, and a Chicago race-week dashboard. Code owns the policy. Calendar and spend stay human.",
  image: "/og/home.png",
  eyebrow: "Value engineering · Applied AI",
  headline: "A typed judgment layer.",
};

const chicago: PageMeta = {
  title: "Chicago Marathon 2026 — Training tracker",
  description:
    "Race-week tape for the 2026 Chicago Marathon build: days out, block miles, this week's load, and training variability against earlier builds.",
  image: "/og/chicago.png",
  eyebrow: "The road to Chicago",
  headline: "26.2 miles, one build at a time.",
};

const lookup: PageMeta = {
  title: "Activity lookup — Miles",
  description:
    "Semantic search over the public training log. Code shortlists; Jev scores membership. Share any ask with /lookup?q=…",
  image: "/og/lookup.png",
  eyebrow: "Activity lookup",
  headline: "Find any session.",
};

export const PAGES: Record<string, PageMeta> = {
  "/": home,
  // Same framing as home. Static HTML so a shared /portfolio link previews cleanly.
  "/portfolio": home,
  "/miles": {
    title: "Miles — a running log",
    description: "Every mile since 2018 — a running log that reframes distance as journeys.",
    image: "/og/miles.png",
    eyebrow: "A running log",
    headline: "Every mile, since 2018.",
  },
  "/training": {
    title: "Training variability — Miles",
    description:
      "How much weekly training hours swing around their average over rolling 8, 12, and 52-week windows. Lower is steadier.",
    image: "/og/training.png",
    eyebrow: "Training variability",
    headline: "How steady is the work?",
  },
  "/training/chicago": chicago,
  // Share URL. Same card as /training/chicago.
  "/chicago": chicago,
  "/activity-lookup": lookup,
  // Share URL. Query string (?q=) stays on this page; previews use the page card.
  "/lookup": lookup,
};

export const NOT_FOUND_TITLE = "Not found — Spencer Lee";
