# Audit: old LumaPath paper vs. the current LumaPath repository

Source of the old paper's claims: `docs/old_paper_reference.pdf` (6 pages, IEEE
two-column conference format), extracted and quoted below. Source of the
current claims: the repository at the commit this audit was written against
(`backend/`, `frontend/`, `Dockerfile`, `render.yaml`, tests). Every "current"
statement below was verified by reading the code or running it; none is
carried over from the old paper on trust.

## 1. What the old paper says

- **Title / framing.** "LumaPath: An AI/ML-Driven Safety-Aware Route
  Recommendation System Using Open Geospatial and Real-Time Environmental
  Data." The abstract frames the contribution as "introducing an AI/ML-based
  safety analysis stage into the route recommendation," combined with travel
  cost to rank alternatives.
- **Architecture (Table III, "Implementation Stack").** Client: React, Vite,
  Leaflet. Backend: FastAPI with asynchronous HTTP clients. Routing: Project
  OSRM. Geospatial queries: **Overpass API**. Weather: Open-Meteo. **AI/ML
  analysis: "Trained route-safety model."** **Persistence: PostgreSQL with
  PostGIS.** Interface: JSON over REST.
- **Route feature collection (Section III-B).** "Twelve sampling positions
  for emergency-service queries and five positions for weather observations."
  PostgreSQL/PostGIS is named as providing "storage and caching for
  route-related information."
- **Procedure (Table II).** A 9-step pipeline ending in "Apply the trained
  AI/ML safety model and obtain the safety score and risk level" (step 7),
  then "Combine safety information with distance and travel time and rank
  the alternatives" (step 8) — i.e. the paper describes the AI/ML model's
  output as what ranking is based on.
- **Results (Section V, Table IV).** One "representative" source/destination
  pair about 9 km apart, three alternative routes, a table of distance,
  duration, hospital count and police count per route — no safety score
  column, and no model accuracy, precision, recall, F1 or error numbers
  anywhere in the paper.
- **The paper's own caveat.** Section V states: "Accuracy, precision, recall,
  F1-score, mean absolute error, or related measures should only be reported
  when they are calculated from the actual evaluation dataset," and "future
  experiments should report the exact model configuration, training-set
  size... Results should be reported on routes that were not used during
  training." This is the paper candidly flagging that **no such model
  evaluation — and, on the evidence available, no such trained model —
  existed at the time of writing.** Table V's "Primary role" row even calls
  the AI/ML approach the "Main safety-analysis component," which is not
  reconcilable with Section V's admission that no evaluation was run.
- **References.** 27 sources, mostly 2014-2024, covering crime-informed
  routing, learning-based safe navigation, danger-index/K-means route
  classification, weather-crash severity studies, and reviews of ITS safety
  factors.

## 2. What the current repository actually does

- **Persistence: not PostgreSQL/PostGIS.** There is no database server
  anywhere in the stack. The project uses a **single read-only SQLite file
  with an R-Tree spatial index**, built once from an OpenStreetMap extract by
  `backend/geodata/build.py` and shipped inside the Docker image
  (`docs/ARCHITECTURE.md`, "Decision: local database instead of live
  Overpass"). Measured from a real build: 495,901 road ways, 151,361 mapped
  places (142,888 activity, 5,270 hospitals/clinics combined as hospital,
  852 police, 181 fire stations, 2,170 clinics counted separately), 2,598,457
  buildings reduced to 1,268,234 50 m grid cells, a 122 MB file, built in
  about 130 seconds. This replaced an earlier reliance on live Overpass
  queries specifically because the public Overpass servers were observed to
  return `429`, time out, or return empty results under load — a reliability
  problem the old paper does not mention.
- **Geospatial queries: Overpass is a fallback, not the primary path.**
  `geo_context.py` uses the local database for any trip whose routes stay
  inside the extract's coverage polygon (with an emergency-search-radius
  safety margin near the border); only trips outside that area fall back to
  live Overpass.
- **Routing: not a single "Project OSRM" call.** `routing_service.py` asks
  OSRM for its own alternatives (up to 3) and additionally generates
  via-point detours on both sides of the direct line, then filters out
  near-duplicates (>80% path overlap), large detours (>1.6x the shortest
  route) and routes that double back on themselves, keeping up to 5 distinct
  alternatives. Walking and cycling use the FOSSGIS `routed-foot` /
  `routed-bike` OSRM instances; driving uses FOSSGIS `routed-car` falling
  back to `router.project-osrm.org`.
- **AI/ML: no trained model existed; the paper's claim could not have been
  evaluated.** `backend/ml/README.md` states plainly: "no model is trained,"
  because the only valid label for a safety model is a real incident/crime
  record, and none was available — the project's earlier 10-row synthetic
  training set and its model were deliberately removed as misleading. The
  repository's existing ML pipeline (`ml/build_dataset.py`,
  `ml/train_model.py`, `ml/predict_model.py`) is real and ready, but stays
  gated behind real incident data that has not been supplied, and it never
  ranks or recommends routes even once trained. Route ranking
  (`safety.categorize_routes`) has always been, and remains, 100% rule-based.
- **Safety scoring: a documented, explainable rule-based engine, not "fixed
  penalties."** `safety.py` computes six independently-missing-tolerant
  factors (emergency access, street activity, built-up surroundings, street
  lighting, road/traffic exposure, weather), each a 0-100 share-of-route
  measurement, combined with mode- and day/night-dependent weights,
  rescaled when a factor's data is unavailable, with three confidence levels
  and an explicit "Insufficient data" state rather than ever guessing.
- **Weather.** Matches the old paper's general description (Open-Meteo) but
  is more specific: readings are cached per 5 km x 5 km cell for 10 minutes,
  the worst visibility and the most severe weather code across a route's
  sampled points are reported (not an average), and a slow or failing
  weather service pauses weather lookups for 60 seconds rather than blocking
  route analysis.
- **Deployment.** Not discussed at all in the old paper. The current system
  ships as one three-stage Docker image (build the frontend; build or
  download the map database; assemble the runtime image), deployed on
  Render's free tier via `render.yaml`, with a health endpoint, retrying
  validated downloads (`geodata/fetch.py`, `geodata/provision.py`), and a
  documented recovery path (a prebuilt-database download) if the builder is
  too constrained to build the database itself.
- **Frontend/UX.** The old paper's description is one paragraph ("displays
  the recommended route, along with alternatives... distance, estimated
  duration, safety score, risk level, and available supporting
  information"). The current app additionally has: Safest / Balanced /
  Fastest route tagging with an explicit "no defensible recommendation"
  state, India-wide search biased to Kerala first, a streamed
  newline-delimited-JSON progress endpoint so the UI reports real stage
  completion instead of a generic spinner, clustered emergency-service
  markers and a safety-factor map layer, a mobile bottom sheet, and
  accessibility and performance passes (see `docs/ARCHITECTURE.md`,
  `frontend/e2e/`).

## 3. Sections that must be rewritten, not edited

| Old section/claim | Why it cannot stand | Replacement |
|---|---|---|
| Table III: "Persistence: PostgreSQL with PostGIS" | Never implemented; current system has no database server | Local SQLite + R-Tree file, built offline, shipped in the image |
| Table III: "AI/ML analysis: Trained route-safety model" used to rank routes (Table II, steps 7-8) | No model was trained (paper's own Section V concedes no evaluation happened); ranking has always been rule-based | Rule-based baseline drives ranking; a newly-trained, clearly-labelled AI/ML analysis is additive, not part of ranking |
| Section III-A: "Overpass is used to obtain nearby hospitals and police facilities" (as the primary path) | Overpass is now the fallback; the local database is primary | Local database primary, coverage-margin rule, Overpass fallback |
| Section III-A: "Project OSRM generates alternative routes" | Understates the real multi-route generation/filtering algorithm | Document the via-point generation, overlap/detour/doubling-back filters |
| Table IV case study | No safety score reported, no real experiment reproduced, numbers unverifiable | A real, reproducible route analysis from the live system, with real scores and real AI/ML output |
| Table V, "Primary role: Main safety-analysis component" | Contradicts the system's actual, deliberate rule-based-primary design | Corrected role split (baseline = primary/ranking; AI/ML = additive analysis) |
| (absent) Deployment | Not covered | New section: Docker/Render, runtime shared-library fix, retrying downloads |

## 4. New AI/ML contribution added for this paper

Because no real incident/crime dataset exists (and none was fabricated), the
existing incident-rate pipeline (`ml/predict_model.py`) remains untrained by
design. A new, separate, genuinely-trained component was added instead:

- **`ml/surrogate.py` + `ml/train_surrogate.py` + `ml/build_route_dataset.py`**
  (new files). A `HistGradientBoostingRegressor` is trained to predict the
  rule-based safety score from real route/weather features — the same
  feature-extraction and rule-scoring code the live API uses — sampled from
  real routes between real mapped locations across Kerala. This is a
  surrogate/distillation model: it learns the rule engine's real-data-driven
  reasoning, not a crime label, and it is documented as such everywhere it
  appears (module docstring, API field description, this paper).
- An `IsolationForest`, trained unsupervised on the same real feature
  matrix, flags routes with an unusual feature combination — a second,
  label-free AI/ML signal.
- Both are wired into `route_analyzer.py` as a new, additive
  `ml_safety_model` field on every analysed route (`schemas.py`), alongside
  the existing (still-untrained) `ml_estimate` field. **Neither model
  affects ranking or the recommendation**; `safety.categorize_routes` is
  untouched. This keeps the existing, working application exactly as it was
  for every user-visible behaviour, per the explicit constraint not to break
  it.
- Evaluation uses held-out-area (spatial group k-fold) cross-validation, the
  same methodology `ml/train_model.py` already used for the incident-rate
  pipeline, so the reported R^2/MAE describe generalisation to unseen parts
  of Kerala. The real counts and real cross-validated numbers are in the new
  paper's Experimental Evaluation section, obtained by actually running
  `ml.build_route_dataset` and `ml.train_surrogate` against the live local
  database and the live public OSRM/Open-Meteo services — not invented.

## 5. New figures required

1. **Current system architecture** — client -> FastAPI -> {routing_service
   (OSRM + via-point generation), geo_context (local SQLite+R-Tree, Overpass
   fallback), weather_service} -> route_analyzer -> {safety.py rule-based
   baseline, ml/surrogate.py AI/ML analysis} -> response. Must show the
   AI/ML box as parallel to, not downstream-gating, the ranking step.
2. **AI/ML route-analysis pipeline** — real route/weather features ->
   trained regressor (predicted score) + isolation forest (unusual-route
   flag) -> reported alongside, not instead of, the rule-based score.
3. **Safety-aware recommendation workflow** — the actual
   `categorize_routes` logic (fastest / safest-within-tie-margin / balanced
   / the "unavailable" state when no route is scored or confidently so).

## 6. New tables required

Route-level features actually available (table), current data sources
(table), current implementation stack (corrected table), AI/ML model
configuration and real training-run statistics (table), real experimental
results (table; R^2/MAE from actual cross-validation, not placeholders),
rule-based baseline vs. AI/ML analysis (corrected relationship, not
"primary role").

## 7. New experiments required and performed

- A real route-feature + rule-score dataset built by actually calling the
  production pipeline (`routing_service.get_alternative_routes` +
  `route_analyzer.analyze_all_routes`) for real origin/destination pairs
  sampled from real mapped places in the local Kerala database.
- Spatial-group-k-fold cross-validated R^2 and mean absolute error for the
  surrogate regressor, and the anomaly detector's flag rate, both measured,
  not assumed.
- Real local-database query and route-generation timings, measured from this
  repository's own test runs.

## 8. One scope decision stated plainly

The old paper's 27 references were kept as the related-work base; no
additional, unverified recent citations were added, specifically to avoid
the risk of introducing a fabricated or misattributed reference into an
academic paper. If the authors have specific 2023-2026 papers they want
cited, they can be added and verified on request.
