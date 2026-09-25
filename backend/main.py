import logging
import os
import sys
import time
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from cache import TTLCache
from geo import haversine_m
from geocoding_service import reverse_geocode, search_places
from route_analyzer import analyze_all_routes
from routing_service import RoutingError, get_alternative_routes


# ==================================================
# LOGGING
# ==================================================
#
# Logs never include users' coordinates or search text.
# Force UTF-8 so non-ASCII place names cannot crash logging on
# Windows consoles that default to cp1252.
#
# ==================================================

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    stream=sys.stdout,
)

logger = logging.getLogger("lumapath")


# ==================================================
# CREATE FASTAPI APPLICATION
# ==================================================

app = FastAPI(
    title="LumaPath API",
    description="Safety-aware route recommendations",
    version="2.0.0"
)


# ==================================================
# CORS
# ==================================================
#
# Set ALLOWED_ORIGINS (comma-separated) in production.
# The defaults cover the Vite dev server.
#
# ==================================================

DEFAULT_ORIGINS = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:4173,http://127.0.0.1:4173"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",")
        if origin.strip()
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ==================================================
# RATE LIMITING
# ==================================================
#
# Each route request fans out to several free public services
# that will block us if we flood them. A simple per-client
# window is enough for a single-instance deployment.
#
# ==================================================

RATE_LIMITS = {
    "/safe-route": (10, 60),         # 10 requests per minute
    "/geocode/search": (60, 60),     # typing is bursty
    "/geocode/reverse": (20, 60),
}

_request_log = TTLCache(ttl_seconds=120, max_items=5000)


@app.middleware("http")
async def rate_limit(request: Request, call_next):

    limit = RATE_LIMITS.get(request.url.path)

    if limit and request.method != "OPTIONS":
        max_requests, window = limit
        client = request.client.host if request.client else "unknown"
        key = (client, request.url.path)
        now = time.monotonic()

        recent = [
            t for t in (_request_log.get(key) or [])
            if now - t < window
        ]

        if len(recent) >= max_requests:
            return JSONResponse(
                status_code=429,
                content={"detail": {"message": "Too many requests. Please wait a moment and try again."}},
            )

        recent.append(now)
        _request_log.set(key, recent)

    return await call_next(request)


# ==================================================
# REQUEST MODEL
# ==================================================

class RouteRequest(BaseModel):

    source_lat: float = Field(ge=-90, le=90)
    source_lon: float = Field(ge=-180, le=180)
    destination_lat: float = Field(ge=-90, le=90)
    destination_lon: float = Field(ge=-180, le=180)
    mode: Literal["walking", "cycling", "driving"] = "walking"


MAX_TRIP_KM = {
    "walking": 40,
    "cycling": 120,
    "driving": 400,
}


# ==================================================
# ROOT / HEALTH
# ==================================================

@app.get("/")
async def root():

    return {
        "message": "LumaPath Backend is running",
        "status": "OK"
    }


@app.get("/health")
async def health():

    return {
        "status": "healthy"
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

    return {
        "results": await search_places(q, lat, lon)
    }


@app.get("/geocode/reverse")
async def geocode_reverse(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
):

    return await reverse_geocode(lat, lon)


# ==================================================
# SAFE ROUTE
# ==================================================

@app.post("/safe-route")
async def safe_route(
    request: RouteRequest
):

    straight_km = haversine_m(
        request.source_lat,
        request.source_lon,
        request.destination_lat,
        request.destination_lon,
    ) / 1000

    if straight_km < 0.05:
        raise HTTPException(
            status_code=400,
            detail={"message": "Start and destination are the same place."},
        )

    if straight_km > MAX_TRIP_KM[request.mode]:
        raise HTTPException(
            status_code=400,
            detail={
                "message": (
                    f"This trip is too long for {request.mode} "
                    f"(limit {MAX_TRIP_KM[request.mode]} km). "
                    "Try a different travel mode or a closer destination."
                )
            },
        )

    started = time.monotonic()

    try:
        routes = await get_alternative_routes(
            request.source_lat,
            request.source_lon,
            request.destination_lat,
            request.destination_lon,
            mode=request.mode,
        )

    except RoutingError as error:
        raise HTTPException(
            status_code=404,
            detail={"message": str(error)},
        )

    except Exception:
        logger.exception("Routing failed")

        raise HTTPException(
            status_code=502,
            detail={"message": "The routing service is unavailable right now. Please try again shortly."},
        )

    try:
        result = await analyze_all_routes(routes, mode=request.mode)

    except Exception:
        logger.exception("Route analysis failed")

        raise HTTPException(
            status_code=500,
            detail={"message": "Unable to analyse routes right now. Please try again."},
        )

    logger.info(
        "safe-route (%s): %d routes in %.1fs",
        request.mode,
        len(result["routes"]),
        time.monotonic() - started,
    )

    return {
        "success": True,
        "mode": request.mode,
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
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=True
    )
