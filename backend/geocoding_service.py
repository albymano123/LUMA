"""
Place search and reverse geocoding.

Suggestions-as-you-type use Photon (photon.komoot.io), an
OpenStreetMap geocoder built for autocomplete. Nominatim's usage
policy forbids autocomplete, so it is only used as a fallback for
full searches when Photon is unavailable.

Requests go through the backend so we can cache them, set a proper
User-Agent, and keep users' partial search text out of third-party
logs as far as possible.
"""

import logging

import httpx

from cache import TTLCache


logger = logging.getLogger("lumapath.geocoding")


PHOTON_SEARCH_URL = "https://photon.komoot.io/api/"
PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"

HEADERS = {"User-Agent": "LumaPath/1.0 (safety-aware routing)"}

_search_cache = TTLCache(ttl_seconds=3600, max_items=2000)
_reverse_cache = TTLCache(ttl_seconds=3600, max_items=500)


# ==================================================
# FORMAT PHOTON RESULT
# ==================================================

def _format_photon(feature):

    properties = feature.get("properties", {})
    lon, lat = feature["geometry"]["coordinates"]

    street = " ".join(
        part for part in (
            properties.get("housenumber"),
            properties.get("street"),
        ) if part
    )

    name = properties.get("name") or street or properties.get("city")

    context = []

    for part in (
        street if properties.get("name") else None,
        properties.get("district") or properties.get("locality"),
        properties.get("city") or properties.get("county"),
        properties.get("state"),
        properties.get("country"),
    ):
        if part and part != name and part not in context:
            context.append(part)

    return {
        "id": f"{properties.get('osm_type', '')}{properties.get('osm_id', '')}",
        "name": name or "Unnamed place",
        "description": ", ".join(context),
        "type": properties.get("osm_value") or properties.get("type"),
        "lat": lat,
        "lon": lon,
    }


def _format_nominatim(item):

    parts = [p.strip() for p in item.get("display_name", "").split(",")]

    return {
        "id": f"{item.get('osm_type', '')}{item.get('osm_id', '')}",
        "name": parts[0] if parts else "Unnamed place",
        "description": ", ".join(parts[1:4]),
        "type": item.get("type"),
        "lat": float(item["lat"]),
        "lon": float(item["lon"]),
    }


# ==================================================
# SEARCH
# ==================================================

async def search_places(query, near_lat=None, near_lon=None, limit=6):

    query = query.strip()

    if len(query) < 3:
        return []

    bias = (
        (round(near_lat, 1), round(near_lon, 1))
        if near_lat is not None and near_lon is not None
        else None
    )

    cache_key = (query.lower(), bias, limit)
    cached = _search_cache.get(cache_key)

    if cached is not None:
        return cached

    params = {"q": query, "limit": limit, "lang": "en"}

    if bias:
        params["lat"], params["lon"] = bias

    results = []

    async with httpx.AsyncClient(timeout=8.0, headers=HEADERS) as client:

        try:
            response = await client.get(PHOTON_SEARCH_URL, params=params)
            response.raise_for_status()

            results = [
                _format_photon(feature)
                for feature in response.json().get("features", [])
            ]

        except (httpx.HTTPError, ValueError, KeyError) as error:
            logger.warning("Photon search failed, trying Nominatim: %s", error)

            try:
                response = await client.get(
                    NOMINATIM_SEARCH_URL,
                    params={"q": query, "format": "json", "limit": limit},
                )
                response.raise_for_status()

                results = [_format_nominatim(item) for item in response.json()]

            except (httpx.HTTPError, ValueError, KeyError) as fallback_error:
                logger.warning("Nominatim search failed: %s", fallback_error)
                return []

    # Photon can return the same place several times (node + way).
    unique = []
    seen = set()

    for result in results:
        key = (result["name"], result["description"])

        if key not in seen:
            seen.add(key)
            unique.append(result)

    _search_cache.set(cache_key, unique)

    return unique


# ==================================================
# REVERSE GEOCODE
# ==================================================

async def reverse_geocode(lat, lon):

    cache_key = (round(lat, 4), round(lon, 4))
    cached = _reverse_cache.get(cache_key)

    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=8.0, headers=HEADERS) as client:
            response = await client.get(
                PHOTON_REVERSE_URL,
                params={"lat": lat, "lon": lon, "lang": "en"},
            )
            response.raise_for_status()
            features = response.json().get("features", [])

    except (httpx.HTTPError, ValueError) as error:
        logger.warning("Reverse geocoding failed: %s", error)
        features = []

    if features:
        place = _format_photon(features[0])
        place["lat"], place["lon"] = lat, lon
    else:
        place = {
            "id": f"point-{lat:.5f},{lon:.5f}",
            "name": "Selected location",
            "description": f"{lat:.5f}, {lon:.5f}",
            "type": "point",
            "lat": lat,
            "lon": lon,
        }

    _reverse_cache.set(cache_key, place)

    return place
