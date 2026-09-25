# Deployment

LumaPath ships as **one Docker image** that serves the API and the web app on one origin.
No database server, no API keys and no secrets are needed.

## Run the image anywhere

```bash
docker build -t lumapath .
docker run -p 8000:8000 lumapath        # http://localhost:8000
```

The build has three stages: build the web app; download OpenStreetMap Kerala and build the map
database (about 5 to 10 minutes the first time, using a disk-based node index, about 700 MB of temporary disk, so it fits in 512 MB of RAM);
assemble a small runtime image. To cover another region:

```bash
docker build -t lumapath \
  --build-arg GEO_PBF_URL=https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf \
  --build-arg GEO_POLY_URL=<matching .poly file> .
```

## Free hosting on Render (recommended)

1. Push the repository to GitHub.
2. Render dashboard -> **New -> Blueprint** -> choose the repository. `render.yaml` configures a free
   Docker web service with the `/health` check.
3. Wait for the first build. Open the service URL.

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

Rebuild the image (`docker build --no-cache --target data ...` refreshes the extract). Locally:
re-run `python -m geodata.build`. The extract date is shown in the app and at `/health`.

## Security notes

Content-Security-Policy (own scripts and self-hosted fonts; OpenFreeMap vector tiles and OpenStreetMap raster tiles for the map; MapLibre's blob workers), `X-Frame-Options`, `nosniff` and a strict CORS list are set; the container
runs as a non-root user; per-client rate limits protect the free public services LumaPath depends on;
errors return a request id, never internals; coordinates are not logged.
