# Running tracker

An interactive web app that visualizes lifetime and per-year running mileage and
reframes the distance as journeys ("the length of Britain", "halfway around the
Earth"). Built with Vite + React + TypeScript, with a scroll-driven cumulative
line and cursor-reactive polish.

Agent locks for Activity Lookup / Fit: [AGENTS.md](AGENTS.md) §Fit.

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
npm run fetch:chicago     # refresh src/chicago-data.json from spencer-brain
npm run dev               # local dev server with hot reload
npm run build             # type-check, production bundle to dist/, and the Jev function
npm run preview           # serve the production build locally
npm run test:intent       # Activity Lookup search/intent tests
npm run og:images         # re-render the link-preview cards in public/og/
```

`fetch:activities` downloads the real activity list when `BRAIN_GITHUB_TOKEN` is
set. Without it, it keeps an existing `src/activities.json` or writes an empty
placeholder, so a fresh clone builds (the Lookup page is just empty). On Vercel
a missing token with no file fails the build instead.

CI (`.github/workflows/ci.yml`) runs the intent tests and the production build
on every pull request and on pushes to `main`, using the empty placeholder.

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
  activities.json         public activity list for /activity-lookup (built from
                          spencer-brain at deploy time; gitignored)
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
                          chicago-data / chicago-format (Chicago page), pages
                          (per-route title and link-preview text)
  styles/global.css       design tokens + base styles
public/og/                link-preview cards, 1200×630 (committed; npm run og:images)
src/server/jev-rerank.ts  Jev reranking for /activity-lookup (holds the API key).
                          The build bundles it to server-dist/ (gitignored);
                          api/jev-rerank.js is the committed Vercel entry that
                          re-exports it.
scripts/                  data export, grading, and eval scripts (see below)
```

## Routes

- `/` — projects home page linking to the pages below.
- `/miles` — the running log: lifetime and per-year mileage reframed as journeys.
  The selected year links to `/activity-lookup?q={year}`.
- `/training` — training variability: how much weekly hours swing around their
  mean over rolling 8 / 12 / 52-week windows, for Run, Bike, or All. Lower is
  steadier (Steady < 35, Moderate 35–55, Uneven 55–80, Erratic ≥ 80). One
  window is shown at a time; a switch overlays weekly hours as bars on a second
  axis. The week card links to that Monday–Sunday in Lookup (`?from=&to=`) and
  to that year on the log.
- `/training/chicago` — Chicago Marathon 2026 training tracker: 23-week phase
  plan, weekly load by workout type, aerobic efficiency trend, and head-to-head
  comparison against prior marathon builds. Aggregate weekly figures only — no
  pace, GPS, heart rate, or health data. The selected week links to its public
  run sessions (`?from=&to=&sport=run`) and to `/training?week=`.
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
  removed parts live in the URL (`?q=&sport=&u=&sort=&drop=`). `?from=` and
  `?to=` are an inclusive local-date window (a missing `to` runs through the
  Sunday of `from`'s Monday–Sunday week). They show up as the dates chip and
  intersect a date already parsed from `q`, instead of being written into `q`.
  `?debug=1` shows match kind, branch, and Jev score on each row. `?activity=`
  opens one session's stimulus decision, including when that session sits
  outside the date window.

### Stimulus decision (Layer A)

Open a row to see the stimulus classification already stored on that public
activity: `primary_stimulus`, `modifiers`, `stimulus_cluster`, and classification
confidence. That number is how sure the classifier is of the label in the closed
vocab. It is not a judgment of whether the session was the right work that day.
The expand row leads with that score, then the label and a short why on one
line. It does not relabel the session. When the number is missing it says
Unavailable.

Review the label when `low_confidence` is set, or when `primary_confidence` is
below 0.55. A later career review can use a stricter bar. This panel uses 0.55.

The live export includes the stimulus label, cluster, modifiers, and
`low_confidence`. A numeric `primary_confidence` is often missing. The mapper
keeps it when the vault sends it (`confidence` and `stimulus_confidence` are
older aliases), and keeps an optional `probabilities` map. Until the number is
in the export, the score says "Unavailable" and still shows the cluster, the
modifiers, and an amber Review mark when `low_confidence` is set. `runner_up` /
`secondary_stimulus` are shown only when present.

### Stimulus fit (Layer B)

Under that classification line, when the export includes them, the same expand
row shows whether the delivered stimulus fit readiness and the plan. It is one
sentence: the body was set for a push, a normal day, an easy day, or rest; the
workout delivered a bigger-than-usual easy volume day, a typical easy or quality
day, or harder intensity than usual; so it was on target, more than readiness
wanted, or lighter than it could have been. Those three phrases are underlined.
Hover or keyboard focus shows a short rationale and that piece's confidence
(`macro_readiness_confidence`, the load and variability confidences, and
`fit_confidence`). The fit score beside the sentence is `fit_confidence`. It is
not `primary_confidence`, and the page does not invent a fit from the label.
The stimulus label on the classification line uses the same underline: its
tooltip is the competing probabilities, the short why, and classification
confidence. Stored field names stay on the activity; they are not the sentence.

Older activities with none of these fields keep the classification line only.
If a label arrived without `fit_confidence`, the fit score says Unavailable and
the comparison still shows the labels that were published. There is no 0.55
review mark on this score.

The mapper copies `stimulus_fit` (or `fit`), `fit_confidence`, `macro_readiness`,
`macro_readiness_gate`, `activity_side_load`, and `session_variability_impact`
when the vault sends them, including the same keys nested on `layer_b` or on a
judgment object. CamelCase aliases are accepted. Values outside 0–1 are left
off `fit_confidence` rather than rescaled.

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

`src/chicago-data.json` stays committed, but every deploy overwrites it with
`data/public/chicago-tracker.json` from `Splee9/spencer-brain`, which the box
republishes each morning before it calls the deploy hook:

```bash
BRAIN_GITHUB_TOKEN=... node scripts/fetch-chicago.mjs   # BRAIN_CHICAGO_PATH overrides the path
```

Without `BRAIN_GITHUB_TOKEN` it keeps the committed file. With a token, a missing
or malformed snapshot fails the build, so the last good deploy stays live.

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
request (see `vercel.json`): `node scripts/fetch-activities.mjs && node scripts/fetch-chicago.mjs && npm run build`,
publishing `dist/`. No manual upload step. A deploy hook picks up grokbot's
activity and Chicago updates. `npm run dev` does not run the Jev function; lookup stays on
the local shortlist (the request 404s). `npx vercel dev` serves `/api/jev-rerank`
locally.

The Hobby plan is for personal, non-commercial use. This project fits it.

Environment variables (Vercel → Project → Settings → Environment Variables).
Enable each one for Production and Preview. `BRAIN_GITHUB_TOKEN` has to be
available at build time, and the Jev key at runtime. The default exposure
(build and runtime) is what you want.

| Variable             | Purpose                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `BRAIN_GITHUB_TOKEN` | Fine-grained GitHub token, Contents: read on `Splee9/spencer-brain`. |
| `BRAIN_ACTIVITIES_PATH` | Optional; defaults to `data/public/strava-activities.json`.      |
| `BRAIN_CHICAGO_PATH` | Optional; defaults to `data/public/chicago-tracker.json`.            |
| `OPENROUTER_API_KEY` | Jev via OpenRouter's Decisions API (`typesafe/jev-1.13-20260917`).   |
| `TYPESAFE_API_KEY`   | Alternative: Jev direct from TypeSafe (`jev-1.13.0`). Used only if no OpenRouter key. |
| `JEV_MODEL`          | Optional model override.                                             |
| `URL`                | Optional canonical origin for link-preview tags (`https://…`). Falls back to the Vercel production domain. |

Setting up the project from scratch:

1. Import this repo. Framework preset Vite. The build command and output directory come from `vercel.json`.
2. Set the variables above, then deploy.
3. Settings → Git → Deploy Hooks: create a hook and point grokbot's daily ping at it.
4. Add the custom domain. Set `URL` to that origin if it should win over the `vercel.app` hostname, and redeploy so the cards pick it up.

## Notes

- Counts `Run`, `TrailRun`, and `VirtualRun` activities with positive distance.
- The current calendar year is flagged partial — it shows a "· YTD" label and an
  on-pace projection, and rolls over automatically each year.
- All motion respects `prefers-reduced-motion`: animations are replaced by their
  finished state, and content is fully readable without scrolling.
