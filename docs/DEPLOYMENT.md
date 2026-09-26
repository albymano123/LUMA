# Deployment

LumaPath ships as **one Docker image** that serves the API and the web app on one origin.
No database server, no API keys and no secrets are needed.

## Run the image anywhere

```bash
docker build -t lumapath .
docker run -p 8000:8000 lumapath        # http://localhost:8000
```

The build has three stages: build the web app; get the map database (download the OpenStreetMap
Kerala extract and build it, about 5 to 10 minutes the first time); assemble a small runtime image.

The database stage runs `python -m geodata.provision`, which:

- prints the Python and pyosmium versions and the free disk and memory, so a failed build log says why;
- downloads with retries, a growing pause, and a size check (a truncated file is rejected and
  retried, never handed to the builder);
- builds with a **disk-based node index** (about 700 MB of temporary disk, and the index is recreated
  for each pass) and compact buffers, so it fits small builders;
- validates the finished database (schema version, real number of roads and places) and fails
  with a readable `ERROR:` line otherwise.

To cover another region:

```bash
docker build -t lumapath   --build-arg GEO_PBF_URL=https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf   --build-arg GEO_POLY_URL=<matching .poly file> .
```

### If the builder is too small or the extract host is unreliable: prebuilt database

The same database can be built once on your own machine and downloaded by the image, so the
builder does no OpenStreetMap processing at all:

```bash
cd backend
python -m geodata.build --pbf data/raw/kerala.osm.pbf --poly data/raw/kerala.poly --out data/kerala_geo.sqlite
python -c "import gzip,shutil; shutil.copyfileobj(open('data/kerala_geo.sqlite','rb'), gzip.open('data/kerala_geo.sqlite.gz','wb',6))"
```

Upload `kerala_geo.sqlite.gz` (about 70 MB) as a GitHub Release asset, then build with its URL
(on Render: **Environment** -> add `GEO_DB_URL`; Docker builds receive it as a build argument):

```bash
docker build -t lumapath --build-arg GEO_DB_URL=https://github.com/<user>/LUMA/releases/download/<tag>/kerala_geo.sqlite.gz .
```

The file is downloaded and validated exactly like a freshly built one. It is real OpenStreetMap
data produced by the same code, never a substitute.

## Free hosting on Render (recommended)

1. Push the repository to GitHub.
2. Render dashboard -> **New -> Blueprint** -> choose the repository. `render.yaml` configures a free
   Docker web service with the `/health` check.
3. Wait for the first build. Open the service URL.

If the build fails, open the log and find the `ERROR:` line printed by `geodata.provision`: it names
the failing step (download, build, or validation) and, for the build, the exception.

Free-tier limits: the service sleeps after about 15 minutes idle (the first request then takes
30 to 60 seconds to wake it), and has 512 MB RAM. Open the URL a minute before a demo.

## Other options

- **Web app and API on separate hosts** (for example Vercel + any container host): build the frontend
  with `VITE_API_URL=https://your-api.example`, and start the API with
  `ALLOWED_ORIGINS=https://your-frontend.example`. `frontend/vercel.json` and `frontend/public/_redirects`
  provide the single-page-app rewrite for Vercel / Netlify / Cloudflare Pages.
- **Fly.io / Railway / a VPS**: run the same Docker image. Set `TRUST_PROXY=true` behind a proxy.

## Environment variables

See `backend/.env.example`. Defaults are correct for the Docker image
(`STATIC_DIR`, `GEO_DB_PATH`, `TRUST_PROXY=true` are preset).

## Health checks and verification

- `GET /health` returns status, version and the map database's size and extract date.
- `GET /docs` is the interactive API documentation.
- After deploying, run the deployment checks against the live URL:

```bash
cd frontend
BASE_URL=https://your-app.onrender.com DEPLOYED=1 npx playwright test e2e/deployment.spec.js
```

These verify the health check, page routes and reloads, the security and caching headers, the
content-security policy (no console violations), and a real route analysis through the deployed API.

## Updating the map data

Rebuild the image (`docker build --no-cache --target data ...` refreshes the extract; on Render use **Manual Deploy -> Clear build cache & deploy**). Locally:
re-run `python -m geodata.build`. The extract date is shown in the app and at `/health`.

## Security notes

Content-Security-Policy (own scripts and self-hosted fonts; OpenFreeMap vector tiles and OpenStreetMap raster tiles for the map; MapLibre's blob workers), `X-Frame-Options`, `nosniff` and a strict CORS list are set; the container
runs as a non-root user; per-client rate limits protect the free public services LumaPath depends on;
errors return a request id, never internals; coordinates are not logged.
