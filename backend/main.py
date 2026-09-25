"""
LumaPath API.

    uvicorn main:app --port 8000        (run from the backend/ folder)

Endpoints: POST /safe-route, GET /geocode/search, GET /geocode/reverse,
GET /health. Interactive documentation is served at /docs.
"""

import asyncio
import logging
import sys
import time
import uuid

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

import settings
from cache import TTLCache
from geo import haversine_m
from geo_context import get_store
from geocoding_service import reverse_geocode, search_places
from route_analyzer import analyze_all_routes
from routing_service import RoutingError, get_alternative_routes
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

@app.get("/")
async def root():

    return {"message": "LumaPath API is running", "docs": "/docs", "status": "OK"}


@app.get("/health")
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

    straight_km = haversine_m(
        body.source_lat, body.source_lon,
        body.destination_lat, body.destination_lon,
    ) / 1000

    if straight_km < 0.05:
        raise error(400, "Start and destination are the same place.", request)

    if straight_km > MAX_TRIP_KM[body.mode]:
        raise error(
            400,
            f"This trip is too long for {body.mode} "
            f"(limit {MAX_TRIP_KM[body.mode]} km). "
            "Try a different travel mode or a closer destination.",
            request,
        )

    started = time.monotonic()

    try:
        routes = await get_alternative_routes(
            body.source_lat, body.source_lon,
            body.destination_lat, body.destination_lon,
            mode=body.mode,
        )

    except RoutingError as routing_error:
        raise error(404, str(routing_error), request)

    except Exception:
        logger.exception("Routing failed")
        raise error(502, "The routing service is unavailable right now. Please try again shortly.", request)

    try:
        result = await asyncio.wait_for(
            analyze_all_routes(routes, mode=body.mode),
            timeout=ANALYSIS_TIMEOUT_S,
        )

    except asyncio.TimeoutError:
        logger.error("Route analysis timed out")
        raise error(502, "Route analysis took too long. Please try again.", request)

    except Exception:
        logger.exception("Route analysis failed")
        raise error(500, "Unable to analyse routes right now. Please try again.", request)

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
