# Running tracker

An interactive web app that visualizes lifetime and per-year running mileage and
reframes the distance as journeys ("the length of Britain", "halfway around the
Earth"). Built with Vite + React + TypeScript, with a scroll-driven cumulative
line and cursor-reactive polish.

## About the data

The running log and training pages show **aggregate totals only** — yearly and
lifetime mileage, run counts, monthly cumulative distance, and the date of the
first logged run.

`/activity-lookup` is the exception: it lists individual **public** Strava
activities (name, date, sport, distance, moving time, elevation gain, workout
type). Private activities are dropped at export. There is no location, GPS,
route, heart-rate, or other health data anywhere on the site.

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
  activities.json         public activity list for /activity-lookup (built from
                          spencer-brain at deploy time; gitignored)
  components/             Hero, YearChart, CumulativeJourney, Comparisons, Footer,
                          Training + TvChart (the /training page)
  hooks/usePointer.ts     spring-smoothed cursor tracking
  lib/                    data types, formatting, comparisons, tiny history router,
                          activitySearch (keyword + fuzzy index)
netlify/functions/
  jev-rerank.mts          Jev reranking for /activity-lookup (holds the API key)
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

- `/activity-lookup` — search every public activity. Two stages:
  1. **Keyword + fuzzy**, in the browser on every keystroke: activity names plus
     derived tags (sport, month, weekday, year, race / long / workout, hilly /
     flat, indoor, 5k / 10k / half / marathon, morning / afternoon / evening),
     typo-tolerant (edit distance 1–2 by word length; numbers exact only).
  2. **Jev rerank**, 300 ms after typing stops: the top 25 candidates go to
     `/.netlify/functions/jev-rerank`, which asks Jev one yes/no question
     (a `noul`) per activity and returns its probability; the list re-sorts by
     it. Without a key the function returns 503 and the page quietly stays on
     keyword + fuzzy.

`src/activities.json` is gitignored and built before every deploy from the
Strava activities file grokbot keeps in the private `Splee9/spencer-brain` repo.
The fetch keeps public activities only and maps them with the same rules as the
direct Strava export (`scripts/strava-activity.mjs`):

```bash
BRAIN_GITHUB_TOKEN=... BRAIN_ACTIVITIES_PATH=... node scripts/fetch-activities.mjs
```

Without `BRAIN_GITHUB_TOKEN` it keeps an existing local file. To build that file
straight from Strava instead (incremental by default; `--full` re-downloads
everything and waits out 429s):

```bash
STRAVA_ACCESS_TOKEN=... node scripts/export-activities.mjs [--full]
```

Routing is a ~50-line `history.pushState` wrapper (`src/lib/router.tsx`), not a
library. `netlify.toml` rewrites every path to `index.html` so deep links load.

## Deploy

Netlify builds from source on every push (see `netlify.toml`):
`node scripts/fetch-activities.mjs && npm run build`, publishing `dist/`. No
manual upload step. A daily build hook picks up grokbot's activity updates.

Environment variables (Netlify → Site configuration → Environment variables):

| Variable             | Purpose                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `BRAIN_GITHUB_TOKEN` | Fine-grained GitHub token, Contents: read on `Splee9/spencer-brain`. |
| `BRAIN_ACTIVITIES_PATH` | Path of the Strava activities file inside spencer-brain.         |
| `OPENROUTER_API_KEY` | Jev via OpenRouter's Decisions API (`typesafe/jev-1.13`).            |
| `TYPESAFE_API_KEY`   | Alternative: Jev direct from TypeSafe. Used only if no OpenRouter key. |
| `JEV_MODEL`          | Optional model override.                                             |

## Notes

- Counts `Run`, `TrailRun`, and `VirtualRun` activities with positive distance.
- The current calendar year is flagged partial — it shows a "· YTD" label and an
  on-pace projection, and rolls over automatically each year.
- All motion respects `prefers-reduced-motion`: animations are replaced by their
  finished state, and content is fully readable without scrolling.
