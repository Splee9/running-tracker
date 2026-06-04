# Running tracker

A small, self-contained web page that visualizes lifetime and per-year running
mileage, with interactive year toggles and playful distance comparisons.

## About the data

The page shows **aggregate running totals only** — yearly and lifetime mileage,
run counts, and the date of the first logged run. There is no location, GPS,
route, pace, heart-rate, or health data of any kind. Nothing on the page
identifies an individual.

## Files

- **`index.html`** — the built, deployable page. Generated; do not hand-edit.
- **`template.html`** — the styled source with a `/* __DATA__ */` marker. Edit
  this to change the visuals, layout, or the distance-comparison list.

## Notes

- Counts `Run`, `TrailRun`, and `VirtualRun` activities with positive distance.
- The current calendar year is flagged as partial — it shows a "· YTD" label and
  an on-pace projection. This rolls over automatically each year.
- The footer's "Last refreshed" stamp shows the build date.
