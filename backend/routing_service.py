"""
Route generation.

OSRM only returns 1-3 alternatives (often just 1-2 in cities), so to
offer 3-5 genuinely different choices we also ask for routes forced
through "via" points placed either side of the direct line, then drop
anything that is a near-duplicate, a large detour, or doubles back on
itself.
"""

import asyncio
import logging
import math

import httpx
import numpy as np

from cache import TTLCache
from geo import (
    bearing_rad,
    distance_matrix_m,
    haversine_m,
    offset_point,
    resample_line,
    route_overlap,
)


logger = logging.getLogger("lumapath.routing")


# ==================================================
# OSRM SERVERS
# ==================================================
#
# router.project-osrm.org only has a car profile, so walking
# and cycling routes come from the FOSSGIS servers, which run
# separate foot / bike / car OSRM instances.
#
# ==================================================

OSRM_PROFILES = {
    "walking": [
        "https://routing.openstreetmap.de/routed-foot/route/v1/driving",
    ],
    "cycling": [
        "https://routing.openstreetmap.de/routed-bike/route/v1/driving",
    ],
    "driving": [
        "https://routing.openstreetmap.de/routed-car/route/v1/driving",
        "https://router.project-osrm.org/route/v1/driving",
    ],
}

TRAVEL_MODES = tuple(OSRM_PROFILES)

MAX_ROUTES = 5

# A via-route is only worth offering if it is not much longer
# than the shortest route found.
MAX_DETOUR_RATIO = 1.6

# Routes sharing more than this share of their path are treated
# as the same route.
MAX_OVERLAP = 0.8

_route_cache = TTLCache(ttl_seconds=600)

# Be polite to the free OSRM servers.
_osrm_slots = asyncio.Semaphore(3)


class RoutingError(Exception):
    pass


# ==================================================
# SINGLE OSRM REQUEST
# ==================================================

async def _request_osrm(client, mode, waypoints, alternatives):
    """
    waypoints: list of (lat, lon)
    Returns the raw OSRM route list, or [] if the request failed.
    """

    coordinates = ";".join(
        f"{lon:.6f},{lat:.6f}"
        for lat, lon in waypoints
    )

    params = {
        "alternatives": str(alternatives).lower()
        if isinstance(alternatives, bool)
        else str(alternatives),
        "overview": "full",
        "geometries": "geojson",
        # steps=true is needed for OSRM to fill in the road-name
        # summary we use to label each route.
        "steps": "true",
    }

    last_error = None

    for base_url in OSRM_PROFILES[mode]:

        try:
            async with _osrm_slots:
                response = await client.get(
                    f"{base_url}/{coordinates}",
                    params=params,
                )

            response.raise_for_status()
            data = response.json()

            if data.get("code") != "Ok":
                last_error = data.get("message") or data.get("code")
                continue

            return data.get("routes", [])

        except (httpx.HTTPError, ValueError) as error:
            last_error = error
            logger.warning("OSRM request failed on %s: %s", base_url, error)

    logger.warning("All OSRM servers failed: %s", last_error)

    return []


# ==================================================
# FORMAT ONE ROUTE
# ==================================================

def _steps(osrm_route):
    """
    Turn-by-turn maneuvers, flattened across every leg in order (a route
    with via-points has more than one leg). OSRM already computes this
    (requested with steps=true in _request_osrm); only the fields the
    frontend's maneuver-to-text mapping actually needs are kept, since
    each step's own intersection/geometry detail is not needed once the
    route's own overall geometry is already in the response.

    A step with no mapped road name is kept with name="" rather than
    dropped: "Turn left" is still real information even when the road
    it turns onto is unnamed in OpenStreetMap.
    """

    steps = []

    for leg in osrm_route.get("legs", []):
        for step in leg.get("steps", []):

            maneuver = step.get("maneuver") or {}
            location = maneuver.get("location")

            steps.append({
                "type": maneuver.get("type", "turn"),
                "modifier": maneuver.get("modifier"),
                "name": (step.get("name") or "").strip(),
                "distance_m": round(step.get("distance", 0.0)),
                "location": [location[0], location[1]] if location else None,
            })

    return steps


def _format_route(osrm_route, via=None):

    summaries = [
        leg.get("summary", "").strip()
        for leg in osrm_route.get("legs", [])
    ]

    road_names = []

    for summary in summaries:
        for name in summary.split(","):
            name = name.strip()
            if name and name not in road_names:
                road_names.append(name)

    return {
        "distance_km": round(osrm_route["distance"] / 1000, 2),
        "duration_min": round(osrm_route["duration"] / 60, 1),
        "geometry": osrm_route["geometry"],
        "via_roads": road_names[:2],
        "generated_via_point": via is not None,
        "steps": _steps(osrm_route),
    }


# ==================================================
# ROUTE QUALITY CHECKS
# ==================================================

def _doubles_back(coordinates):
    """
    True when a route walks down a road and comes back the same way,
    which is what happens when a via point lands on a dead end.
    """

    samples = resample_line(coordinates, spacing_m=40, max_points=400)

    if len(samples) < 20:
        return False

    distances = distance_matrix_m(samples, samples)
    index = np.arange(len(samples))

    # Only compare points that are far apart along the route.
    far_along_route = np.abs(index[:, None] - index[None, :]) > 8

    revisited = (
        (distances < 20) & far_along_route
    ).any(axis=1)

    return revisited.mean() > 0.08


def _via_candidates(source, destination):
    """
    Via points either side of the direct line at the midpoint,
    at two different distances, nearest first.
    """

    straight_m = haversine_m(*source, *destination)

    mid_lat = (source[0] + destination[0]) / 2
    mid_lon = (source[1] + destination[1]) / 2

    heading = bearing_rad(*source, *destination)

    candidates = []

    for fraction in (0.18, 0.32):
        for side in (1, -1):
            candidates.append(
                offset_point(
                    mid_lat,
                    mid_lon,
                    heading + side * math.pi / 2,
                    straight_m * fraction,
                )
            )

    return candidates


# ==================================================
# GET ALTERNATIVE ROUTES
# ==================================================

async def get_alternative_routes(
    source_lat,
    source_lon,
    destination_lat,
    destination_lon,
    mode="walking",
):

    if mode not in OSRM_PROFILES:
        raise RoutingError(f"Unsupported travel mode: {mode}")

    cache_key = (
        mode,
        round(source_lat, 5),
        round(source_lon, 5),
        round(destination_lat, 5),
        round(destination_lon, 5),
    )

    cached = _route_cache.get(cache_key)

    if cached is not None:
        return cached

    source = (source_lat, source_lon)
    destination = (destination_lat, destination_lon)

    async with httpx.AsyncClient(
        timeout=25.0,
        headers={"User-Agent": "LumaPath/1.0 (safety-aware routing)"},
    ) as client:

        via_points = _via_candidates(source, destination)

        results = await asyncio.gather(
            _request_osrm(client, mode, [source, destination], 3),
            *[
                _request_osrm(client, mode, [source, via, destination], False)
                for via in via_points
            ],
        )

    direct_routes = [
        _format_route(route) for route in results[0]
    ]

    via_routes = [
        _format_route(routes[0], via=via)
        for via, routes in zip(via_points, results[1:])
        if routes
    ]

    if not direct_routes and not via_routes:
        raise RoutingError(
            "No route could be found between these locations."
        )

    # OSRM's own alternatives come first, then generated ones.
    candidates = direct_routes + sorted(
        via_routes,
        key=lambda route: route["duration_min"],
    )

    shortest_km = min(route["distance_km"] for route in candidates)

    selected = []
    selected_samples = []

    for route in candidates:

        if len(selected) >= MAX_ROUTES:
            break

        if route["distance_km"] > shortest_km * MAX_DETOUR_RATIO:
            continue

        coordinates = route["geometry"]["coordinates"]

        if route["generated_via_point"] and _doubles_back(coordinates):
            continue

        samples = resample_line(coordinates, spacing_m=80, max_points=300)

        is_duplicate = any(
            route_overlap(samples, existing) > MAX_OVERLAP
            and route_overlap(existing, samples) > MAX_OVERLAP
            for existing in selected_samples
        )

        if is_duplicate:
            continue

        selected.append(route)
        selected_samples.append(samples)

    # Stable, human-friendly ids: fastest first.
    selected.sort(key=lambda route: route["duration_min"])

    for index, route in enumerate(selected):
        route["id"] = f"route-{index + 1}"
        route["name"] = f"Route {chr(ord('A') + index)}"
        route["mode"] = mode

    logger.info(
        "Routing (%s): %d OSRM alternatives, %d via routes, %d kept",
        mode,
        len(direct_routes),
        len(via_routes),
        len(selected),
    )

    _route_cache.set(cache_key, selected)

    return selected
