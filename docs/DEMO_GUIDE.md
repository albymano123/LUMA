# Presentation and viva guide

A 10 to 12 minute flow that shows the whole project, plus the questions you are most likely to be asked.

## Before you start

1. Start the app (see the README) or open the deployed URL a minute early (free hosts sleep).
2. Have two trips ready: **Chalakudy to Kodakara** (walking, five distinct routes) and
   **Ernakulam to Fort Kochi** (driving).
3. Optional: open the landing page on your phone for the mobile demo.

## Suggested flow

| Time | What to show | What to say |
|---|---|---|
| 1 min | Landing hero | "Navigation that considers more than just speed." The route is drawn by a lightweight 3D scene that falls back to 2D on slow devices. |
| 1 min | Scroll: trust strip, Why, How it works | The numbers are live from the local map database (496k roads, 8k hospitals and clinics, 2.6M buildings). |
| 1 min | Safety intelligence and comparison demo | Six factors, each from real data. The example card is labelled as an illustration. |
| 3 min | **Planner**: type Chalakudy and Kodakara, watch the progress steps | Each step ticks only when the backend has really finished it (streamed progress). About 3 seconds. |
| 2 min | Compare routes: cards, score rings, Safest / Balanced / Time-efficient | Selected is not the same as recommended. Switch to Time-efficient: it is selected but not called recommended. |
| 1 min | Open "Why this route?" and the score breakdown | Every factor is explained; the lighting factor says "Data unavailable" because Kerala's map has almost no lighting tags. Confidence drops instead of guessing. |
| 1 min | Map layers: Safety factors, Weather, Emergency services | The amber stretches are real: measured empty stretches with no mapped buildings. Click a hospital: hours and phone only if mapped. |
| 1 min | Phone view (or resize): bottom sheet | Drag to peek, half, full. The 112 button is on every page. |
| 1 min | Emergency page | Verified national helplines, share-my-location message that never leaves the browser. |
| 1 min | How it works page and the tests | The whole method is documented. 166 backend, 102 unit and 100+ browser tests, with accessibility and performance checks. |

## What makes this project different (say this)

- **Honest by design.** Missing data is left out and lowers confidence; there are no invented scores, no
  fake ML, no crime claims. When safety cannot be defended, no route is called recommended.
- **Reliable geographic data.** A local OpenStreetMap database replaced slow, rate-limited public servers:
  searches went from about 25 s to about 3 s.
- **One source of truth.** Scores and recommendations are computed only by the backend.
- **Engineered, not just designed.** Custom design system, streamed progress, WCAG-checked contrast,
  lazy-loaded 3D with automatic fallbacks, measured performance budgets.

## Likely questions

**Why not PostGIS?** It was not installed, and free hosting would need a managed database plus credentials.
The data is read-only reference data, so a single SQLite file with R-Tree spatial indexes gives the same
millisecond spatial queries with nothing to run. The store is one module, so it could be swapped.

**Is the safety score machine learning?** No. It is a rule-based, explainable score. A model can only learn
safety from real incident records, and none exist, so the ML pipeline is built and tested but honestly
reports "not trained". The old 10-row model was removed because it only learned "short routes are safe".

**How are the weights decided?** They are documented engineering judgements (docs/SAFETY_SCORE.md), not
learned. They are shown to the user and can be changed in one file.

**What if the data is wrong or missing?** Tag-based factors are used only when at least 30% of the route
carries the tag. Mapping completeness varies, which is stated in the app.

**What are the limits?** Kerala is covered by the local database; elsewhere live public servers are used and
can be slow or unavailable, in which case the app says "Insufficient data". No crime data. Scores are
estimates, not guarantees.

**How was performance handled?** Heavy code loads only where used (3D hero, map, vector engine); fonts are
self-hosted Latin subsets; the analysis fetches weather during routing; segment matching uses a spatial grid.
The measured numbers are in docs/DESIGN_SYSTEM.md.

## If something goes wrong live

- Public routing or geocoding is slow: the app shows an honest error with Retry; cached trips reload instantly.
- No internet: the map falls back to plain tiles or blank, but the local database still answers safety queries.
- Use the screenshots in `docs/screenshots` as a backup.
