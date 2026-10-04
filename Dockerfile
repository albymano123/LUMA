# LumaPath: one image serving the API and the web app.
#
#   docker build -t lumapath .
#   docker run -p 8000:8000 lumapath        ->  http://localhost:8000
#
# Three stages: build the web app, build (or download) the Kerala map
# database from OpenStreetMap, then assemble a small runtime image with neither
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
# CA certificates for downloads (geodata.fetch, not curl), plus the runtime
# shared libraries pyosmium's compiled extension links against dynamically
# (libexpat, libstdc++, libgcc_s) - the slim base image does not ship them,
# and pyosmium fails with ImportError: libexpat.so.1: cannot open shared
# object file at `import osmium` without libexpat1 specifically. zlib and
# glibc are already present (pip's own wheel installs depend on them).
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        libexpat1 \
        libstdc++6 \
        libgcc-s1 \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt backend/requirements-data.txt ./
RUN pip install --no-cache-dir -r requirements-data.txt
COPY backend/ ./
# Default: download the OpenStreetMap extract for Kerala (openstreetmap.fr)
# and build the map database here. Any extract + matching .poly boundary works.
ARG GEO_PBF_URL=https://download.openstreetmap.fr/extracts/asia/india/kerala.osm.pbf
ARG GEO_POLY_URL=https://download.openstreetmap.fr/polygons/asia/india/kerala.poly
ARG GEO_SOURCE="OpenStreetMap extract (Kerala, India)"
# Optional: URL of a database built earlier with `python -m geodata.build`
# (a .sqlite or .sqlite.gz file). When set, nothing is built: the file is
# downloaded and validated. Use it if the builder is too small or slow.
ARG GEO_DB_URL=""
# geodata.provision prints memory/disk, retries downloads, checks file sizes,
# builds with a disk-based node index (fits small builders) and validates the
# database, failing with a readable message instead of a bare exit code.
RUN python -X faulthandler -m geodata.provision --out /out/geo.sqlite

# ---------- 3. runtime ----------
FROM python:3.13-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    STATIC_DIR=/app/static \
    GEO_DB_PATH=/app/data/geo.sqlite \
    TRUST_PROXY=true \
    HOST=0.0.0.0

# Runtime shared libraries for numpy and pydantic-core's compiled extensions
# (libstdc++, libgcc_s) - not osmium, which is build-only and stays out of
# this stage. Without these the image builds but crashes on first request
# (ImportError at `import numpy` / `import pydantic_core`).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libstdc++6 \
        libgcc-s1 \
    && rm -rf /var/lib/apt/lists/*

# requirements-ml.txt (-> requirements.txt + pandas/scikit-learn/joblib)
# so the real, trained AI/ML risk model (ml/risk_model.py, shipped at
# backend/ml/models/risk_model.joblib - see .gitignore/.dockerignore)
# can actually be loaded. No extra system packages needed for any of the
# three: their compiled extensions only link libstdc++/libgcc_s (already
# installed above) and libc/libm (always present); scikit-learn's
# OpenMP runtime is bundled inside its own wheel. Verified directly
# against the real manylinux wheels' ELF dependencies, not assumed.
COPY backend/requirements.txt backend/requirements-ml.txt ./
RUN pip install --no-cache-dir -r requirements-ml.txt

COPY backend/ ./
RUN rm -rf tests data venv __pycache__ requirements-*.txt ml/data ml/*.csv
COPY --from=data /out/geo.sqlite /app/data/geo.sqlite
COPY --from=web /web/dist /app/static

RUN useradd --create-home --uid 10001 lumapath
USER lumapath

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import os,urllib.request as u; u.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT','8000'), timeout=4)"

# Hosts such as Render set $PORT.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
