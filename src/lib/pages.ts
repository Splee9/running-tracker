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

export const PAGES: Record<string, PageMeta> = {
  "/": {
    title: "Spencer Lee — Projects",
    description:
      "Tools for tracking training and visualizing progress — a running log, training variability, and a Chicago Marathon build.",
    image: "/og/home.png",
    eyebrow: "Personal projects",
    headline: "Spencer Lee",
  },
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
  "/training/chicago": {
    title: "Chicago Marathon 2026 — Training tracker",
    description:
      "A 23-week build for the 2026 Chicago Marathon: phases, weekly load by workout type, and comparisons with past marathon builds.",
    image: "/og/chicago.png",
    eyebrow: "The road to Chicago",
    headline: "26.2 miles, one build at a time.",
  },
  "/activity-lookup": {
    title: "Activity lookup — Miles",
    description:
      "Search every public activity the way you'd describe it: a distance, a place, a date, or a kind of workout.",
    image: "/og/lookup.png",
    eyebrow: "Activity lookup",
    headline: "Find any session.",
  },
};

export const NOT_FOUND_TITLE = "Not found — Spencer Lee";
