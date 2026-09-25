"""
LumaPath API.

    uvicorn main:app --port 8000        (run from the backend/ folder)

Endpoints: POST /safe-route, GET /geocode/search, GET /geocode/reverse,
GET /health. Interactive documentation is served at /docs.
"""

import asyncio
import json
import logging
import sys
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import settings
from cache import TTLCache
from geo import haversine_m
from geo_context import get_store
from geocoding_service import reverse_geocode, search_places
from route_analyzer import analyze_all_routes
from routing_service import RoutingError, get_alternative_routes
from weather_service import cell_centres, prefetch as prefetch_weather
from schemas import ErrorDetail, RouteRequest, SafeRouteResponse


# ==================================================
# LOGGING
# ==================================================
#
# Logs never include users' coordinates or search text. The HTTP
# client library logs every request URL (which contains coordinates
# and search text), so it is silenced. Force UTF-8 so non-ASCII place
# names cannot crash logging on Windows consoles.
#
# ==================================================

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    stream=sys.stdout,
)

for noisy in ("httpx", "httpcore"):
    logging.getLogger(noisy).setLevel(logging.WARNING)

logger = logging.getLogger("lumapath")

VERSION = "3.0.0"


# ==================================================
# APPLICATION
# ==================================================

app = FastAPI(
    title="LumaPath API",
    description=(
        "Safety-aware route comparison. Scores describe conditions in open "
        "data (OpenStreetMap, Open-Meteo); they are not guarantees of safety."
    ),
    version=VERSION,
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

# No cookies or credentials are used, so credentials stay disabled.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    expose_headers=["X-Request-ID"],
)


# ==================================================
# MIDDLEWARE: request id, rate limiting, headers
# ==================================================
#
# Each route request fans out to several free public services that
# will block us if we flood them. A simple per-client window is enough
# for a single-instance deployment. Behind a proxy (Render, Fly...)
# set TRUST_PROXY=true so the real client address is used.
#
# ==================================================

RATE_LIMITS = {
    "/safe-route": (settings.RATE_LIMIT_ROUTES, 60),
    "/safe-route/stream": (settings.RATE_LIMIT_ROUTES, 60),
    "/geocode/search": (settings.RATE_LIMIT_SEARCH, 60),
    "/geocode/reverse": (settings.RATE_LIMIT_REVERSE, 60),
}

_request_log = TTLCache(ttl_seconds=120, max_items=5000)


def client_address(request: Request):

    if settings.TRUST_PROXY:
        forwarded = request.headers.get("x-forwarded-for", "")

        if forwarded:
            return forwarded.split(",")[0].strip()

    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def protect(request: Request, call_next):

    request_id = uuid.uuid4().hex[:12]
    request.state.request_id = request_id

    limit = RATE_LIMITS.get(request.url.path)

    if limit and request.method != "OPTIONS":
        max_requests, window = limit
        key = (client_address(request), request.url.path)
        now = time.monotonic()

        recent = [t for t in (_request_log.get(key) or []) if now - t < window]

        if len(recent) >= max_requests:
            return JSONResponse(
                status_code=429,
                headers={"Retry-After": str(window), "X-Request-ID": request_id},
                content={"detail": {"message": "Too many requests. Please wait a moment and try again."}},
            )

        recent.append(now)
        _request_log.set(key, recent)

    response = await call_next(request)

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"

    return response


def error(status, message, request):
    """An HTTPException with a friendly message and a request id to quote."""

    return HTTPException(
        status_code=status,
        detail=ErrorDetail(
            message=message,
            request_id=getattr(request.state, "request_id", None),
        ).model_dump(),
    )


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, _exc: RequestValidationError):
    """
    A short message instead of FastAPI's default, which echoes the
    rejected input back (and cannot even serialise values such as NaN).
    """

    message = (
        "Those locations could not be read. Please choose them again from the suggestions."
        if request.url.path == "/safe-route"
        else "The request could not be read."
    )

    return JSONResponse(
        status_code=422,
        content={"detail": ErrorDetail(
            message=message,
            request_id=getattr(request.state, "request_id", None),
        ).model_dump()},
    )


# ==================================================
# LIMITS
# ==================================================

MAX_TRIP_KM = {
    "walking": 40,
    "cycling": 120,
    "driving": 400,
}

# Whole-request budget for route analysis.
ANALYSIS_TIMEOUT_S = 60


# ==================================================
# ROOT / HEALTH
# ==================================================

SERVING_WEB_APP = bool(settings.STATIC_DIR) and Path(settings.STATIC_DIR, "index.html").is_file()

if not SERVING_WEB_APP:

    @app.api_route("/", methods=["GET", "HEAD"])
    async def root():

        return {"message": "LumaPath API is running", "docs": "/docs", "status": "OK"}


@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    """Liveness plus what data is available (used by hosting health checks)."""

    store = get_store()

    return {
        "status": "healthy",
        "version": VERSION,
        "geo_database": (
            {"available": True, **store.describe(), **store.stats()}
            if store
            else {"available": False}
        ),
        "overpass_fallback": settings.OVERPASS_FALLBACK,
    }


# ==================================================
# PLACE SEARCH
# ==================================================

@app.get("/geocode/search")
async def geocode_search(
    q: str = Query(min_length=1, max_length=200),
    lat: float | None = Query(default=None, ge=-90, le=90),
    lon: float | None = Query(default=None, ge=-180, le=180),
):

    return {"results": await search_places(q, lat, lon)}


@app.get("/geocode/reverse")
async def geocode_reverse(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
):

    return await reverse_geocode(lat, lon)


# ==================================================
# SAFE ROUTE
# ==================================================

class TripError(Exception):
    """A failure with the HTTP status and friendly message to report."""

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


async def run_trip(body: RouteRequest, progress=None):
    """
    The whole analysis for one trip. `progress(event, data)` (optional) is
    awaited when a stage has REALLY finished, which is what lets the web
    app show honest progress:

        routes     the alternative routes exist          {"count": n}
        weather    the weather lookup has finished       {"available": bool}
        map_data   emergency services / roads loaded     {"source": "local"|"live"|"none", ...}

    Raises TripError. Returns the response payload.
    """

    async def report(event, data):
        if progress is not None:
            await progress(event, data)

    straight_km = haversine_m(
        body.source_lat, body.source_lon,
        body.destination_lat, body.destination_lon,
    ) / 1000

    if straight_km < 0.05:
        raise TripError(400, "Start and destination are the same place.")

    if straight_km > MAX_TRIP_KM[body.mode]:
        raise TripError(
            400,
            f"This trip is too long for {body.mode} "
            f"(limit {MAX_TRIP_KM[body.mode]} km). "
            "Try a different travel mode or a closer destination.",
        )

    started = time.monotonic()

    # Weather does not depend on the routes, so start it now and let it
    # run while OSRM works. Readings are shared inside ~5 km cells, so
    # fetching every cell the trip's area touches covers whatever points
    # the routes later ask about (a long trip just fetches its ends).
    weather_points = cell_centres(
        min(body.source_lat, body.destination_lat), min(body.source_lon, body.destination_lon),
        max(body.source_lat, body.destination_lat), max(body.source_lon, body.destination_lon),
    ) or [
        (body.source_lat, body.source_lon),
        ((body.source_lat + body.destination_lat) / 2, (body.source_lon + body.destination_lon) / 2),
        (body.destination_lat, body.destination_lon),
    ]
    weather_task = asyncio.create_task(prefetch_weather(weather_points))

    try:
        routes = await get_alternative_routes(
            body.source_lat, body.source_lon,
            body.destination_lat, body.destination_lon,
            mode=body.mode,
        )

    except RoutingError as routing_error:
        weather_task.cancel()
        raise TripError(404, str(routing_error))

    except Exception:
        weather_task.cancel()
        logger.exception("Routing failed")
        raise TripError(502, "The routing service is unavailable right now. Please try again shortly.")

    await report("routes", {"count": len(routes)})

    # Usually already done; a cache miss inside the analysis would fetch it again.
    try:
        weather_ok = await asyncio.wait_for(asyncio.shield(weather_task), timeout=6)
    except Exception:
        weather_ok = False

    await report("weather", {"available": bool(weather_ok)})

    try:
        result = await asyncio.wait_for(
            analyze_all_routes(routes, mode=body.mode, progress=progress),
            timeout=ANALYSIS_TIMEOUT_S,
        )

    except asyncio.TimeoutError:
        logger.error("Route analysis timed out")
        raise TripError(502, "Route analysis took too long. Please try again.")

    except Exception:
        logger.exception("Route analysis failed")
        raise TripError(500, "Unable to analyse routes right now. Please try again.")

    logger.info(
        "safe-route (%s): %d routes in %.1fs",
        body.mode, len(result["routes"]), time.monotonic() - started,
    )

    return {
        "success": True,
        "mode": body.mode,
        "total_routes": len(result["routes"]),
        **result,
    }


@app.post(
    "/safe-route",
    response_model=SafeRouteResponse,
    responses={
        400: {"model": ErrorDetail},
        404: {"model": ErrorDetail},
        502: {"model": ErrorDetail},
    },
)
async def safe_route(body: RouteRequest, request: Request):

    try:
        return await run_trip(body)

    except TripError as failure:
        raise error(failure.status, failure.message, request)


@app.post("/safe-route/stream", response_class=StreamingResponse)
async def safe_route_stream(body: RouteRequest, request: Request):
    """
    The same analysis as /safe-route, streamed as newline-delimited JSON so
    the web app can show real progress. Each line is one object:

        {"event": "routes", "count": 5}
        {"event": "weather", "available": true}
        {"event": "map_data", "source": "local", "emergency_services": true, ...}
        {"event": "result", "data": {...same as /safe-route...}}
        {"event": "error", "status": 502, "message": "...", "request_id": "..."}

    "result" or "error" is always the last line.
    """

    request_id = request.state.request_id
    queue: asyncio.Queue = asyncio.Queue()

    async def progress(event, data):
        await queue.put({"event": event, **data})

    async def worker():
        try:
            payload = await run_trip(body, progress)
            validated = SafeRouteResponse.model_validate(payload).model_dump(mode="json")
            await queue.put({"event": "result", "data": validated})

        except TripError as failure:
            await queue.put({"event": "error", "status": failure.status,
                             "message": failure.message, "request_id": request_id})

        except Exception:
            logger.exception("Streaming analysis failed")
            await queue.put({"event": "error", "status": 500,
                             "message": "Unable to analyse routes right now. Please try again.",
                             "request_id": request_id})

        finally:
            await queue.put(None)

    async def lines():
        task = asyncio.create_task(worker())

        try:
            while True:
                item = await queue.get()

                if item is None:
                    break

                yield json.dumps(item, separators=(",", ":")) + "\n"

        finally:
            # The client went away: stop working for nobody.
            task.cancel()

    return StreamingResponse(
        lines(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


# ==================================================
# WEB APP (optional)
# ==================================================
#
# With STATIC_DIR set, the same service serves the built frontend, so a
# deployment is one container on one origin (no CORS to configure).
# Hashed assets are cached for a year; index.html is never cached so a
# new release is picked up. The page ships a Content-Security-Policy
# that allows only what the app uses: its own scripts, OpenStreetMap
# map tiles and Google Fonts.
#
# ==================================================

CONTENT_SECURITY_POLICY = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://*.tile.openstreetmap.org https://tile.openstreetmap.org",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
])

HTML_HEADERS = {
    "Cache-Control": "no-cache",
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
}


class ImmutableStaticFiles(StaticFiles):
    """Static files whose names contain a content hash: cache them for good."""

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


if SERVING_WEB_APP:

    _static = Path(settings.STATIC_DIR).resolve()

    if (_static / "assets").is_dir():
        app.mount("/assets", ImmutableStaticFiles(directory=_static / "assets"), name="assets")

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def web_app(path: str):
        """Files from the build (favicon...) or, for any page route, index.html."""

        candidate = (_static / path).resolve()

        if path and candidate.is_file() and _static in candidate.parents:
            return FileResponse(candidate, headers={"Cache-Control": "public, max-age=3600"})

        return FileResponse(_static / "index.html", headers=HTML_HEADERS)


# ==================================================
# RUN DIRECTLY
# ==================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
