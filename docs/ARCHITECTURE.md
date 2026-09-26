# Architecture

## Request flow

```
POST /safe-route {source, destination, mode}
  1. validate (ranges, finite numbers, trip length limit per mode)
  2. routing_service      3-5 distinct routes            (OSRM, ~2 s, cached)
  3. in parallel:
       geo_context        map data for all routes at once (local DB: ~1 s; live: up to 20 s)
       weather_service    one Open-Meteo request for every sample point
  4. route_analyzer       measure each route against the shared data (~0.3 s)
  5. safety.py            score, confidence, explanations, recommendation
  6. typed response      (schemas.py)
```

`POST /safe-route/stream` runs the same pipeline and streams newline-delimited JSON events
(`routes`, `weather`, `map_data`, then `result` or `error`), each sent only when that stage has really
finished. The web app uses it for honest progress. It is exempt from gzip, which would hold the small
events back until the end (there is a regression test).

Typical total: **about 3 seconds** (it was about 25 s with live Overpass queries).

## Modules

| File | Responsibility |
|---|---|
| `main.py` | HTTP layer: validation, error handling, rate limiting, CORS, request IDs, optional web-app serving |
| `schemas.py` | The API contract (request and response models, visible at `/docs`) |
| `settings.py` | Configuration from environment variables |
| `routing_service.py` | Route alternatives from OSRM |
| `geo_context.py` | Chooses local database or live Overpass, returns one data shape |
| `geodata/` | Local map database: `schema`, `build` (from a `.pbf`), `store` (queries), `coverage`, `codec`; `fetch` and `provision` (retrying downloads and validated database for the Docker image) |
| `overpass_provider.py` | Live fallback data source |
| `road_tags.py`, `road_features.py` | OSM tag parsing and per-route road features (pure computation) |
| `route_analyzer.py` | Measures routes and assembles the response |
| `safety.py` | **The only place scores and recommendations are computed** |
| `ml/` | Experimental, pipeline-ready ML (no model shipped) |

## Decision: local database instead of live Overpass

The public Overpass servers rate-limit (`429`), time out and return empty answers under load.
That produced missing hospitals, "insufficient data" scores and 25-second searches.

Options considered:

| Option | Verdict |
|---|---|
| Keep live Overpass, add caching | Still fails on the first search of any new area |
| PostgreSQL + PostGIS | The standard GIS choice, but needs a database server (PostGIS is not installed locally) and a managed PostGIS instance plus credentials to deploy |
| **SQLite + R-Tree, built from an OSM extract** | **Chosen.** A single read-only file, no server, real spatial index, ships inside the API image. The data is reference data that never changes at runtime, so a server database adds nothing |
| Hybrid: local first, live fallback | **Chosen** on top of the above, so trips outside the covered area still work |

How the queries work: SQLite's R-Tree module gives O(log n) bounding-box lookups. The store
asks for everything in small boxes along the route, then numpy computes exact distances.
Way geometry is stored as zlib-compressed delta-encoded integers (about 8x smaller than raw
coordinates). Building density is a 50 m grid of counts instead of 2.6 million footprints.

**Coverage safety margin.** A trip uses the local database only if every point of every route is
inside the extract's boundary polygon *and* at least the emergency search radius (2, 3 or 5 km)
away from its edge. Near the border, hospitals just across it are absent from the data, and using
it would understate emergency access; those trips use live data instead.

Schema and rebuild instructions: `backend/geodata/schema.py`, `backend/geodata/build.py`.
The database is generated (about 1 minute) and not committed to git.

## Decision: one container for the API and the web app

The API can serve the built frontend (`STATIC_DIR`). One service on one origin means no CORS
configuration, one URL for the demo and one free host. Separate hosting (a static host for the
frontend and any host for the API) also works: set `VITE_API_URL` and `ALLOWED_ORIGINS`.

## Failure behaviour

| Failure | Result |
|---|---|
| Map database missing/corrupt | Live Overpass data is used; logged |
| Overpass unavailable | Factors marked unavailable, confidence lowered, no invented data |
| Weather unavailable | Weather factor left out; score from map data; confidence lowered |
| Not enough evidence | `safety_score: null`, "Insufficient data", no recommendation |
| Routing unavailable | `502` with a friendly message and a request id |
| No route between places | `404` with a friendly message |
| Too many requests | `429` with `Retry-After` |
| Unexpected error | `500`, generic message + request id; details only in server logs |

## Privacy

Coordinates and search text are never logged (the HTTP client's URL logging is disabled).
The API stores nothing about users. Location is requested by the browser only when the user
presses "Use my current location".
