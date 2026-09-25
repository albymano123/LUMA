# LumaPath

**Safety-aware route comparison** for people on foot, on bicycles and in cars, built for
those who most need a careful choice: elderly people, women and children.

Normal navigation picks the fastest route. LumaPath generates several real route
alternatives, measures each one against open map data (emergency services, how built-up the
surroundings are, street activity, lighting, road and traffic exposure, weather) and shows
**why** each route scores the way it does, so the traveller can choose.

> LumaPath never says a route is "safe". It reports a **safety score**, a **risk level**
> (lower / moderate / higher) and a **confidence** level, computed only from data that exists.
> When data is missing the factor is left out and confidence drops. It is never counted as zero.

## What it does

- Search a start and destination with autocomplete (fully keyboard accessible), or use your current location
- Walking, cycling or driving
- 3 to 5 genuinely different route alternatives, drawn on a crisp vector map
- **Honest, streamed progress** while a trip is analysed: each step ticks only when the backend really finished it
- For each route: distance, time, safety score ring, risk level, confidence, key factors and plain-English reasons ("Why this route?")
- **Safest / Balanced / Time-efficient** choices, with *selected* and *recommended* kept separate
- Animated, clustered markers for hospitals, clinics, police and fire stations (hours and phone only where mapped)
- Map layers: Emergency services, Weather, and **Safety factors** (real stretches with no mapped buildings)
- Weather along the route, with quiet animated conditions
- A "Route environment" panel of real OpenStreetMap facts (road types, sidewalks, junctions, buildings...)
- Phone layout with a draggable bottom sheet; an emergency page with verified helplines and a share-my-location message
- A cinematic landing page with a lazy-loaded 3D hero that falls back to 2D on slow devices

## Screenshots

| | |
|---|---|
| ![Landing](docs/screenshots/landing-desktop.png) | ![Planner](docs/screenshots/routes-desktop.png) |
| ![Layers](docs/screenshots/layers-desktop.png) | ![Phone](docs/screenshots/routes-phone-open.png) |

## Architecture

```
 Browser (React + Leaflet)
        |  one origin in production
        v
 FastAPI  ──────────────────────────────────────────────┐
   |  /safe-route                                       |
   |                                                    |
   ├─ routing_service ──► OSRM (foot / bike / car)      |  alternatives + via-point detours,
   |                                                    |  de-duplicated and sanity-checked
   ├─ geo_context ──┬──► Local map database (SQLite +   |  roads, emergency services,
   |                |     R-Tree, from an OSM extract)  |  activity places, building density
   |                └──► Overpass (fallback outside     |  only for trips outside the
   |                      the covered area)             |  local database's area
   ├─ weather_service ──► Open-Meteo                    |
   └─ safety.py  ── the single source of truth for scores and recommendations
```

Key decisions (details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SAFETY_SCORE.md](docs/SAFETY_SCORE.md) and [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)):

- **Local OpenStreetMap database.** The free public Overpass servers are slow and rate-limit
  clients, which made results unreliable (25 s per search, frequent "insufficient data").
  A local SQLite database with R-Tree spatial indexes, built from a Kerala extract
  (~496,000 roads, ~8,000 hospitals/clinics/police/fire stations, ~143,000 shops and bus
  stops, ~2.6 million buildings), answers in milliseconds: a search now takes about **3 seconds**.
  Trips outside Kerala fall back to live Overpass data.
- **The backend is the only place scores are computed.** The frontend only displays them.
- **Honest ML.** There is no trained model, because there is no real labelled safety data.
  See [the ML section](#machine-learning-status).

## Quick start

Requirements: Python 3.13, Node 22 (or newer).

```bash
# 1. Backend
cd backend
python -m venv venv
venv/Scripts/activate            # Windows   (Linux/macOS: source venv/bin/activate)
pip install -r requirements.txt

# 2. Map database (one time, about a minute). Downloads ~180 MB.
pip install -r requirements-data.txt
mkdir -p data/raw
curl -L -o data/raw/kerala.osm.pbf  https://download.openstreetmap.fr/extracts/asia/india/kerala.osm.pbf
curl -L -o data/raw/kerala.poly     https://download.openstreetmap.fr/polygons/asia/india/kerala.poly
python -m geodata.build --pbf data/raw/kerala.osm.pbf --poly data/raw/kerala.poly --out data/kerala_geo.sqlite

# 3. Run the API
uvicorn main:app --port 8000     # docs at http://127.0.0.1:8000/docs

# 4. Frontend (new terminal)
cd frontend
npm install
npm run dev                      # http://localhost:5173/map
```

Without step 2 the app still works: it uses live Overpass data everywhere (slower and less reliable).
To cover another region, build the database from that region's extract
(<https://download.geofabrik.de>) and its `.poly` boundary.

## Tests

```bash
cd backend  && venv/Scripts/python -m pytest -q             # 166 backend tests
cd frontend && npm test                                     # 102 unit / component tests
cd frontend && npm run lint && npm run build
cd frontend && npx playwright install chromium              # once
cd frontend && npm run test:e2e                             # ~100 browser tests: behaviour, accessibility (axe), performance budgets
cd frontend && LIVE=1 npx playwright test e2e/live.spec.js  # real backend + real data (start the backend first)
```

`backend/tests/test_real_data.py` checks the pipeline against the real Kerala database
(city is far more built-up than a forest road, hospitals really are near Kochi, the coverage
polygon excludes Delhi and the Tamil Nadu border, results are deterministic...).
`backend/scripts/validate_trips.py` runs 13 real trips through the whole pipeline and checks each answer.

## Configuration

Everything is optional; see [backend/.env.example](backend/.env.example). No API keys or secrets
are needed: every service used is a free public API.

## Deployment

One Docker image serves the API and the web app on a single origin
([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)): `docker build -t lumapath . && docker run -p 8000:8000 lumapath`.
A Render blueprint (`render.yaml`) is included.

## Machine learning status

**No model is trained, and none is shown.** Safety cannot be learned without real labelled data
(recorded incidents or crimes at known locations), and none exists in the project. The earlier
10-row synthetic model was removed because it only learned "short routes are safe".

What exists instead is a complete, tested pipeline for the day real data is available
([backend/ml/README.md](backend/ml/README.md)): incident CSV -> real OSM road windows -> the same
features the live API computes -> spatially cross-validated model -> shown only if it beats a
plain baseline. Until then the API returns `ml_estimate.status = "not_trained"`, and the UI says
so. The ML estimate never influences ranking.

## Data, licences and limits

- Map data: (c) OpenStreetMap contributors, ODbL. Weather: Open-Meteo. Routing: public OSRM servers.
- Scores use **mapped** data. Map completeness varies: in Kerala only about 0.5% of roads carry
  a lighting tag and 2% a sidewalk tag, so those factors are usually reported as *not mapped*
  (unmapped does not mean unlit) and confidence is lowered accordingly.
- Scores are **not built from crime data**, and are not a guarantee of safety.
- The free public routing servers (OSRM) can be slow or rate-limited; results are cached.

## Project layout

```
backend/    FastAPI app: main.py, safety.py, route_analyzer.py, routing_service.py,
            geo_context.py, geodata/ (database build + queries), ml/ (experimental pipeline), tests/
frontend/   React + Vite, custom design system, Leaflet + MapLibre map, three.js hero;
            unit tests (Vitest) and browser tests (Playwright, axe)
docs/       Architecture, safety-score method, design system, deployment, demo guide, screenshots
Dockerfile  One-image deployment      render.yaml  Render blueprint
```

## Licence

MIT, see [LICENSE](LICENSE).
