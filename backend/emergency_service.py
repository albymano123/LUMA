"""
OpenStreetMap context along the candidate routes, via Overpass.

Two Overpass requests (run in parallel) fetch, for every route at once:

  * emergency services (hospitals, clinics, police, fire stations)
    within EMERGENCY_RADIUS_M[mode] of the route
  * "activity" places (shops, food, banks, transit stops, ...)
    within ACTIVITY_RADIUS_M, a proxy for how busy the street is
  * road segments that carry a `lit` tag, for street lighting

The public Overpass servers are frequently overloaded. When no
server gives a trustworthy answer in time we mark that part of
the data unavailable rather than returning empty lists, so the scorer leaves
those factors out and lowers its confidence instead of treating the
route as having no hospitals, police or activity.
"""

import asyncio
import hashlib
import logging
import math

import httpx

from cache import TTLCache
from geo import resample_line


logger = logging.getLogger("lumapath.overpass")


# ==================================================
# OVERPASS SERVERS
# ==================================================

PRIMARY_SERVER = "https://overpass-api.de/api/interpreter"

FALLBACK_SERVERS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

# How far from the route to look for emergency services. Matches
# the distance at which route_analyzer scores access as zero.
EMERGENCY_RADIUS_M = {
    "walking": 2000,
    "cycling": 3000,
    "driving": 5000,
}
ACTIVITY_RADIUS_M = 100
LIGHTING_RADIUS_M = 30

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

LIT_YES = {"yes", "24/7", "automatic", "limited", "interval", "sunset-sunrise"}
LIT_NO = {"no", "disused"}

# Start asking the fallback servers if the primary has not answered
# by then, and give up on Overpass entirely after DEADLINE_S. The
# server-side [timeout] is a little shorter so Overpass reports a
# timeout to us instead of us cutting it off mid-answer.
HEDGE_DELAY_S = 6
DEADLINE_S = 20
RETRY_DELAY_S = 1.5
RETRY_MIN_REMAINING_S = 5
SERVER_TIMEOUT_S = 18

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


def build_street_query(route_geometries, include_activity=True):
    """
    Lit-tagged roads close to each route and, unless disabled,
    activity places. The activity part is by far the heaviest
    (every shop along every route), so it is skipped for driving,
    where it is not scored.
    """

    statements = []

    for coordinates in route_geometries:

        line = _polyline_param(coordinates)

        statements.append(
            f'way["highway"]["lit"](around:{LIGHTING_RADIUS_M},{line});'
        )

        if not include_activity:
            continue

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
    lit_segments = []

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
                "lon": position[0],
                "lat": position[1],
            })

        elif element["type"] == "way" and "highway" in tags and "lit" in tags:
            lit_value = tags["lit"].lower()

            if lit_value in LIT_YES or lit_value in LIT_NO:
                lit_segments.append({
                    "lit": lit_value in LIT_YES,
                    "lon": position[0],
                    "lat": position[1],
                })

        else:
            activity.append(position)

    return {
        "emergency": emergency,
        "activity": activity,
        "lit_segments": lit_segments,
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


async def get_route_context(route_geometries, mode="walking"):
    """
    Runs two Overpass queries in parallel: a light one for emergency
    services and a heavier one for street activity and lighting.
    They succeed or fail independently, so a busy server costing us
    the heavy query does not also cost us emergency-service data.

    Returns:
      {
        "emergency_available": bool,
        "street_available": bool,
        "emergency": [...],
        "activity": [(lon, lat), ...],
        "lit_segments": [...],
      }
    """

    emergency_elements, street_elements = await asyncio.gather(
        _cached_fetch(build_emergency_query(route_geometries, mode)),
        _cached_fetch(
            build_street_query(
                route_geometries,
                include_activity=mode != "driving",
            )
        ),
    )

    emergency = classify_elements(emergency_elements or [])
    street = classify_elements(street_elements or [])

    context = {
        "emergency_available": emergency_elements is not None,
        "street_available": street_elements is not None,
        "emergency": emergency["emergency"],
        "activity": street["activity"],
        "lit_segments": street["lit_segments"],
    }

    if not context["emergency_available"]:
        logger.error("No reliable emergency-service data; factor marked unavailable")

    if not context["street_available"]:
        logger.error("No reliable street activity/lighting data; factors marked unavailable")

    logger.info(
        "Overpass: %d emergency services, %d activity places, %d lit-tagged roads",
        len(context["emergency"]),
        len(context["activity"]),
        len(context["lit_segments"]),
    )

    return context
