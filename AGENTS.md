# AGENTS.md

Standing locks for agents in this repo. Not a diary. Behavior lives in code; this file only records decisions that are easy to undo by accident.

## Fit

Activity Lookup expand (`/activity-lookup`). Sentence mapping is `src/lib/stimulusFit.ts`; the panel is `src/components/StimulusDecision.tsx`.

- **Layer A** is classification confidence: `primary_stimulus` / `primary_confidence`. How sure the label is.
- **Layer B** is stimulus fit: `macro_readiness` → `activity_side_load` → `stimulus_fit` + `fit_confidence`. Whether the delivered work fit readiness and the plan.
- Never reuse `primary_confidence` as `fit_confidence`. This repo does not invent Fit scores.

The fit sentence leads in the expand UI. Layer A is the quieter muted line above it.

Readiness bands `ready_to_reach`, `baseline`, `chill`, and `rest` map to that sentence in `stimulusFit.ts` and the expand panel. Change the copy there.

Public activities JSON is the spencer-brain vault export. `BRAIN_ACTIVITIES_PATH` (default `data/public/strava-activities.json` in `Splee9/spencer-brain`) is fetched at build. Refresh is vault-side, then the Vercel deploy hook.

PRs that touch Fit UI should include: `Context: see AGENTS.md §Fit`.
