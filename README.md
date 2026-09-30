# Running tracker

An interactive web app that visualizes lifetime and per-year running mileage and
reframes the distance as journeys ("the length of Britain", "halfway around the
Earth"). Built with Vite + React + TypeScript, with a scroll-driven cumulative
line and cursor-reactive polish.

## About the data

The running log, training, and Chicago pages show **aggregate figures only** —
yearly and lifetime mileage, run counts, monthly cumulative distance, weekly
hours and load, and the date of the first logged run.

`/activity-lookup` is the exception: it lists individual **public** Strava
activities (name, date, sport, distance, moving time, elevation gain, workout
type, stimulus labels, and — when Strava has them — average/max heart rate,
speed, and a city-level place name). Private activities are dropped at export.
There is no GPS, route, or map data anywhere on the site.

The aggregate numbers live in `src/data.json`, `src/chicago-data.json`, and the
`src/training-*.json` files, all regenerated from a private training pipeline
(the source data never ships here — only the derived JSON does).

## Develop

```bash
npm install
npm run fetch:activities  # build src/activities.json (see below)
npm run dev               # local dev server with hot reload, plus the /api/* handlers
npm run build             # type-check, production bundle to dist/, and the API functions
npm run preview           # serve the production build locally
npm run smoke:api         # call the bundled /api/activities and /api/pulse (after build)
npm run test:intent       # Activity Lookup search/intent tests
npm run og:images         # re-render the link-preview cards in public/og/
```

`fetch:activities` downloads the real activity list when `BRAIN_GITHUB_TOKEN` is
set. Without it, it keeps an existing `src/activities.json` or writes an empty
placeholder, so a fresh clone builds (the Lookup page is just empty). On Vercel
a missing token with no file fails the build instead.

CI (`.github/workflows/ci.yml`) runs the intent tests, the production build, and
the API smoke test on every pull request and on pushes to `main`, using the
empty placeholder.

## Live data

The activity list is read at request time rather than baked into the page:

- `GET /api/activities`: every public activity, graded and newest first. The
  Activity Lookup page loads it on open.
- `GET /api/pulse`: the newest 60 activities. It powers the "Latest run" card on
  Home and the "mi this week" stat on `/training/chicago`. The week is summed in
  the browser from Monday.

Both read `data/public/strava-activities.json` from `spencer-brain` with
`BRAIN_GITHUB_TOKEN`, apply the same public-only mapping as the build
(`scripts/brain-activities.mjs`), and keep a copy for 5 minutes per function
instance. Responses carry `s-maxage=300, stale-while-revalidate=86400`, so
Vercel's CDN answers most requests and grokbot's updates appear within about 5
minutes, with no redeploy. If the token is missing or GitHub fails, they serve
the snapshot bundled at build time; `source` in the response says which. Jev
scores against the same list, so new activities can be reranked too.

The Chicago countdown, current week, and phase follow today's date, not the
export date. The rest of the Chicago page and the `/miles` and `/training`
aggregates are still committed JSON.

`.github/workflows/refresh.yml` pings a Vercel deploy hook daily (and on manual
dispatch) as a safety net. It refreshes the bundled fallback and the static
pages even if grokbot's ping doesn't arrive. It needs the
`VERCEL_DEPLOY_HOOK_URL` repository secret; without it the job skips.

## Project layout

```
src/
  App.tsx                 route switch + per-page titles
  data.json               aggregate stats (generated; do not hand-edit)
  chicago-data.json       Chicago 2026 build: phases, weekly load, prior builds
                          (generated)
  training-variability.json  weekly training-variability series (generated)
  training-weekly-hours.json weekly hours derived from the TV series
                          (scripts/derive_weekly_hours.py)
  activities.json         public activity snapshot, bundled into the API functions
                          as their fallback (built from spencer-brain at deploy
                          time; gitignored)
  activity-grades.json    offline Jev "standout" Score per activity (committed;
                          scripts/grade-activities.mjs)
  components/             Nav, Home (/), Miles + Hero, YearChart, CumulativeJourney,
                          Comparisons, MarathonTimes (/miles), Training + TvChart
                          (/training), ActivityLookup (/activity-lookup), NotFound
  components/Chicago/     ChicagoTracker and its sections (/training/chicago)
  hooks/usePointer.ts     spring-smoothed cursor tracking
  lib/                    data types, formatting, comparisons, tiny history router,
                          activitySearch (keyword + fuzzy index), lookupView
                          (status and "Read as" text), jevProvider (API routing),
                          useApi (cached JSON fetch hook), pulse (live-data types,
                          latest run, week-so-far),
                          chicago-data / chicago-format (Chicago page), pages
                          (per-route title and link-preview text)
  styles/global.css       design tokens + base styles
public/og/                link-preview cards, 1200×630 (committed; npm run og:images)
src/server/               API handlers, one file per route: activities.ts,
                          pulse.ts, and jev-rerank.ts (Jev reranking; holds the
                          API key). activity-source.ts reads the live list with
                          the bundled snapshot as fallback. The build bundles each
                          handler to server-dist/ (gitignored,
                          scripts/bundle-functions.mjs); api/<name>.js is the
                          committed Vercel entry that re-exports it.
scripts/                  data export, grading, and eval scripts (see below)
```

## Routes

- `/` — projects home page linking to the pages below.
- `/miles` — the running log: lifetime and per-year mileage reframed as journeys.
- `/training` — training variability: how much weekly hours swing around their
  mean over rolling 8 / 12 / 52-week windows, for Run, Bike, or All. Lower is
  steadier (Steady < 35, Moderate 35–55, Uneven 55–80, Erratic ≥ 80). One
  window is shown at a time; a switch overlays weekly hours as bars on a second
  axis.
- `/training/chicago` — Chicago Marathon 2026 training tracker: 23-week phase
  plan, weekly load by workout type, aerobic efficiency trend, and head-to-head
  comparison against prior marathon builds. Aggregate weekly figures only — no
  pace, GPS, heart rate, or health data.
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
  3. **Jev**, 300 ms after typing stops: one request asks a membership noul
     per shortlisted activity. When code could not fully parse the query, the
     same request asks intent questions: Choices with a no-match option for
     workout kind, fastest/longest, year, race distance, and sport, plus a
     Chicago noul. A confident answer fills a gap (`fartlek` can land as
     intervals; no new stimulus labels). A parse the code already settled asks
     no intent questions and is not replaced. Unlocked branches — keyword,
     fuzzy, "best", and a synonym fill that still has leftover words — are
     gated by the membership noul
     ([re-ranking cookbook](https://docs.typesafe.ai/cookbooks/rerank_typesafe)):
     a noul under 0.3 is ranked after stronger yeses and kept. What passes is
     ordered by a graded dimension when the query asks for a degree ("best" by
     the offline standout Score, "hilly" by climbing per km in code), else by
     the noul. Stimulus-fit and place-fit nouls are asked only for a value Jev
     filled in, and only break ties. Locked branches (pace, distance, time,
     heart rate, power, and a code-settled date or place list) stay in code
     order. Race-name keywords such as "Chicago Marathon" boost a race-labeled
     name match before that re-rank. Without a key the function returns 503
     and the page stays on the local shortlist.

  The page shows what the query was read as; each part can be removed, and the
  removal reaches Jev's question too. An order menu (newest, longest, fastest
  pace, most climbing) overrides the ranking. Query, sport, units, order, and
  removed parts live in the URL (`?q=&sport=&u=&sort=&drop=`). `?debug=1` shows
  match kind, branch, and Jev score on each row.

`src/training-weekly-hours.json` is derived from `src/training-variability.json`
(the export carries only rolling stats). Regenerate it whenever the TV file
changes:

```bash
pip install numpy scipy
python3 scripts/derive_weekly_hours.py
```

Offline Jev work (same `TYPESAFE_API_KEY` / `OPENROUTER_API_KEY` as the function):

```bash
npm run grade -- [--dry-run] [--limit N]      # standout Score for ungraded activities → src/activity-grades.json
npm run eval:jev -- [--dry-run] [--labels f]  # rank labeled queries at each membership floor
```

Grading sends one activity per request and only for activities without a grade;
a different model regrades everything. For the eval, copy
`eval/jev-labels.example.json` to `eval/jev-labels.json` and list, per query, the
activity ids you expect near the top. It reports top-1/5/10 and MRR for each
floor (0–0.6) and caches Jev responses in `eval/.cache/`.

`src/activities.json` is gitignored and built before every deploy from
`data/public/strava-activities.json`, the public Strava activities export grokbot
keeps in the private `Splee9/spencer-brain` repo. (It has to be a tracked file:
the vault's `raw/metrics.db` and `raw/exports/` are gitignored.) The fetch keeps
public activities only and maps them with the same rules as the direct Strava
export (`scripts/strava-activity.mjs`):

```bash
BRAIN_GITHUB_TOKEN=... node scripts/fetch-activities.mjs   # BRAIN_ACTIVITIES_PATH overrides the path
```

Without `BRAIN_GITHUB_TOKEN` it keeps an existing local file (or writes an empty
placeholder off Vercel). To build that file
straight from Strava instead (incremental by default; `--full` re-downloads
everything and waits out 429s):

```bash
STRAVA_ACCESS_TOKEN=... node scripts/export-activities.mjs [--full]
```

Routing is a ~50-line `history.pushState` wrapper (`src/lib/router.tsx`), not a
library. `vercel.json` turns on clean URLs and rewrites unknown paths to
`index.html`, so deep links load.

Link previews: crawlers don't run JS, so after `vite build`,
`scripts/page-meta.mjs` writes a static page per route (`dist/miles.html`,
`dist/training/chicago.html`, …) with that route's title, description, canonical
URL, and Open Graph / Twitter card tags. Clean URLs serve those files at
`/miles`, `/training/chicago`, and so on, ahead of the SPA fallback. The text
comes from `src/lib/pages.ts`, which also sets `document.title`. Absolute URLs
use `URL` when it is set, otherwise Vercel's production domain. To add a
route, add it to `PAGES` and run `npm run og:images` for its card.

## Deploy

Vercel builds from source on every push to `main`, and opens a preview per pull
request (see `vercel.json`): `node scripts/fetch-activities.mjs && npm run build`,
publishing `dist/`. No manual upload step. A deploy hook picks up grokbot's
activity updates. `npm run dev` serves `/api/*` from `src/server/` through a
small Vite middleware (`vite.config.ts`), so the lookup, the latest-run card,
and the week stat all work locally. Without `BRAIN_GITHUB_TOKEN` they read
`src/activities.json`; without a Jev key the lookup stays on its local
shortlist.

The Hobby plan is for personal, non-commercial use. This project fits it.

Environment variables (Vercel → Project → Settings → Environment Variables).
Enable each one for Production and Preview. `BRAIN_GITHUB_TOKEN` is used at
build time (the fallback snapshot) and at runtime (the live list), and the Jev
key at runtime. The default exposure
(build and runtime) is what you want.

| Variable             | Purpose                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `BRAIN_GITHUB_TOKEN` | Fine-grained GitHub token, Contents: read on `Splee9/spencer-brain`. |
| `BRAIN_ACTIVITIES_PATH` | Optional; defaults to `data/public/strava-activities.json`.      |
| `BRAIN_REF`          | Optional branch, tag, or sha to read from `spencer-brain`.           |
| `OPENROUTER_API_KEY` | Jev via OpenRouter's Decisions API (`typesafe/jev-1.13-20260917`).   |
| `TYPESAFE_API_KEY`   | Alternative: Jev direct from TypeSafe (`jev-1.13.0`). Used only if no OpenRouter key. |
| `JEV_MODEL`          | Optional model override.                                             |
| `URL`                | Optional canonical origin for link-preview tags (`https://…`). Falls back to the Vercel production domain. |

Setting up the project from scratch:

1. Import this repo. Framework preset Vite. The build command and output directory come from `vercel.json`.
2. Set the variables above, then deploy.
3. Settings → Git → Deploy Hooks: create a hook and point grokbot's daily ping at it. Also save it as the `VERCEL_DEPLOY_HOOK_URL` secret in this GitHub repo for the scheduled rebuild.
4. Add the custom domain. Set `URL` to that origin if it should win over the `vercel.app` hostname, and redeploy so the cards pick it up.

## Notes

- Counts `Run`, `TrailRun`, and `VirtualRun` activities with positive distance.
- The current calendar year is flagged partial — it shows a "· YTD" label and an
  on-pace projection, and rolls over automatically each year.
- All motion respects `prefers-reduced-motion`: animations are replaced by their
  finished state, and content is fully readable without scrolling.
