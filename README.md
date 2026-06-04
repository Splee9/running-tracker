# Running tracker

A self-contained portfolio page showing lifetime + per-year running mileage, with
interactive year toggles and distance conversions. The numbers regenerate from
`raw/metrics.db` so the page is always current; you upload it to Netlify manually.

## Files in this folder

- **`index.html`** — the generated, deployable page. **This is the file you upload.**
  Do not hand-edit it; it's overwritten on every build.
- **`template.html`** — the styled page with a `/* __DATA__ */` marker. **Edit this**
  to change visuals, layout, or the distance-comparison list. Never touched by the build.
- `README.md` — this file.

## How it refreshes

```
metrics.db  ──►  scripts/build_tracker.py  ──►  index.html   ──►  (you) drag to Netlify
 (vault)          injects data into template      (this folder)
```

The build runs as **step 6 of `evening-sync`**, so `index.html` here stays current
with each sync that touches the DB. Nothing to schedule — it just regenerates in place.

## Publish it (manual upload)

1. Open **https://app.netlify.com/drop**
2. Drag **`index.html`** from this folder onto the page.
3. You get a live URL instantly. (To keep the same URL on future uploads, create a
   named site once in Netlify and use *Deploys → drag-and-drop* on that site.)

## Regenerate manually anytime

```bash
cd ~/code/spencer_brain2
python3 scripts/build_tracker.py     # rewrites web/running-tracker/index.html
```

Then re-upload `index.html`.

## Notes

- Counts sport types `Run`, `TrailRun`, `VirtualRun` with `distance_miles > 0`.
- The current calendar year is auto-flagged `partial` (shows "· YTD" and an on-pace
  projection). No code change needed when the year rolls over.
- `LAST_UPDATED` in the footer shows the build date, so the page proves its freshness.
