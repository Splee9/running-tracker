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
- `/miles` — the running log (same as `/`).
- `/training` — training variability: how much weekly hours swing around their
  mean over rolling 8 / 12 / 52-week windows, for Run, Bike, or All. Lower is
  steadier (Steady < 35, Moderate 35–55, Uneven 55–80, Erratic ≥ 80). One
  window is shown at a time; a switch overlays weekly hours as bars on a second
  axis.
- `/training/chicago` — Chicago Marathon 2026 training tracker: 23-week phase
  plan, weekly load by workout type, aerobic efficiency trend, and head-to-head
  comparison against prior marathon builds. Aggregate weekly figures only — no
  pace, GPS, heart rate, or health data.
- `/activity-lookup` — label filters, fan-out, then Jev. Full behavior below.

`src/training-weekly-hours.json` is derived from `src/training-variability.json`
(the export carries only rolling stats). Regenerate it whenever the TV file
changes:

```bash
pip install numpy scipy
python3 scripts/derive_weekly_hours.py
```

- `/activity-lookup` — search every public activity. Three stages:
  1. **Label hard filters**, in the browser: modality, date, distance, place,
     weekday, and stimulus words (`easy`, `intervals`, `quality`, `long`,
     `race`, `recovery`, `probe`, `hills`, plus modifiers such as `tempo`).
     These read `primary_stimulus`, `modifiers`, and `stimulus_cluster` when
     that field is present. `interval` is a workout filter, never a place.
     `low_confidence` ranks lower and is not dropped on its own. Fuzzy
     name/place stays soft.
  2. **Fan-out** for the rest of the query: metric, then place-longest,
     date-list, place-list, then keyword/fuzzy. First claim wins. A query that
     does not name a stimulus keeps the previous metric, place, and date behavior.
  3. **Jev**, 300 ms after typing stops: one request asks parallel intent
     questions (easy, intervals, quality, place, year, fastest, longest) and a
     membership noul per shortlisted activity. A high-confidence answer fills
     a gap in an incomplete parse (`fartlek` can land as intervals; no new
     stimulus labels). A parse the code already settled is not replaced.
     Unlocked branches — keyword, fuzzy, "best", and a synonym fill that still
     has leftover words — then sort by that membership noul, highest first
     ([re-ranking cookbook](https://docs.typesafe.ai/cookbooks/rerank_typesafe)).
     A noul under 0.3 is demoted behind stronger yeses and kept. Stimulus-fit
     and place-fit nouls share the same call and only break ties. Locked
     branches (pace, distance, time, heart rate, power, and a code-settled
     date or place list) stay in code order. Race-name keywords such as
     "Chicago Marathon" boost a race-labeled name match before that re-rank.
     Without a key the function returns 503 and the page stays on the local
     shortlist.

`src/activities.json` is gitignored and built before every deploy from
`data/public/strava-activities.json`, the public Strava activities export grokbot
keeps in the private `Splee9/spencer-brain` repo. (It has to be a tracked file:
the vault's `raw/metrics.db` and `raw/exports/` are gitignored.) The fetch keeps
public activities only and maps them with the same rules as the direct Strava
export (`scripts/strava-activity.mjs`):

```bash
BRAIN_GITHUB_TOKEN=... node scripts/fetch-activities.mjs   # BRAIN_ACTIVITIES_PATH overrides the path
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
| `BRAIN_ACTIVITIES_PATH` | Optional; defaults to `data/public/strava-activities.json`.      |
| `OPENROUTER_API_KEY` | Jev via OpenRouter's Decisions API (`typesafe/jev-1.13-20260917`).   |
| `TYPESAFE_API_KEY`   | Alternative: Jev direct from TypeSafe (`jev-1.13.0`). Used only if no OpenRouter key. |
| `JEV_MODEL`          | Optional model override.                                             |

## Notes

- Counts `Run`, `TrailRun`, and `VirtualRun` activities with positive distance.
- The current calendar year is flagged partial — it shows a "· YTD" label and an
  on-pace projection, and rolls over automatically each year.
- All motion respects `prefers-reduced-motion`: animations are replaced by their
  finished state, and content is fully readable without scrolling.
