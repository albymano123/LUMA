"""
Current weather along the routes, from Open-Meteo.

Open-Meteo accepts comma-separated coordinate lists, so every
sample point for every route is fetched in one request.
"""

import logging

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


def _cache_key(lat, lon):
    # ~1 km grid: weather does not change meaningfully inside it.
    return (round(lat, 2), round(lon, 2))


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

    params = {
        "latitude": ",".join(f"{points[i][0]:.4f}" for i in missing),
        "longitude": ",".join(f"{points[i][1]:.4f}" for i in missing),
        "current": CURRENT_FIELDS,
        "timezone": "auto",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(WEATHER_URL, params=params)
            response.raise_for_status()
            data = response.json()

    except (httpx.HTTPError, ValueError) as error:
        logger.warning("Weather request failed: %s", error)
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
