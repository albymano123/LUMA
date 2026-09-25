"""
Current weather along the routes, from Open-Meteo.

Open-Meteo accepts comma-separated coordinate lists, so every
sample point for every route is fetched in one request.
"""

import logging
import time

import httpx

from cache import TTLCache


logger = logging.getLogger("lumapath.weather")


WEATHER_URL = "https://api.open-meteo.com/v1/forecast"

CURRENT_FIELDS = (
    "temperature_2m,"
    "apparent_temperature,"
    "weather_code,"
    "precipitation,"
    "wind_speed_10m,"
    "visibility,"
    "is_day"
)

_weather_cache = TTLCache(ttl_seconds=600)

# Open-Meteo normally answers in well under a second. A slow or failing
# service must not hold up route analysis: give it a few seconds, and
# after a failure skip it for a minute (weather is then reported as
# unavailable, and the score says so).
WEATHER_TIMEOUT_S = 4.0
FAILURE_PAUSE_S = 60

_paused_until = 0.0


# Weather changes slowly across space (the forecast model's own grid is
# several kilometres wide), so readings are shared inside ~5 km cells.
# This lets the API start fetching weather while routes are still being
# computed: the start, middle and end of the trip cover almost every
# point a route will later ask about.
CELL_DEG = 0.05


def _cache_key(lat, lon):
    return (round(lat / CELL_DEG), round(lon / CELL_DEG))


def cell_centres(south, west, north, east, pad_deg=0.03, max_cells=12):
    """
    Centres of every weather cell covering a trip's area (padded, since
    routes wander), or None when that would be too many for one request.
    """

    rows = range(round((south - pad_deg) / CELL_DEG), round((north + pad_deg) / CELL_DEG) + 1)
    columns = range(round((west - pad_deg) / CELL_DEG), round((east + pad_deg) / CELL_DEG) + 1)

    if len(rows) * len(columns) > max_cells:
        return None

    return [(i * CELL_DEG, j * CELL_DEG) for i in rows for j in columns]


def _parse(current):

    return {
        "temperature": current.get("temperature_2m"),
        "apparent_temperature": current.get("apparent_temperature"),
        "weather_code": current.get("weather_code"),
        "precipitation": current.get("precipitation"),
        "wind_speed": current.get("wind_speed_10m"),
        "visibility": current.get("visibility"),
        "is_day": bool(current.get("is_day", 1)),
        "time": current.get("time"),
    }


async def get_weather_for_points(points):
    """
    points: list of (lat, lon)

    Returns a list aligned with `points`. An entry is None when
    weather for that point could not be fetched; callers must not
    treat a missing reading as "no rain".
    """

    global _paused_until

    results = [
        _weather_cache.get(_cache_key(lat, lon))
        for lat, lon in points
    ]

    missing = [
        index
        for index, value in enumerate(results)
        if value is None
    ]

    if not missing:
        return results

    if time.monotonic() < _paused_until:
        logger.debug("Weather service paused after a recent failure")
        return results

    params = {
        "latitude": ",".join(f"{points[i][0]:.4f}" for i in missing),
        "longitude": ",".join(f"{points[i][1]:.4f}" for i in missing),
        "current": CURRENT_FIELDS,
        "timezone": "auto",
    }

    try:
        async with httpx.AsyncClient(timeout=WEATHER_TIMEOUT_S) as client:
            response = await client.get(WEATHER_URL, params=params)
            response.raise_for_status()
            data = response.json()

    except (httpx.HTTPError, ValueError) as error:
        _paused_until = time.monotonic() + FAILURE_PAUSE_S
        logger.warning("Weather request failed (%s); pausing weather for %ss", type(error).__name__, FAILURE_PAUSE_S)
        return results

    # A single location comes back as an object, several as a list.
    if isinstance(data, dict):
        data = [data]

    for index, location in zip(missing, data):
        current = location.get("current")

        if not current:
            continue

        reading = _parse(current)
        results[index] = reading
        _weather_cache.set(_cache_key(*points[index]), reading)

    return results


# Kept for anything that still wants a single reading.
async def get_weather(latitude, longitude):

    reading, = await get_weather_for_points([(latitude, longitude)])

    return reading


async def prefetch(points):
    """
    Warm the cache for `points`; never raises (this is only an optimisation).
    Returns whether any reading was obtained.
    """

    try:
        return any(await get_weather_for_points(points))
    except Exception as error:
        logger.debug("Weather prefetch failed: %s", error)
        return False
