# Running tracker

An interactive web app that visualizes lifetime and per-year running mileage and
reframes the distance as journeys ("the length of Britain", "halfway around the
Earth"). Built with Vite + React + TypeScript, with a scroll-driven cumulative
line and cursor-reactive polish.

## About the data

The app shows **aggregate running totals only** — yearly and lifetime mileage,
run counts, monthly cumulative distance, and the date of the first logged run.
There is no location, GPS, route, pace, heart-rate, or health data of any kind.
Nothing on the page identifies an individual.

All numbers live in `src/data.json`, which is regenerated from a private training
pipeline (the source data never ships here — only the aggregate JSON does).

## Develop

```bash
npm install
npm run dev      # local dev server with hot reload
npm run build    # type-check + production bundle to dist/
npm run preview  # serve the production build locally
```

## Project layout

```
src/
  App.tsx                 routes (/ and /training) + home section composition
  data.json               aggregate stats (generated; do not hand-edit)
  training-variability.json  weekly training-variability series (generated)
  components/             Hero, YearChart, CumulativeJourney, Comparisons, Footer,
                          Training + TvChart (the /training page)
  hooks/usePointer.ts     spring-smoothed cursor tracking
  lib/                    data types, formatting, comparisons, tiny history router
  styles/global.css       design tokens + base styles
```

## Routes

- `/` — the running log.
- `/training` — training variability: how much weekly hours swing around their
  mean over rolling 8 / 12 / 52-week windows, for Run, Bike, or All. Lower is
  steadier (Steady < 35, Moderate 35–55, Uneven 55–80, Erratic ≥ 80). One
  window is shown at a time; a switch overlays weekly hours as bars on a second
  axis.

`src/training-weekly-hours.json` is derived from `src/training-variability.json`
(the export carries only rolling stats). Regenerate it whenever the TV file
changes:

```bash
pip install numpy scipy
python3 scripts/derive_weekly_hours.py
```

Routing is a ~50-line `history.pushState` wrapper (`src/lib/router.tsx`), not a
library. `netlify.toml` rewrites every path to `index.html` so deep links load.

## Deploy

Netlify builds from source on every push (see `netlify.toml`): `npm run build`,
publishing `dist/`. No manual upload step.

## Notes

- Counts `Run`, `TrailRun`, and `VirtualRun` activities with positive distance.
- The current calendar year is flagged partial — it shows a "· YTD" label and an
  on-pace projection, and rolls over automatically each year.
- All motion respects `prefers-reduced-motion`: animations are replaced by their
  finished state, and content is fully readable without scrolling.
