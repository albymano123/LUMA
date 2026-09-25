"""
Live OpenStreetMap data from the public Overpass servers.

This is the FALLBACK data source, used for trips outside the area
covered by the local geo-database (see geo_context.py). The public
servers are frequently overloaded, so every answer is treated as
possibly missing: when no server gives a trustworthy answer in time
we mark that part of the data unavailable rather than returning empty
lists, so the scorer leaves those factors out and lowers its
confidence instead of treating the route as having no hospitals,
police or activity.

Queries (kept separate so one failing does not cost us the others):

  * emergency services (hospitals, clinics, police, fire stations)
  * "activity" places (shops, food, banks, transit stops, ...)
  * the roads near the route, with their tags (road type, sidewalks,
    lighting, speed limits) - run last and only if the first succeeded,
    so it never competes with them for the servers' rate limits
"""

import asyncio
import hashlib
import logging
import math

import httpx
import numpy as np

from cache import TTLCache
from geo import resample_line
from road_features import QUERY_RADIUS_M, build_network
from road_tags import IGNORED_HIGHWAYS, way_attributes
from settings import ACTIVITY_RADIUS_M, EMERGENCY_RADIUS_M


logger = logging.getLogger("lumapath.overpass")


# ==================================================
# OVERPASS SERVERS
# ==================================================

PRIMARY_SERVER = "https://overpass-api.de/api/interpreter"

FALLBACK_SERVERS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

# Spacing of the polyline we send to Overpass. `around` follows
# the straight segments between these points, so a coarse line is
# accurate enough and keeps the query small.
QUERY_SPACING_M = 300
QUERY_MAX_POINTS = 60

EMERGENCY_AMENITIES = {
    "hospital": "hospital",
    "clinic": "clinic",
    "police": "police",
    "fire_station": "fire_station",
}

ACTIVITY_AMENITIES = (
    "restaurant|cafe|fast_food|food_court|ice_cream|bar|pub|bank|atm|"
    "fuel|pharmacy|bus_station|marketplace|cinema|theatre|library|"
    "townhall|community_centre|post_office|school|college|university"
)

# Start asking the fallback servers if the primary has not answered
# by then, and give up on Overpass entirely after DEADLINE_S. The
# server-side [timeout] is a little shorter so Overpass reports a
# timeout to us instead of us cutting it off mid-answer.
HEDGE_DELAY_S = 6
DEADLINE_S = 20
RETRY_DELAY_S = 1.5
RETRY_MIN_REMAINING_S = 5
SERVER_TIMEOUT_S = 18

# Give up on the optional road query quickly so results are never held up.
ROAD_FETCH_TIMEOUT_S = 10

_context_cache = TTLCache(ttl_seconds=900)


# ==================================================
# BUILD QUERY
# ==================================================

def _polyline_param(coordinates):

    points = resample_line(
        coordinates,
        spacing_m=QUERY_SPACING_M,
        max_points=QUERY_MAX_POINTS,
    )

    return ",".join(
        f"{lat:.5f},{lon:.5f}"
        for lon, lat in points
    )


def _bbox_param(route_geometries, buffer_m):
    """south,west,north,east around every route, plus a buffer."""

    lons = [lon for line in route_geometries for lon, _ in line]
    lats = [lat for line in route_geometries for _, lat in line]

    lat_buffer = buffer_m / 111_320
    lon_buffer = buffer_m / (111_320 * max(0.2, math.cos(math.radians(sum(lats) / len(lats)))))

    return (
        f"{min(lats) - lat_buffer:.5f},{min(lons) - lon_buffer:.5f},"
        f"{max(lats) + lat_buffer:.5f},{max(lons) + lon_buffer:.5f}"
    )


def _wrap(statements):

    return (
        f"[out:json][timeout:{SERVER_TIMEOUT_S}];("
        + "".join(statements)
        + ");out tags center qt;"
    )


def build_emergency_query(route_geometries, mode):
    """
    Emergency services are sparse, so one bounding-box search over
    all routes is cheap for Overpass. route_analyzer then keeps only
    those within EMERGENCY_RADIUS_M of each route.
    """

    return _wrap([
        f'nwr["amenity"~"^({"|".join(EMERGENCY_AMENITIES)})$"]'
        f"({_bbox_param(route_geometries, EMERGENCY_RADIUS_M[mode])});"
    ])


def build_activity_query(route_geometries):
    """Activity places (shops, food, transit...) close to each route."""

    statements = []

    for coordinates in route_geometries:

        line = _polyline_param(coordinates)

        statements.append(
            f'nwr["amenity"~"^({ACTIVITY_AMENITIES})$"]'
            f"(around:{ACTIVITY_RADIUS_M},{line});"
        )
        statements.append(
            f'nwr["shop"](around:{ACTIVITY_RADIUS_M},{line});'
        )
        statements.append(
            f'node["highway"="bus_stop"](around:{ACTIVITY_RADIUS_M},{line});'
        )

    return _wrap(statements)


# ==================================================
# CLASSIFY ELEMENTS
# ==================================================

def _position(element):

    if element.get("lat") is not None:
        return element["lon"], element["lat"]

    center = element.get("center")

    if center:
        return center["lon"], center["lat"]

    return None


def classify_elements(elements):

    emergency = []
    activity = []

    seen = set()

    for element in elements:

        key = (element.get("type"), element.get("id"))

        if key in seen:
            continue

        seen.add(key)

        position = _position(element)

        if position is None:
            continue

        tags = element.get("tags", {})
        amenity = tags.get("amenity")

        if amenity in EMERGENCY_AMENITIES:
            emergency.append({
                "id": f"{element['type']}-{element['id']}",
                "kind": EMERGENCY_AMENITIES[amenity],
                "name": tags.get("name") or tags.get("name:en"),
                "phone": tags.get("phone") or tags.get("contact:phone"),
                "emergency_ward": tags.get("emergency") == "yes",
                "opening_hours": tags.get("opening_hours"),
                "lon": position[0],
                "lat": position[1],
            })

        else:
            activity.append(position)

    return {
        "emergency": emergency,
        "activity": activity,
    }


# ==================================================
# FETCH
# ==================================================

async def _post(client, url, query):

    response = await client.post(url, data={"data": query})
    response.raise_for_status()

    # Overpass sometimes answers 200 with an HTML error page...
    if "json" not in response.headers.get("content-type", ""):
        raise ValueError("Overpass returned a non-JSON response (server busy)")

    data = response.json()

    # ...or with valid JSON whose results were cut short by a
    # server-side timeout or memory limit, reported in "remark".
    remark = data.get("remark") or ""

    if "error" in remark.lower():
        raise ValueError(f"Overpass query incomplete: {remark[:200]}")

    return data


async def _retry_after(delay, client, url, query):

    await asyncio.sleep(delay)

    return await _post(client, url, query)


async def _fetch_with_fallbacks(query):
    """
    Ask the primary server; if it has not answered within
    HEDGE_DELAY_S (or fails), ask the fallbacks too, and take the
    first valid, non-empty answer. Everything stops at DEADLINE_S.

    An empty result is only trusted once two servers agree on it:
    a busy server can return an empty-but-"successful" response,
    and we must not read that as "no hospitals or police here".

    Returns the Overpass JSON, or None if no trustworthy answer
    arrived in time.
    """

    loop = asyncio.get_running_loop()
    deadline = loop.time() + DEADLINE_S

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(DEADLINE_S, connect=5.0),
        headers={"User-Agent": "LumaPath/1.0 (safety-aware routing)"},
    ) as client:

        pending = {
            asyncio.create_task(_post(client, PRIMARY_SERVER, query)): PRIMARY_SERVER
        }
        fallbacks_started = False
        primary_retried = False
        empty_answers = []

        def start_fallbacks():
            for url in FALLBACK_SERVERS:
                pending[asyncio.create_task(_post(client, url, query))] = url

        try:
            while True:

                remaining = deadline - loop.time()

                if remaining <= 0:
                    logger.warning("Overpass: no usable answer within %ss", DEADLINE_S)
                    return None

                if not pending:
                    if fallbacks_started:
                        break
                    start_fallbacks()
                    fallbacks_started = True
                    continue

                wait_for = remaining if fallbacks_started else min(HEDGE_DELAY_S, remaining)

                done, _ = await asyncio.wait(
                    pending,
                    timeout=wait_for,
                    return_when=asyncio.FIRST_COMPLETED,
                )

                if not done:
                    if not fallbacks_started:
                        logger.info("Overpass primary is slow; asking fallback servers too")
                        start_fallbacks()
                        fallbacks_started = True
                    continue

                for task in done:
                    url = pending.pop(task)

                    try:
                        data = task.result()
                    except Exception as error:
                        logger.warning("Overpass server failed (%s): %s", url, error)

                        # The main server often rejects a request as
                        # "too busy" and accepts the same one seconds
                        # later, so give it one more go if time allows.
                        if (
                            url == PRIMARY_SERVER
                            and not primary_retried
                            and deadline - loop.time() > RETRY_MIN_REMAINING_S
                        ):
                            primary_retried = True
                            pending[asyncio.create_task(
                                _retry_after(RETRY_DELAY_S, client, url, query)
                            )] = url

                        continue

                    if data.get("elements"):
                        logger.info("Overpass answered by %s", url)
                        return data

                    empty_answers.append(data)
                    logger.warning("Overpass returned an empty result (%s); confirming with another server", url)

                    if len(empty_answers) >= 2:
                        logger.info("Two servers agree the result is empty")
                        return data

                if not fallbacks_started:
                    start_fallbacks()
                    fallbacks_started = True

        finally:
            for task in pending:
                task.cancel()

    # Every server answered or failed, with at most one empty answer.
    return None


async def _cached_fetch(query):
    """Elements for a query, or None if no reliable answer arrived."""

    cache_key = hashlib.sha1(query.encode()).hexdigest()
    cached = _context_cache.get(cache_key)

    if cached is not None:
        return cached

    data = await _fetch_with_fallbacks(query)

    if data is None:
        # Not cached, so the next request tries again.
        return None

    elements = data.get("elements", [])
    _context_cache.set(cache_key, elements)

    return elements


# ==================================================
# ROADS (tags + geometry, for road-environment features)
# ==================================================

def build_road_query(route_geometries, server_timeout_s=SERVER_TIMEOUT_S):
    """All roads and paths within QUERY_RADIUS_M of any route, with their nodes."""

    ignored = "|".join(sorted(IGNORED_HIGHWAYS))

    statements = "".join(
        f'way["highway"]["highway"!~"^({ignored})$"]'
        f"(around:{QUERY_RADIUS_M},{_polyline_param(coordinates)});"
        for coordinates in route_geometries
    )

    return f"[out:json][timeout:{server_timeout_s}];({statements});out body qt;>;out skel qt;"


def elements_to_ways(elements):
    """Overpass ways (with their nodes) -> dicts for road_features.build_network()."""

    coordinates = {
        element["id"]: (element["lon"], element["lat"])
        for element in elements
        if element.get("type") == "node" and "lat" in element
    }

    ways = []

    for element in elements:

        if element.get("type") != "way":
            continue

        attributes = way_attributes(element.get("tags", {}))

        if attributes is None:
            continue

        points = [coordinates[n] for n in element.get("nodes", []) if n in coordinates]

        if len(points) >= 2:
            ways.append({**attributes, "coords": np.array(points, dtype=float)})

    return ways


# ==================================================
# PUBLIC API
# ==================================================

async def _no_elements():
    return []


async def get_live_context(route_geometries, mode="walking", include_roads=True):
    """
    Live data for the routes. Emergency and activity queries run in
    parallel and succeed or fail independently; the road query runs
    afterwards, and only if emergency data arrived (see module docstring).

    Returns:
      {
        "emergency_available": bool,
        "activity_available": bool,
        "network_available": bool,
        "emergency": [...],
        "activity": [(lon, lat), ...],
        "network": RoadNetwork or None,
      }
    """

    # Street activity is not scored for drivers, and it is the most
    # expensive data to fetch, so it is skipped for them.
    fetch_activity = mode != "driving"

    emergency_elements, activity_elements = await asyncio.gather(
        _cached_fetch(build_emergency_query(route_geometries, mode)),
        _cached_fetch(build_activity_query(route_geometries)) if fetch_activity else _no_elements(),
    )

    emergency = classify_elements(emergency_elements or [])
    activity = classify_elements(activity_elements or [])

    network = None

    if include_roads and emergency_elements is not None:
        network = await _get_road_network(route_geometries)

    context = {
        "emergency_available": emergency_elements is not None,
        "activity_available": activity_elements is not None,
        "network_available": network is not None,
        "emergency": emergency["emergency"],
        "activity": activity["activity"],
        "network": network,
    }

    if not context["emergency_available"]:
        logger.error("No reliable emergency-service data; factor marked unavailable")

    if not context["activity_available"]:
        logger.error("No reliable street-activity data; factor marked unavailable")

    logger.info(
        "Overpass: %d emergency services, %d activity places, road network %s",
        len(context["emergency"]),
        len(context["activity"]),
        "loaded" if network is not None else "unavailable",
    )

    return context


async def _get_road_network(route_geometries):
    """RoadNetwork from Overpass, or None. Never raises: it only enriches the result."""

    try:
        elements = await asyncio.wait_for(
            _cached_fetch(build_road_query(route_geometries)),
            timeout=ROAD_FETCH_TIMEOUT_S,
        )
    except Exception as error:
        logger.warning("Road-network fetch failed: %s", error)
        return None

    if not elements:
        return None

    return build_network(elements_to_ways(elements))
