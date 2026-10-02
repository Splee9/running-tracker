# Tab cross-link plan

Sources stay separate files. This document does not merge them, and it does not change Fit scoring.

## Status

- **Phase 0 — done.** Shared Monday key (`src/lib/week.ts`), router search handling, Lookup `from`/`to`.
- **Phase 1 — done.** Chicago week readout, the training-variability hover card, and the selected Miles year link out to Lookup. `/training?week=` and `/miles?year=` are written and not yet read.
- **Phases 2–4 — not started.** Inbound focus, Lookup context chips, and the Miles/Training strip.

Context for later Fit UI work: see [AGENTS.md](../AGENTS.md) §Fit. Layer A is `primary_stimulus` / `primary_confidence`. Layer B is `macro_readiness` → `activity_side_load` → `stimulus_fit` + `fit_confidence`. A cross-link may quote a published fit sentence. It must not invent `fit_confidence` or copy `primary_confidence` into it.

## Recommendation

Glue the four tabs with one shared calendar week and with URLs, not with a combined export.

The public key for a week is the **Monday** of a Monday–Sunday week in America/Chicago, written `YYYY-MM-DD`. Chicago already stores that Monday as `weekStart`. Training variability stores the same week as the closing **Sunday** (`week_end`). Lookup filters an inclusive local-date window. Miles is a calendar year. A few pure functions convert among those three shapes. No new mega-JSON.

Ship it in four phases: fix URL plumbing, add outbound links from charts, teach each page to open on a week or year, then add context chips and a thin strip. Stop before any phase that would pull `activities.json` or `training-variability.json` into another page's bundle.

## Hypothesis vs the code

| Chat hypothesis | What the repo actually does |
| --- | --- |
| Shared time keys are the highest-leverage glue. | Confirmed. Every tab already has a calendar date. None of them share a link that uses it. |
| Chicago week → Lookup filtered Monday–Sunday. | Right target. `?q=` still cannot carry an ISO date: `parseDateWindow` understands "this week", "last week", a year, and a named month, and `tokenize` splits hyphens, so `?q=2026-09-21` is the year 2026. Phase 0 adds `from`/`to` for the machine window. |
| TV week → that same Lookup filter, plus the Miles year. | Confirmed as navigation. The Miles year is `week.slice(0, 4)`. The numbers will not match: `/miles` is running mileage, `/training` hours can be run, bike, or all, and private activities never appear in Lookup. |
| Lookup session → chips for Chicago phase, that week's TV band, nearby races. | Right UX, with gaps. Phase is a date-range lookup against `phases[].start/end` (Chicago only, 2026-05-04 through 2026-10-11). TV band exists only when that week's Sunday is in `training-variability.json` (history starts 2022-01-02; the in-progress week is omitted). "Nearby races" can be joined on `data.json` `raceEvents[].date`, and only marathons have names (`marathonResults`). There is no race id. |
| A thin "this week / this block" strip on Miles and Training, reusing Chicago's current phase and recent Fit verdicts. | Phase and week mileage are cheap (`chicago-data.json` is ~14 KB). **Recent Fit verdicts are not on those pages.** They live only on vault activities, which `/miles` and `/training` do not load. Putting `activities.json` on those routes fights the current lazy split. Quote Fit on the strip only from a tiny sidecar, or link to Lookup and leave the sentences there. |
| Strava activity id is the canonical hop everywhere; week and year are fallbacks. | **Too strong.** Activity id is canonical for a **session**, and only Lookup has it (`Activity.id`, URL `?activity=`). Chicago weeks, TV points, yearly miles, and race rows do not carry an activity id. Week and year are the primary keys of those tabs, not fallbacks. You can open the week that contains a session. You cannot highlight "the" bar for one Strava id, because the aggregates are sums. |
| Keep sources separate; unify navigation and hover context. | Confirmed. That is the plan below. |

## Current-state map

Routes are a pathname switch in `src/App.tsx`. `src/lib/router.tsx` pushes history and re-renders on `popstate`. There is no hash router. Vercel `cleanUrls` plus `scripts/page-meta.mjs` emit one static HTML file per pathname. Query strings survive a full load because they are not part of the file path. Link-preview cards stay the page card; deep links do not get their own title.

| Route | UI | Data file | What a point is | In the URL today |
| --- | --- | --- | --- | --- |
| `/miles` | `src/components/Miles.tsx`, `YearChart.tsx`, `CumulativeJourney.tsx`, `MarathonTimes.tsx` | `src/data.json` via `src/lib/data.ts` (~12 KB, main bundle) | Calendar year (`years[].year`), month (`monthly[].month` = `YYYY-MM`), race date, marathon date+name | Nothing. Year chip and chart selection are `useState`, default `"lifetime"`. |
| `/training` | `src/components/Training.tsx`, `TvChart.tsx` | `src/training-variability.json` (~370 KB) and `src/training-weekly-hours.json` (~7 KB), both lazy | `week_end`: Sunday that closes Mon–Sun. TV point also has `tv`, `band`, `mean_hours`. Hours array is parallel to `weeks[]`. | Nothing. Sport, horizon, date range, hours toggle, and hover are component state. Footer copy already says weeks are Monday–Sunday, Central time, in-progress week excluded. |
| `/training/chicago` | `src/components/Chicago/*` | `src/chicago-data.json` via `src/lib/chicago-data.ts` (~14 KB, lazy) | `weeks[].weekStart` Monday, plus block-local `week` (1…23) and `phase` index. `meta.currentWeek` / `currentPhaseName`. | Nothing. `WeeklyLoad` selects a bar in local state, defaulting to the last week. Phase bands highlight on hover only. |
| `/activity-lookup` | `src/components/ActivityLookup.tsx` | `src/activities.json` (gitignored, fetched at build from spencer-brain; empty placeholder in CI) plus `src/activity-grades.json` | Strava `id`. Local calendar day is `start_date_local.slice(0, 10)`. | `?q=&sport=&u=&sort=&drop=&activity=&debug=`. Read once on mount. Written back with `replaceState`. |

Nav items in `src/components/Nav.tsx` are `/miles`, `/training`, `/training/chicago`, `/activity-lookup`. Existing "crosslinks" are static sentences: Training's footer points at `/miles`, Chicago's footer points at `/miles`. They do not carry a week, a year, or an activity.

Chicago's scatter (`src/components/Chicago/TrainingVariability.tsx`) is a different object from `/training`. It is one TV number per completed marathon build (`crossBuild` / `trainingVariability` inside `chicago-data.json`). It has no weekly points. A "TV week" link always means `/training`, not that scatter.

### How each feed is refreshed

| File | Produced by | Last timestamp in the current checkout |
| --- | --- | --- |
| `src/data.json` | Private pipeline. Committed. | `lastUpdated` **2026-09-04** |
| `src/training-*.json` | Private pipeline. `training-weekly-hours.json` is derived by `scripts/derive_weekly_hours.py`. | `as_of` / `last_complete_week_end` **2026-09-27** (file header `as_of` 2026-09-28) |
| `src/chicago-data.json` | `scripts/fetch-chicago.mjs` from `data/public/chicago-tracker.json` in spencer-brain. Committed copy kept when no token. | `meta.lastUpdated` **2026-10-02**. Week 22 (`weekStart` 2026-09-28) is `partial: true`. |
| `src/activities.json` | `scripts/fetch-activities.mjs` from `data/public/strava-activities.json`. Not committed. | Build-time `exported_at`. Public Strava rows only (`scripts/strava-activity.mjs`). |

The pages are allowed to disagree by a few days. Cross-links have to tolerate a missing partner instead of assuming one clock.

### URL plumbing that already exists, and where it breaks

Lookup is the only page that round-trips state. `readParams()` runs in `useState`'s initializer. A later `useEffect` copies React state onto the query string. It never reads the query string again.

`navigate()` in `src/lib/router.tsx` compares `normalize(to)` with the **pathname**. `normalize` only strips a trailing slash, so a search string makes the two unequal and `pushState` runs. Then:

- Coming from another pathname mounts Lookup fresh, so `?q=2026` already opens that year. A Miles year can deep-link through `q` today, on a full load or a client navigation from `/miles`.
- Already on `/activity-lookup`, a new `href` updates the address bar and fires `popstate`, but Lookup does not remount and does not re-read params. The next render of the write effect puts the old query back.
- `navigate` always `scrollTo`s the top, including when only the query changed.
- Browser Back across Lookup query edits is the same hole: `replaceState` does not create those entries, and `popstate` is ignored when it does fire.
- Training, Miles, and Chicago ignore `location.search` entirely.

Hash is preserved when Lookup rewrites the URL and never read.

A year hop is the one link that works without new parser code: `/activity-lookup?q=2024`. A week hop does not.

## Identity map

Stable enough to join on:

| Key | Where it exists | Shape |
| --- | --- | --- |
| Strava activity id | Lookup `Activity.id`. Grades file is keyed by the same id. | Positive integer. URL `?activity=`. |
| Local calendar day | Lookup `start_date_local` prefix. Race `date`. Marathon `date`. Chicago `raceDate`, phase `start`/`end`. | `YYYY-MM-DD`. Compare as strings. Do not re-parse as UTC. |
| Week Monday | Chicago `weeks[].weekStart`. | `YYYY-MM-DD`, always a Monday in the current file (2026-05-04, 2026-09-21, 2026-09-28, …). |
| Week Sunday | TV `TvPoint.week_end` and `weekly.weeks[]`. | `YYYY-MM-DD`. First point 2022-01-02. Latest complete week 2026-09-27. Sunday = Monday + 6 days. |
| Calendar year | `years[].year`. Also the first four characters of any ISO date. | Number. 2018–2026 in `data.json`, 2026 flagged `partial`. |
| Calendar month | `monthly[].month`. | `YYYY-MM`. The cumulative chart is not a click target today. |
| Chicago phase | `phases[]` index, `name`, `short`, `start`, `end`. `weeks[].phase` is that index. | Index is stable only while this four-phase array stays in order. The date range is the real key. Short labels: Base, Engine, Sharpen, Taper. |
| Block-local week number | `weeks[].week`, `meta.currentWeek`. | 1-based inside this build only. Week 21 starts 2026-09-21. Week 22 starts 2026-09-28 and is partial. Not an ISO week. |
| Race occurrence | `raceEvents[]` is `{ date, distance }` for 5K / 10K / half / marathon. `marathonResults[]` adds `name`, `seconds`, `pr` on the same date. Lookup `activity.race` has `event_name` and a band code (`5k`, `10k`, `hm`, `m`) but no id. | Join races to sessions on the calendar date. Names exist for marathons only. |

Missing, and should stay missing unless a later product decision asks for them:

- No activity id on a Chicago week, a TV point, a year, or a race row. Aggregates are not session lists.
- No race id shared by `raceEvents`, `marathonResults`, and `activity.race`.
- No phase slug field. `short` is display copy (`"Base"`), not a promised id.
- No weekly series for prior builds (Flying Pig, Indy, …). Those are summary points on the Chicago scatter. They cannot deep-link to a week.
- No public Strava URL on a Lookup row. The id is enough to add one later (`https://www.strava.com/activities/{id}`) without a schema change.

Worked example, week of 21 Sep 2026:

- Chicago: `week` 21, `weekStart` `2026-09-21`, phase Sharpen, 44.8 miles.
- Training: `week_end` `2026-09-27` (also `last_complete_week_end`).
- Lookup window: `from=2026-09-21&to=2026-09-27`.
- Miles: `year=2026`.

Week of 28 Sep 2026 is in Chicago (week 22, partial, Taper, 37.0 miles) and is **absent** from TV, because TV drops the in-progress week. A chip on that week should say the variability point is not in yet, and still link to Lookup.

## Target UX

Same four routes. The feeling of one log comes from links and a line of context, not from a fifth combined page.

### Shared week vocabulary

One helper, `src/lib/week.ts` (name can change; the behavior should not):

- `weekMonday(isoDay) -> Monday`
- `weekSunday(isoDay) -> Sunday`
- `weekWindow(monday) -> { from, to }` with `to = Sunday`, inclusive
- `yearOf(isoDay) -> number`

Input is the `YYYY-MM-DD` prefix. Arithmetic is UTC date-only so a Monday does not drift across a timezone. "America/Chicago" is already baked into `start_date_local` and into how the pipelines cut weeks. The helper does not convert timestamps.

Chicago block-local week numbers stay on the Chicago chart axis. They are not the cross-tab key.

### Outbound links (every chart point and every Lookup row)

**Chicago week bar and its readout** (`WeeklyLoad`, and the phase band if we add a link there):

- Primary: "Sessions this week" → Lookup `from`/`to` for that Monday–Sunday, `sport=run`. Chicago mileage is a running build; the Lookup list should open on runs. The user can clear the sport chip.
- Secondary: "Variability this week" → `/training?week={monday}&sport=run`.
- The readout already shows miles, type split, and phase. The links sit under that text. Hover keeps selecting the bar, as it does now. The link is a click, not a hover-only target (the TV tooltip is HTML; the Chicago bars are SVG).

**TV hover card** (`TvChart` tooltip, which already shows band, hours, and "Week ending {Sunday}"):

- "Sessions" → Lookup `from`/`to`, `sport` set from the chart's current sport (`run` / `bike`; `all` omits `sport`).
- "2026 on the log" → `/miles?year=2026`.
- The card is the hover/tap surface that exists today. Adding two anchors inside it is enough. A separate hover-card component is not needed for this phase.

**Miles year** (the year chip and the bar already select a year):

- "Sessions in 2026" → `/activity-lookup?q=2026`. This parser path already means 1 Jan–31 Dec.
- When the year intersects the Chicago block (only 2026 today): "Chicago build" → `/training/chicago`.
- Lifetime has no week. Its link, if any, is the unfiltered Lookup, which is a weak hop. Skip it until someone asks.

**Lookup row**, closed state keeps today's enrichment chips (place, race name). The expand row (`StimulusDecision`) keeps the fit sentence in the lead and the muted Layer A line above it. Under that, a context row:

- Chicago phase chip when the session date falls inside `phases[].start`–`end`. Example: "Sharpen · week of Sep 21". Links to `/training/chicago?week=2026-09-21`.
- TV band chip when that Sunday exists for the session's sport (run vs ride; anything else uses `all` only if we have a point). Example: "Moderate · 12-week". Links to `/training?week={monday}&sport=run&horizon=medium`. Horizon default is medium, matching the page default. The chip states the horizon so a 52-week band is not implied.
- Miles year chip: "2026". Links to `/miles?year=2026`.
- Nearby races: other `raceEvents` in that Mon–Sun week, excluding the session's own date when `activity.race` is already shown. Marathon rows use `marathonResults.name`. A 10K with no name reads as "10K · Oct 27". This is a label, not a new route. If the week has no race, the chip is absent.
- Sessions outside 2022–2026 TV history, or outside the Chicago block, simply omit those chips.

Do not put Strava's site in the first slice. The id is already in `?activity=` for sharing inside this app.

### Strip on Miles and Training

One small component, rendered under the page title on `/miles` and `/training`. Copy comes from Chicago `meta` + the current week row:

> Taper · week 22 · 37 mi so far · Chicago Oct 11

Actions: open that week on Chicago, open that week in Lookup (`sport=run`), and on Training also jump the chart to that Monday. On Miles, the year chip moves to 2026 when the strip's year link is used; the strip does not replace the lifetime default on first paint unless `?year=` is present.

Fit sentences are not in this strip in the first version. Chicago's current week can include private runs that Lookup cannot show, so a "recent Fit" line computed from public activities can describe different sessions than the 37 miles. See open questions.

### What we deliberately do not add

- A combined timeline page.
- Hover cards that fetch another tab's JSON on hover.
- Using Chicago's block week number in a public URL.
- Reconciling mile totals across tabs. The UI should not say the Lookup list "adds up to" the bar.

## URL schema

Params are per page. A name can mean "this page's selection." Build hrefs in one module, `src/lib/links.ts`, so call sites do not hand-assemble query strings.

### `/activity-lookup`

Keep `q`, `sport`, `u`, `sort`, `drop`, `activity`, `debug` exactly as documented in the README.

Add:

| Param | Value | Behavior |
| --- | --- | --- |
| `from` | `YYYY-MM-DD` | Inclusive start. Invalid values are dropped. |
| `to` | `YYYY-MM-DD` | Inclusive end. If `from` is set and `to` is omitted, `to` is the Sunday of `from`'s week. If `to` < `from`, swap them. |

`from`/`to` are a hard window applied in the same place as `inWindow` (`start_date_local.slice(0, 10)`). They show up as the existing dates chip in "Read as", so the user can remove them (clearing the params). They are not written into `q`.

If `q` also contains a date and the windows disagree, the list is the intersection. An empty intersection uses the current empty-state sentence. Do not let `q`'s parser silently widen a machine window back to a whole year.

`?activity=` still opens that row. If the id is outside the window, still open it and say so; hiding the linked session is a bad hop.

`sport=run|ride|other` already exists. Chicago links pass `run`. TV links pass `run` or `ride` to match the chart. TV's `all` does not map onto Lookup's `other`.

### `/training`

| Param | Value | Behavior |
| --- | --- | --- |
| `week` | Monday `YYYY-MM-DD` | Highlight that week (its Sunday must be in `weekly.weeks`, or the chart says the week is not in the series). Widen the date-range preset if the week would sit outside the current viewport. |
| `sport` | `run` \| `bike` \| `all` | Existing chip. |
| `horizon` | `short` \| `medium` \| `long` | Existing tab. |
| `range` | `12wk` \| `26wk` \| `52wk` \| `2yr` \| `all` | Existing preset. Optional. |
| `hours` | `1` | Turns the hours bars on. Optional. |

Unknown values fall back to today's defaults (run, medium, 52wk, hours off).

### `/training/chicago`

| Param | Value | Behavior |
| --- | --- | --- |
| `week` | Monday `YYYY-MM-DD` matching `weekStart` | Select that bar and scroll the weekly section into view. |

A block-local number (`?week=21`) is not accepted. Phase is not a param in v1; the bar's phase color is enough. If the Monday is not in `weeks[]`, ignore it and keep the current default (last bar).

### `/miles`

| Param | Value | Behavior |
| --- | --- | --- |
| `year` | four-digit year in `years[]`, or `lifetime` | Selects that chip. Unknown values stay on lifetime. |

No `week` param. A week link lands on the year and the page can show the strip; it does not zoom the cumulative chart to a month in v1.

### Router requirements (phase 0)

These are the plumbing bugs the links depend on:

1. `navigate` / `Link` must push when the search string changes, and must not treat `?` as part of the path comparison.
2. Scroll to top only when the pathname changes.
3. A `useSearchParams()` (or equivalent) subscribed to `popstate` so a page can read an incoming query after mount.
4. Lookup's write effect must not clobber a query it did not create. External `from`/`to`/`activity` stay until the user edits them.
5. `replaceState` inside Lookup stays for keystrokes. Cross-page hops use `pushState` so Back returns to the chart.

Full page loads already work for any query the page knows how to read. Phase 0 makes client-side hops work the same way.

## Data and join approach

Joins run in the browser. Each page keeps importing only its own feed.

| Join | Where | New data? |
| --- | --- | --- |
| Monday ↔ Sunday ↔ year | `src/lib/week.ts` | No |
| Date → Chicago phase and `weekStart` | Small function over `phases` and `weeks`, imported from `src/lib/chicago-data.ts` | No. Callers that do not already load Chicago will pull in ~14 KB. That is acceptable on Lookup expand and on the Miles/Training strip. It is not acceptable to import `training-variability.json` or `activities.json` the same way. |
| Monday → TV band | On `/training`, the series is already loaded. On Lookup, **lazy** `import()` of a tiny reader the first time a row expands, or accept the 370 KB chunk only after expand. Do not add it to the Lookup main chunk. | No committed index in v1. A generated `week → band` sidecar is an optimization if the lazy chunk feels heavy. It would be derived from `training-variability.json`, not a merge with activities. |
| Date → races | `raceEvents` / `marathonResults` from `src/lib/data.ts` (~12 KB) | No |
| Session id → row | Already `?activity=` | No |
| Strip → recent Fit lines | Not in v1 | Only if Spencer wants the sentences on Miles/Training. Then `scripts/fetch-activities.mjs` writes a gitignored sidecar (last few public runs: `id`, `start_date_local`, `name`, and the Layer B fields already mapped by `toActivity`). Empty array when the vault file is absent, same rule as `activities.json`. Never fold that sidecar into `data.json` or `chicago-data.json`. |

Private activities are dropped before `activities.json` is written. Chicago and Miles are "Strava + Garmin" aggregates and include sessions Lookup will never list. A week link is "show the public sessions in this week," not "audit the bar."

CI builds Lookup from an empty placeholder. Links to Lookup must still render. The empty state is the current one.

`src/activity-grades.json` (~180 KB, standout scores) is unrelated to cross-links. Leave it on the Lookup chunk.

## Phased delivery

Each phase is shippable alone and does not require the next one.

### Phase 0 — URL plumbing (done)

Touch `src/lib/router.tsx` and Lookup's param effect only as far as the requirements above. Add `from`/`to` as a real filter with tests next to the existing intent tests (window bounds, intersection with `q`, invalid dates, Sunday default). Add `week.ts` with tests for the known Mondays in this doc, including 2026-09-28 (partial Chicago week, no TV Sunday yet) and 2026-10-11 (race day, a Sunday).

No visible links yet, except whatever is needed to verify a hand-written URL.

Exit: `/activity-lookup?from=2026-09-21&to=2026-09-27` filters on a full load and on a client `Link` from `/miles`, and Back returns to Miles. Typing in the search box still updates `q` without destroying `from`/`to` until the dates chip is removed.

### Phase 1 — Outbound links (done)

- Chicago readout → Lookup week (`sport=run`) and `/training?week=`.
- TV tooltip → Lookup week and `/miles?year=`.
- Miles selected year → `/activity-lookup?q={year}`.

`/training` and `/miles` may ignore unknown params in this phase (the URL still changes; highlighting lands in phase 2). Lookup must honor `from`/`to`.

Exit: from the current Chicago week and from a hovered TV week, a person lands on the public sessions for that Monday–Sunday.

### Phase 2 — Inbound selection (not started)

- `/training?week=&sport=&horizon=` highlights the week, switches sport/horizon, and expands the range preset if needed.
- `/miles?year=` selects the year chip.
- `/training/chicago?week=` selects the bar.

Exit: the phase 1 links open the destination already focused on the same week or year. Sharing a URL restores that focus.

### Phase 3 — Lookup context chips (not started)

Chips described above, on the expand row, under the fit sentence. Lazy-load TV for the band. Omit chips the data cannot support. Do not change fit copy in `src/lib/stimulusFit.ts` unless the chip layout forces a real Fit UI change; if it does, the PR says `Context: see AGENTS.md §Fit`.

Exit: opening a session in the Chicago block shows phase, TV band (when the Sunday exists), year, and any race in that week, each as a link except the race label.

### Phase 4 — Strip (not started)

`ContextStrip` on `/miles` and `/training` from Chicago `meta` + current `weekStart`. Links into phase 2 URLs. No Fit text.

Fit sentences stay on the Lookup expand. No sidecar in this phase.

## Risks

- **Totals will not match.** Public Lookup miles in a week can be lower than Chicago `weeks[].miles` or TV hours (private activities, Garmin-only sessions, bike vs run, commute vs "other"). The link copy has to say "sessions," not "these miles."
- **Clocks differ.** As of this checkout, Miles stops at 2026-09-04, TV at the week ending 2026-09-27, Chicago at 2026-10-02. A strip built from Chicago can mention a week Miles has not rolled into the year chart yet. Show the link anyway.
- **Partial week.** Chicago week 22 is `partial: true`. TV has no point. Lookup Mon–Sun and Mon–today return the same activities (nothing is logged on future days). Use Mon–Sun in the URL so the link stays stable as the week fills in.
- **Bundle boundaries.** `App.tsx` comments say the weekly series is ~370 KB and activities ~700 KB and both stay off the home bundle. Importing either module from Miles or from Lookup's eager path undoes that. Chicago's 14 KB and Miles' 12 KB are the only cross-imports this plan allows up front.
- **Lookup query clobber.** Shipping phase 1 links before phase 0 makes client-side hops from inside Lookup, and the Back button, wrong.
- **`q` year vs `from`/`to`.** `?q=2026` is a feature. Combining it carelessly with a week window must not expand the week to the year.
- **Sport mapping.** Chicago "run" is not identical to Lookup `isRun` (`/Run$/`). TV `filters.run.sports` lists `Run`, `TrailRun`, `VirtualRun`, which matches that regex. TV `bike` is `Ride` and `VirtualRide`. Lookup `sport=ride` uses `isRide`. Confirm those two predicates against `tv.filters` when implementing, and do not send `sport=all` to Lookup.
- **Phase index.** Linking `?phase=3` would break if the array is reordered. This plan uses dates.
- **Empty CI activities.** Filters must not throw when `activities` is `[]`.
- **Fit lock.** A chip that displays a fit score has to use the published `fit_confidence` and the sentence in `stimulusFit.ts`. Missing number → "Unavailable".

## Decisions

Accepted with the plan: ship the recommended defaults.

1. **Strip copy.** Phase 4 is Chicago phase and week mileage only. Fit sentences stay on the Lookup expand. No fit sidecar unless a later request asks for one.
2. **Chicago → Lookup sport.** `sport=run`. The sport chip can still be cleared.
3. **TV horizon on the chip.** Always medium / 12-week, and the chip says so.
4. **Nearby races.** Same Monday–Sunday only. A race with no name is still a chip (`10K · Nov 28`).
5. **Prior builds.** Leave the Chicago scatter unlinked. Those weeks are not in the client JSON.
6. **Partial week.** The URL stays Monday–Sunday. Link copy says "so far" while that Chicago week is `partial`.
7. **External Strava.** Context chips stay inside this site. The expand row already links the activity on Strava; that link is unchanged.

## Next

Phase 2: `/training?week=`, `/miles?year=`, and `/training/chicago?week=` select the week or year the phase 1 links already name.

## Non-goals

- One JSON (or one API) that embeds activities inside weeks inside years.
- Editing vault exports, Chicago publish, or the TV derivation beyond an optional Fit sidecar later.
- New routes, new OG images, or hash URLs.
- Changing stimulus labels, fit sentences, or confidence thresholds.
- Making chart totals auditable from Lookup.
- Drive-by refactors of search, Jev, or chart geometry.
