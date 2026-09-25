# LumaPath: one image serving the API and the web app.
#
#   docker build -t lumapath .
#   docker run -p 8000:8000 lumapath        ->  http://localhost:8000
#
# Three stages: build the web app, build the Kerala map database from
# OpenStreetMap, then assemble a small runtime image with neither
# Node nor the (build-only) osmium tools in it.

# ---------- 1. web app ----------
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Empty = the app calls the API on its own origin.
ENV VITE_API_URL=""
RUN npm run build

# ---------- 2. map database ----------
FROM python:3.13-slim AS data
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt backend/requirements-data.txt ./
RUN pip install --no-cache-dir -r requirements-data.txt
COPY backend/ ./
# Any OpenStreetMap extract + matching .poly boundary works; the defaults
# are Kerala from openstreetmap.fr. Change them to cover another region.
ARG GEO_PBF_URL=https://download.openstreetmap.fr/extracts/asia/india/kerala.osm.pbf
ARG GEO_POLY_URL=https://download.openstreetmap.fr/polygons/asia/india/kerala.poly
ARG GEO_SOURCE="OpenStreetMap extract (Kerala, India)"
# The node index lives on disk so the build fits in small (512 MB) builders.
RUN curl -fsSL -o /tmp/region.osm.pbf "$GEO_PBF_URL" \
    && curl -fsSL -o /tmp/region.poly "$GEO_POLY_URL" \
    && python -m geodata.build --pbf /tmp/region.osm.pbf --poly /tmp/region.poly \
         --out /out/geo.sqlite --source "$GEO_SOURCE" \
         --node-index "sparse_file_array,/tmp/nodes.idx" \
    && rm -f /tmp/region.osm.pbf /tmp/nodes.idx

# ---------- 3. runtime ----------
FROM python:3.13-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    STATIC_DIR=/app/static \
    GEO_DB_PATH=/app/data/geo.sqlite \
    TRUST_PROXY=true \
    HOST=0.0.0.0

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
RUN rm -rf tests data venv __pycache__ requirements-*.txt
COPY --from=data /out/geo.sqlite /app/data/geo.sqlite
COPY --from=web /web/dist /app/static

RUN useradd --create-home --uid 10001 lumapath
USER lumapath

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import os,urllib.request as u; u.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT','8000'), timeout=4)"

# Hosts such as Render set $PORT.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
