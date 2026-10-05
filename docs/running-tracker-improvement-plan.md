# Running-tracker improvement plan

Review date: October 5, 2026. Planning only: no tracked application files changed, no PR opened, no infrastructure provisioned, no settings changed, no merge or deployment. No access to `Splee9/spencer-brain` was performed. Local dependency installation, ignored placeholder generation, and builds were used for verification.

## 1. Verified findings and corrections

### Review basis

- Repository default branch is `main`, reviewed at `25294f7d56985d1326ec56a415fc35e0bf799ca3`. [Source snapshot](https://github.com/Splee9/running-tracker/tree/25294f7d56985d1326ec56a415fc35e0bf799ca3).
- Vercel production deployment `dpl_EX656Hc4F9JuPVJJR7cbnkLt7qh3` is READY and aliases `iamspencerlee.com`; its source SHA matches that branch. Production HTML references the asset names in its build logs. Production Chicago JavaScript still reads `daysToRace` in both Hero and Footer. HTTP/source/deployment checks were performed; rendered browser checks were not.
- Read root `AGENTS.md`, README data/build/deployment instructions, and relevant source/scripts. Root AGENTS.md is the only repository AGENTS.md found. Fit classification confidence and fit confidence remain separate; no scores or basis may be invented. Any future PR touching Fit UI must include `Context: see AGENTS.md §Fit`.
- Production is not reproducible from the Git SHA alone: build-time activity and Chicago files are fetched from private exports. Production build logs report 3,662 public activities and Chicago lastUpdated `2026-10-04`. This review used those existing logs, not the private repository.

### Findings

1. **Weekly hours: verified disclosure gap, not a currently verified coverage mismatch.** `derive_weekly_hours.py` fits nonzero weekly values using rolling means, sample variance, and inferred zero counts. Its assertions verify mean tolerance and zero-count consistency; TV error is printed, not bounded by an assertion. Agreement with rounded summaries does not establish uniquely recovered, observed, or exact weekly totals. The JSON includes a derivation string, but `WeeklyHours` drops provenance fields from its interface and Training/TvChart present unqualified hours.
   Both committed training files have `as_of: 2026-09-28`, last complete week ending `2026-09-27`; hours contain 248 contiguous Sundays from `2022-01-02`. All TV series cover that span except six absent bike/short points. The script assumes every absent TV point means an all-zero window. That assumption is not verified against an export contract. TvChart's `No TV · nothing logged` also overstates what absence establishes. Missing TV, zero mean/undefined coefficient of variation, and missing weekly totals need distinct states. The training files are older than the Chicago snapshot, but those are separate sources, not automatically inconsistent.
2. **AI protection: verified global quota gap.** Handler limits are 120 query characters, 25 submitted IDs, 60 requests/minute/IP per instance, and a 4-second upstream timeout; Vercel function maxDuration is 15 seconds. Keep these bounds and local fallback. Maps reset on restart and do not coordinate instances; the IP map has no eviction. IDs unknown to the public snapshot are skipped, but uncached intent facets may still trigger a paid call when IDs are empty or all invalid. Raw `request.json()` has no application byte cap; `settled`/`removed` need bounded schemas too. Logs retain raw query, scores and facets; upstream error bodies may echo input. Usage includes output tokens and cost in the type, but those fields are not logged.
3. **Homepage: verified metric/coverage wording errors.** It says weekly mileage consistency although TV measures hours, claims a health benefit not demonstrated by this metric, says every logged session rather than public activities, and names Jev in primary copy. Verify the Running log's start year against its aggregate data before changing that card; do not infer lookup coverage from lifetime aggregates.
4. **Routes: verified blank loading state and missing route recovery.** Three lazy routes use `fallback={null}`; no boundary surrounds them. Production lookup is about 2.27 MB minified (267 KB gzip), versus 189 KB with an empty local activity export. This makes the no-token build insufficient for realistic loading validation. Preserve lazy splitting and the persistent navigation.
5. **Countdown: verified snapshot dependence in two surfaces.** Hero and Footer read exported `daysToRace`. Committed raceDate is October 11, 2026; snapshot October 4 says 7 days. On October 5 in Chicago the calendar difference is 6. Footer already shows lastUpdated, but there is no documented stale threshold; countdown updates would not refresh training statistics.
6. **Ranges: verified N+1 behavior and paired widening logic.** On current data 12/26/52/104 presets return 13/27/53/105 hours slots. The function's comment promises latest N weeks. `focus.ts:widenDateRange` uses the same inclusive N-week cutoff, so both must change together.
7. **Node discrepancy: configuration drift, not an effective Node 24 production build.** package.json and CI specify 22; server bundling targets node22. Project setting is 24.x. Production logs explicitly state package engines override that setting and 22.x is used, including during function preparation. Vercel's Node documentation confirms the precedence for build/runtime. No direct `process.version` measurement of the deployed function was available; an exact runtime patch version remains unverified. Recommend setting the displayed project version to 22, separately authorized later, rather than introducing a Node upgrade here.
8. **Additional prerequisite: baseline test is red.** One assertion in test-intent.mjs hardcodes the old Chicago partial week (`37 mi so far`) but current data is complete (`56.7 mi`). This should use a fixed fixture so ordinary snapshot refreshes cannot break CI.

## 2. Prioritized small PR sequence

All PRs preserve typography, palette and layout conventions, shareable routes, query parameters and hashes, public-only activity exports, server-only credentials, deterministic metric/date ordering, and local search fallback. No GPS or private health fields are added.

### PR 1 — Disclose estimated weekly hours (recommended first; small; repo only)

**Problem:** fitted totals are displayed without their provenance; absent TV implies nothing logged.

**Behavior:** type the existing provenance/freshness fields and identify the legacy file as reconstructed. Use `Estimated weekly hours` on the control and legend, `Estimated: X.X h this week` in inspection, and a short note: “Reconstructed from rolling training statistics; individual weekly totals may differ from recorded totals.” Include provenance in chart accessible descriptions and focused-week inspection even when the hours overlay is off. Say “Variability unavailable” for absent TV unless an explicit source reason proves a zero window. Display the existing training snapshot dates; do not regenerate the fitted series or change the metric calculation.

**Files:** src/lib/training.ts; Training.tsx; TvChart.tsx and their CSS modules only if needed; README.md; clarify overconfident comments/derivation wording in scripts/derive_weekly_hours.py without changing fitting behavior. Add a small provenance-formatting fixture test if a helper is introduced. Avoid hand-editing generated numeric arrays.

**Dependencies:** none on private pipeline or services. Legacy files with recognized derivation remain estimated; unrecognized provenance is “source unspecified,” never observed.

**Acceptance/validation:** every individual-week hours surface says estimated; neither missing TV nor missing metadata claims observed totals or confirmed zeros. Keyboard/touch focus gives the same disclosure as hover. Existing training URLs and Sessions links work. Build, targeted fixtures and browser inspection at desktop/375px. Acceptance is truthful legacy disclosure; full nullable-total ingestion belongs to PR 3.

**Spencer decision:** approve wording; no prerequisite decision blocks drafting this PR.

### PR 1a — Stabilize snapshot-dependent CI assertion (small; repo only)

**Problem/behavior:** replace the Chicago strip test's imported live-snapshot expectation with fixed complete and partial fixtures. Keep a separate structural check against committed data if useful; do not simply update the hardcoded miles each week.

**Files:** test-intent.mjs, optionally a test fixture file. **Dependencies:** none; land alongside or immediately after PR 1 so CI can gate later work. **Acceptance/validation:** both fixture states verified; a benign Chicago snapshot refresh no longer changes test expectations; npm run test:intent passes including test-races. **Decision:** none. This is an additional verified work item, not a change to training behavior.

### PR 2a — Bound AI input, remove unnecessary paid calls and query logs (medium; repo only)

**Behavior:** enforce JSON content type and a proposed 16 KiB body limit while reading bytes, not merely trusting Content-Length. Reject oversized input (413), malformed JSON/schema (400), excessive strings/arrays, invalid settled vocab and removed keys. Preserve 120 characters/25 IDs/4-second timeout and 15-second function duration. Deduplicate known public IDs. Requests with no valid candidates return empty AI scores/facets without upstream work; client keeps local results. This intentionally forgoes AI facet rescue of an empty shortlist; test that change explicitly. Bound or remove the old IP map once durable protection lands.

Replace raw-query/scores/facets/error-body logs with request ID, model, status/reason, latency, candidate/question counts, cache outcome, token usage and provider-reported cost. Missing cost remains unknown, not zero; any calculated cost is labeled an estimate. Sanitize error messages. No query hashes or raw IPs in routine logs; short-lived keyed IP digests are quota keys, not analytics identifiers. Retain aggregate operational logs for a proposed 7 days subject to platform retention capabilities.

**Files:** src/server/jev-rerank.ts; optionally new input/telemetry helpers and test-server.mjs; ActivityLookup.tsx if a temporary-unavailability/retry state needs refinement; package.json/CI test wiring; README.md. **Dependencies:** mocked provider and representative public fixtures, no new infrastructure. **Acceptance/validation:** empty/unknown IDs, cached candidates with needed facets, duplicates, malformed/oversized/chunked bodies and oversized settled fields are covered; no upstream call for zero valid candidates; sanitized logs contain no submitted query. Local ordering/results survive 429/502/503/504 and non-JSON error responses. **Decision:** confirm dropping facet-only empty-shortlist calls and retention policy.

### PR 2b — Enforce shared per-client and aggregate AI quotas (medium; repo plus later infrastructure dependency)

**Behavior:** reserve quota atomically before every paid upstream attempt, after validation and cache decisions. Use one shared authoritative primary store, stable keys across deployments/instances, separate production/preview namespaces, and server-defined UTC windows. Proposed starting policy: 20 paid attempts/client/minute and 200 total attempts/day; Spencer selects final values. Also cap total packed questions/day so 25-candidate requests cannot consume the same allowance as one-candidate requests. Set that question cap from approved provider pricing/budget. No client-controlled budget keys. Verify trusted platform IP extraction; don't accept an arbitrary forwarded header as identity.

One atomic transaction/script checks and increments client, daily request and question counters together, with expiry; reads/checks must not use asynchronously replicated counters. Never refund timed-out or uncertain attempts, and avoid automatic provider retries. Cache hits with no upstream call consume no paid allowance. In-memory caches remain optional optimizations, never quota authority. Quota exhaustion returns 429 plus Retry-After. Missing configuration, backend timeout/error, or unsafe counter state fails closed for AI (503), keeps local results, and records a sanitized reason. Distinguish temporary quota outages from permanently disabled AI so the existing 503 handling does not unnecessarily disable retry for the whole mounted session. Explicit disable switch defaults to local-only if a paid provider is configured but durable quotas are not.

**Files:** handler; new src/server/ai-quota.ts; server tests; ActivityLookup.tsx fallback status; README.md; package.json/lockfile only if an SDK is selected. Keep api wrapper/bundling and server-only credentials compatible. **Dependencies:** later approved shared store and server environment variables; details below. **Acceptance/validation:** concurrent calls from independent handler instances cannot overshoot caps; fresh instances/restarts keep totals; day/minute rollover, TTL, cache bypass, max-question accounting, failure paths and preview isolation tested. Mocked AI errors preserve locked metric/date ordering and local results. Test with a disposable store only after separate authorization. **Decision:** daily/minute/question limits, monthly dollar allowance, free tier versus paid service approval.

### PR 3 — Consume observed weekly aggregates and enforce export compatibility (medium repo PR; medium separate private-pipeline work)

**Behavior:** validate a versioned hours/TV export contract; join by canonical Sunday date rather than parallel positions. Prefer observed totals when explicitly exported. Retain legacy reconstructed history with per-week provenance; missing totals are null/gaps, never zero. A zero value is only a supplied observed zero or a clearly labeled reconstructed zero. Partial current weeks are excluded from complete-week comparisons and rolling TV; optionally show a separately labeled “week so far” value, without silently filling the missing complete week.

Reject duplicate/invalid/non-Sunday keys, negative/nonfinite hours, wrong sport filters/timezone/week convention, broken arrays, and incompatible batch identity/coverage. A mismatched observation cannot attach to another week's TV. Require matching as_of/last_complete_week_end for new paired exports; fail the build on incompatible input so the prior deployment remains live. During legacy migration show the known shared coverage; if runtime inputs differ, hide the incompatible overlay and explain rather than invent values. Explicit unavailable TV reasons must survive normalization.

**Files:** src/lib/training.ts; Training.tsx; TvChart.tsx/CSS for gaps; new scripts/fetch-training.mjs and validation helper/tests; scripts/derive_weekly_hours.py retained only for labeled legacy reconstruction; README.md; vercel.json/CI wiring after contract agreed. Generated training JSON is replaced by exports, not hand-maintained.

**Dependencies:** private pipeline contract in section 3. No private changes authorized here. **Acceptance/validation:** observed/reconstructed/unavailable/zero/partial fixtures render distinctly; missing bars don't affect axis calculations or become zero; paired freshness/coverage check passes; run/bike/all match export filters; legacy URLs and keyboard-selected weeks work; test mismatched dates/batches, absent rows and truncated export. **Decision:** aggregate inclusion policy and duration basis; whether to show a separate current partial week. Do not compute “actual” aggregate totals from public lookup activities, whose coverage can differ.

### PR 4 — Correct homepage wording (small; repo only)

**Behavior:** Training card: “See how weekly training hours vary over time, across running, cycling, and all training.” Lookup: “Find sessions using everyday language, dates, distance, or workout type.” Add a quiet “Public activities only” qualifier. Remove the unsupported “stay healthy” promise. Check Running log coverage against src/data.json and Chicago's 23-week metadata before editing those cards; keep claims specific to the source.

**Files:** Home.tsx; src/lib/pages.ts only if matching metadata needs correction. **Dependencies:** source coverage review, not AI availability. **Acceptance/validation:** each card accurately names metric and coverage; links/layout and existing visual style unchanged; local fallback supports the wording. Build and mobile browser copy check. **Decision:** optional copy preference; provider details remain in README/secondary debug surface.

### PR 5 — Accessible lazy-route loading and recovery (medium; repo only)

**Behavior:** compact static “Loading training…”/“Loading activities…” status with role=status; preserve Nav outside the boundary. Add a route error boundary keyed by normalized pathname so navigation to another route clears the displayed error. Query-only changes should not clear a failure or discard URL state. Offer “Reload this page” and a Home link, both keyboard reachable. Reload uses the current full URL, preserving search/hash and retrieving fresh entry HTML after a deployment.

React.lazy caches a rejected import: resetting only the error boundary does not retry it. The least complex reliable chunk recovery is an explicit full-page reload; no misleading same-instance Retry button and no automatic reload loop. If reload also fails, keep navigation and explain retrying when connectivity returns. This handles obsolete chunk names by loading the current entry bundle; separately verify production HTML revalidation and missing asset response behavior. A component-render failure also gets the boundary, without treating every error as a stale deployment.

**Files:** App.tsx; new RouteBoundary.tsx/RouteStatus.tsx and shared CSS; tests/route-recovery browser tests and package wiring if required. **Dependencies:** browser test tooling; no router replacement. **Acceptance/validation:** delay and fail each lazy chunk, simulate an obsolete asset, verify status/reload/current URL preservation; navigate away/back; keyboard and narrow-screen recovery; reduced motion has no required animation; route chunks stay split. Focus error heading after failure without stealing focus during ordinary loading. **Decision:** use the recommended reload-first recovery; no infrastructure dependency.

### PR 6 — Live Chicago calendar countdown and explicit freshness (medium; repo only)

**Behavior:** derive Chicago today using Intl.DateTimeFormat with America/Chicago and formatToParts; parse validated raceDate as a civil date. Subtract UTC date ordinals of those civil dates, not elapsed milliseconds between local midnights. Share the result between Hero and Footer; retain exported daysToRace only as ignored legacy metadata. Before race day show positive days; race day say “Race day”; after race day say “Race day has passed” with the date. No inferred race result and no negative count/weeks-out label.

Recompute every minute plus focus/visibilitychange so an open tab updates within a minute of Chicago midnight and promptly on wake. No assumption that a local day lasts 24 elapsed hours. Training phase, currentWeek and mileage remain explicitly snapshot-based. Keep “Training data as of …”; proposed stale threshold is more than 2 Chicago calendar days since lastUpdated for the daily Chicago export. Unknown/invalid timestamps say freshness unknown, not fresh; future dates are flagged. Display independent dates for older crossBuild/TV sub-snapshots when they differ. For the weekly training export use a separate proposed policy: more than 8 calendar days old or missing the latest complete week beyond a 48-hour publication grace period. Countdown changes never update either stamp.

**Files:** Chicago/Hero.tsx, Footer.tsx and CSS; new calendar-countdown helper/hook; src/lib/chicago-data.ts; snapshot/freshness helper; Training.tsx; README.md; date tests. **Dependencies:** race timezone known; more precise generated_at/data-through timestamps require later pipeline contract. **Acceptance/validation:** Chicago midnight when browser is UTC/Asia/Pacific, spring/fall DST, leap/year boundaries, race day/post-race, invalid raceDate, stale/future stamps, suspended tabs and clock changes; fake-clock tests and browser midnight/wake test. **Decision:** approve stale thresholds and post-race wording. This can precede PR 3 if the race date makes it urgent.

### PR 7 — Exact N-slot presets and compatible focus widening (small; repo only)

**Behavior:** latest N Monday–Sunday calendar slots, anchored to the latest complete weekly date, with inclusive cutoff `lastSunday - (N - 1) * 7 days`. Update widenDateRange to the identical rule. Do not use last N records when missing weeks could span more than N calendar weeks. Short histories show their available span; internal missing slots are explicit unavailable gaps, not backfilled zeros or older records. Empty datasets return empty safely. “All” remains full available history.

**Files:** training.ts; focus.ts; new shared range helper if useful; range fixture tests and test-intent.mjs focus checks. **Dependencies:** nullable/gap representation from PR 3 for full gap UI; cutoff and widening fix can land independently. **Acceptance/validation:** exact 12/26/52/104 on contiguous fixtures/current data; first included/excluded Sunday, 1/short/empty history, missing middle/end weeks and all; focused week at Nth slot remains, at N+1th widens; future focus stays unavailable; links keep sport/horizon/range/hours/week. **Decision:** calendar-slot semantics recommended and consistent with the UI's week labels.

### Phase 2 — Deterministic weekly interpretation (optional; medium; repo plus possible export dependency)

Concept: “Last complete week: X observed running hours; change Y from the previous comparable complete week. At the same weeks-to-race stage of the prior build: Z.” Show aligned dates, sport, metric, coverage and data stamps. Link the week and relevant public sessions using existing from/to/sport/activity URLs. Say public sessions may only explain part of aggregate change; show “no public sessions available” instead of claiming no training occurred. Use neutral facts such as “more long-run time” only when exported facts support them; label explanatory interpretations separately. For missing, partial or estimated totals, withhold observed change/comparison or clearly label an estimate. No readiness/health/causal claims, invented Fit or stimulus-fit scores, or fabricated plan basis.

**Files:** new WeeklySummary.tsx/helper/fixtures; Training.tsx or Chicago/WeeklyLoad.tsx; existing links/week/crossBuild helpers; README. **Dependencies:** PR 3 and comparable complete-week prior-build totals; current completed-build averages are not sufficient to invent per-week comparisons. **Acceptance/validation:** comparable-stage/calendar mapping, absent/partial data, coverage mismatch and session-link tests; facts trace to export fields; rendered summary remains short on mobile. **Decision:** which prior build and whether to use hours or miles as the first comparison metric. This phase never blocks trust/reliability PRs.

## 3. Private-pipeline and infrastructure dependencies, including costs

### Required private export contract — specification only

Spencer or a separately authorized task must implement this in the private training pipeline. Suggested tracked public artifact: a versioned paired training export, or two files with a common export_id/source revision. Include schema_version, generated_at (UTC instant), as_of/data_through, last_complete_week_end, timezone America/Chicago, week start Monday/end Sunday, metric/unit and duration basis, filter definitions, aggregate inclusion policy, and stable source/export revision (no sensitive source paths).

Per weekly row: week_start and week_end civil dates; completion status; run/bike/all duration totals in seconds or explicitly documented hours; provenance observed/reconstructed; coverage complete/partial/unavailable. Use null for unavailable values; explicit 0 only when source coverage is complete and no qualifying duration occurred. Preserve estimated legacy rows only with their derivation identity. Observed means summed recorded durations, not error-free measurements. Choose moving versus elapsed time consistently with TV. State allocation for a session crossing midnight/week boundaries (split duration or assign by start time) and test it. Determine inclusion/deduplication across Strava/Garmin before export.

Filters must match current TV: run = Run/TrailRun/VirtualRun; bike = Ride/VirtualRide; all = Ride/Run/TrailRun/VirtualRide/VirtualRun/Walk. “All” is this defined set, not every possible sport. TV must carry per-point availability/reason, complete coverage rules, window size, mean, sample-SD/mean definition and zero-week handling; a zero-mean undefined TV is not an absent export row. Export the lookback coverage needed for independent 8/12/52-week reconciliation, or document which early windows cannot be recomputed from public rows.

Only aggregate approved fields ship. Public session links remain drawn from the separately public-only activity export; aggregate coverage may include activity sources that lookup cannot expose. Spencer must confirm the aggregate privacy policy. Do not export activity identifiers from private sessions, GPS, raw health/readiness records or private plan basis. Validate paired files before publishing; repo build validates again. Publish atomically and pin a common revision during ingestion so hours and TV cannot come from different snapshots.

Cost: export work uses the existing pipeline; no new paid service is required by this plan. Pipeline scheduling, tokens and deployment hook are existing dependencies, not changes made here.

### Platform rule versus shared limiter

| Option | Effect and limitation | Cost/prerequisite |
|---|---|---|
| Vercel endpoint WAF per-IP rule | Blocks abuse before function work; independent of function restarts. Official docs state counters are per region, so it is not a strict worldwide daily paid-use ceiling. | Hobby docs list one rate-limit rule and 1M allowed requests; fixed windows 10 seconds–10 minutes. Pro usage pricing is regional. Confirm actual team plan and current regional quote; no plan upgrade assumed. A rule/settings change needs a later authorized action. |
| Shared primary Redis quota | Atomic client plus daily request/question counters, across instances/restarts/deployments. Adds one authoritative backend, credentials and failure policy. | Upstash published free tier: 256 MB/500K commands monthly. PAYG examples use $0.20/100K commands per region; replication/storage can add cost. Confirm actual offer and script command accounting before provisioning. At personal-site volume a free tier is plausible, not guaranteed. |
| Provider key spending limit | Restrains monetary exposure independently of the application if the provider offers an enforced hard limit. Does not give per-client behavior or local fallback by itself. | Dedicated server key/project, approved dollar limit and provider-specific reset/overrun semantics. OpenRouter and direct TypeSafe need separate verification; do not substitute an unrelated Vercel AI Gateway budget. |

**Recommendation:** one minimal shared primary quota backend for the strict accepted ceiling; keep caches local. Add a WAF rule only if available within the existing plan and useful for function traffic. WAF alone is the simplest throttle but cannot meet the requested aggregate guarantee. If Spencer prefers no backend, explicitly keep AI disabled/local-only until an enforced provider budget plus acceptable platform throttle is agreed; do not advertise a global code quota that does not exist.

Code can enforce request/question counts before dispatch, schema/body bounds and fail-closed dispatch policy. Dollar cost ceilings need verified provider pricing plus a bounded worst-case cost reservation or an enforced provider billing cap. Merely adding provider-reported cost after completion can overshoot under concurrency and does not cap unknown/time-out charges. Budget alerts and Vercel compute spend alerts do not cap direct Jev/OpenRouter charges. Reconcile aggregate usage with provider billing without retaining search text.

Read-only firewall-config lookup returned 404, “Seawall Config not found.” This does not establish that no platform protection exists. Team billing plan, active rules, exact regional charges, provider key limits and Redis account eligibility remain unverified. No credentials were read or printed.

Node alignment is a separate settings dependency: set Vercel project selection to 22.x after authorization; existing engine declaration already selects 22 for production. No migration to 24 is needed to correct this discrepancy.

Sources checked October 5: [Vercel rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting), [Node precedence](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Upstash pricing](https://upstash.com/pricing/redis). Prices/entitlements must be reconfirmed before spending.

## 4. Validation performed, planned, and uncertainties

### Performed

- Clone/current SHA, repository instructions and named-source review; source/data coverage analysis; production alias/SHA/build logs and HTML/Chicago asset fetches.
- `npm ci --cache /tmp/running-npm-cache`: passed, 76 packages. The first npm ci failed because the default cache path was not writable; no lockfile change was needed. Local Node is 24.19.0 and emitted the expected engine warning, so these are not Node 22 baseline results.
- `env -u BRAIN_GITHUB_TOKEN npm run fetch:activities`: passed and generated the ignored empty placeholder; did not contact the private pipeline.
- `npm run test:intent`: failed one snapshot-dependent Chicago strip assertion; its chained race test therefore did not run in that command. `node --experimental-strip-types test-races.mjs` separately passed all race-link checks.
- `npm run build`: passed separately, including type-check, Vite bundles, page metadata and bundled API. Tracked git status remains clean.
- No browser checks, AI provider calls, load/abuse tests, countdown/quota/new recovery tests, or private export reconciliation were run. Agent-browser CLI is absent. The browser skill was reviewed, but no installed browser runner was available.

### Implementation validation gates

1. Rerun the four baseline commands under Node 22 after stabilizing the fixture; include new targeted tests in CI. Use provider mocks, not paid API calls, for quota/recovery failures.
2. Use deterministic fixtures for null/zero/estimated/observed/partial weekly rows and 8/12/52-week mean/TV reconciliation; test same-date joins, mismatched export identity and stale thresholds.
3. Add focused calendar-range and countdown tests as specified in PRs 6–7. Inject time rather than using today's actual date. Inject quota backend/provider for atomic reservation and failures; separately integrate two processes against the same approved test store.
4. Browser-test direct links `/training?week=2026-09-21&sport=run&horizon=medium&range=12wk&hours=1`, Chicago focused weeks, `/miles?year=2025`, and lookup with from/to/sport/activity/race/q combinations. Verify copy-link round trips, back/forward, same-route query changes and hash preservation.
5. At 375px and desktop, keyboard-only and reduced motion: delay chunks, block chunk imports, simulate obsolete deployment assets, use recovery reload and navigate away; check focus/status and no overflow. Use representative approved public activities because the empty placeholder cannot exercise realistic bundle load, activity expansion, live row/session coverage, export privacy correctness, production snapshot freshness or AI ranking quality.
6. In a local API harness or later authorized preview, return 429/502/503/504, malformed provider JSON and backend errors; confirm local results/locked sorting and no query retention. Do not confuse `npm run dev` with a functioning API: Vite does not run the Jev function.

Remaining uncertainties: actual duration/allocation/aggregate inclusion rules in the private pipeline; reason for six missing bike TV points; effective exact function Node patch; production runtime behavior under throttling; account/provider pricing and hard billing limits; browser rendering/mobile/recovery; private build-export revision reproducibility. Resolve these through contracts, fixtures and later authorized preview checks, not assumptions.

## 5. Recommended first PR draft

**Title:** Label reconstructed weekly hours as estimates

**Body:**

The training chart currently presents fitted weekly totals as “Weekly hours” even though the values are reconstructed from published rolling statistics. This change labels the overlay and individual-week values as estimates and adds concise provenance to chart inspection and accessible descriptions.

It also replaces the blanket “No TV · nothing logged” message with an availability message, so an absent variability point does not claim a confirmed zero week. Existing numeric series, chart styling, shareable training parameters and public-session links are preserved. Observed weekly exports will be integrated in a separate PR after the private pipeline contract is agreed.

Validation required before opening: production build; legacy-provenance and missing-TV fixtures; pointer, touch and keyboard week inspection at desktop and 375px; direct focused-week link and back/forward checks. Current planning baseline: build passed under local Node 24; test:intent has one unrelated live-snapshot assertion failure, to be fixed with deterministic fixtures. Repeat under Node 22 before marking the PR validated.

No Fit UI changes are proposed in this PR. If scope later touches Fit UI, add the required `Context: see AGENTS.md §Fit` line and preserve classification/fit confidence and published basis semantics.
