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

import asyncio
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

# LumaPath is for India, and above all Kerala: suggestions are limited to
# India, and places in Kerala are listed first.
KERALA_BBOX = (74.8, 8.1, 77.5, 12.9)      # min lon, min lat, max lon, max lat
INDIA_BBOX = (68.0, 6.5, 97.5, 35.7)
KERALA_CENTRE = (10.5, 76.4)


def _bbox(box):
    return ",".join(str(value) for value in box)


def _in_india(feature):
    # Photon reports a country code; anything that is not India is dropped.
    return feature.get("properties", {}).get("countrycode") in (None, "IN")


async def _photon(client, query, limit, bias, bbox):

    response = await client.get(
        PHOTON_SEARCH_URL,
        params={
            "q": query, "limit": limit, "lang": "en",
            "lat": bias[0], "lon": bias[1], "bbox": _bbox(bbox),
        },
    )
    response.raise_for_status()

    return [
        _format_photon(feature)
        for feature in response.json().get("features", [])
        if _in_india(feature)
    ]


async def _photon_or_none(client, query, limit, bias, bbox):
    """
    None means this one call failed; [] means it succeeded with no matches.
    The India-wide bbox is a much bigger search than the Kerala one and can
    time out on its own, well after the Kerala call already succeeded - the
    two are run with asyncio.gather() and must not fail together, or a slow
    India-wide search silently throws away a fast, correct Kerala result.
    """

    try:
        return await _photon(client, query, limit, bias, bbox)
    except (httpx.HTTPError, ValueError, KeyError) as error:
        logger.warning("Photon search failed for bbox=%s: %s", bbox, error)
        return None


async def _nominatim(client, query, limit, bbox, bounded):
    west, south, east, north = bbox

    response = await client.get(
        NOMINATIM_SEARCH_URL,
        params={
            "q": query, "format": "json", "limit": limit,
            "countrycodes": "in",
            "viewbox": f"{west},{north},{east},{south}",
            "bounded": 1 if bounded else 0,
        },
    )
    response.raise_for_status()

    return [_format_nominatim(item) for item in response.json()]


async def _nominatim_or_none(client, query, limit, bbox, bounded):
    """
    Same independent-failure shape as _photon_or_none, and for the same
    reason: this only runs once Photon is already down, and a flaky second
    provider must not be allowed to turn a working Kerala result into no
    result at all.
    """

    try:
        return await _nominatim(client, query, limit, bbox, bounded)
    except (httpx.HTTPError, ValueError, KeyError) as error:
        logger.warning("Nominatim search failed for bbox=%s: %s", bbox, error)
        return None


def _unique(results):
    """Photon (and occasionally Nominatim) can return the same place twice."""

    unique = []
    seen = set()

    for result in results:
        key = (result["name"], result["description"])

        if key not in seen:
            seen.add(key)
            unique.append(result)

    return unique


def _kerala_first(kerala, india, limit):
    """
    Merges two already-geographically-restricted result sets (one Kerala,
    one India-wide) Kerala first, at most 5 of them, so a well-known place
    elsewhere in India is not pushed out by weaker matches in Kerala.
    Either side may be None (that search failed on its own): the other's
    real results still stand rather than being thrown away too. Used for
    both Photon and the Nominatim fallback, so Kerala-first is guaranteed
    the same way no matter which of the two ends up answering the request.
    """

    if kerala is None and india is None:
        return None

    return _unique((kerala or [])[:5] + (india or []))[:limit]


async def search_places(query, near_lat=None, near_lon=None, limit=8):
    """
    Place suggestions for India, Kerala first.

    Two searches run together: one restricted to Kerala and one to India.
    Kerala's results come first; the rest of India fills any remaining
    slots, so a Kerala town is never buried under a same-named place far
    away, while places elsewhere in India can still be found.
    """

    query = query.strip()

    if len(query) < 3:
        return []

    # Bias towards the other end of the trip when the trip is in Kerala,
    # otherwise towards Kerala's centre.
    other_end_in_kerala = (
        near_lat is not None
        and near_lon is not None
        and KERALA_BBOX[1] <= near_lat <= KERALA_BBOX[3]
        and KERALA_BBOX[0] <= near_lon <= KERALA_BBOX[2]
    )
    bias = (round(near_lat, 1), round(near_lon, 1)) if other_end_in_kerala else KERALA_CENTRE

    cache_key = (query.lower(), bias, limit)
    cached = _search_cache.get(cache_key)

    if cached is not None:
        return cached

    results = []

    async with httpx.AsyncClient(timeout=8.0, headers=HEADERS) as client:

        kerala, india = await asyncio.gather(
            _photon_or_none(client, query, limit, bias, KERALA_BBOX),
            _photon_or_none(client, query, limit, bias, INDIA_BBOX),
        )

        merged = _kerala_first(kerala, india, limit)

        if merged is not None:
            results = merged

        else:
            logger.warning("Both Photon searches failed, trying Nominatim")

            # Same Kerala-bounded + India-wide shape as Photon, and the same
            # independent-failure + Kerala-first merge, so a flaky Nominatim
            # cannot silently lose Kerala's own results either, and Kerala
            # is never just a soft viewbox preference on this path.
            kerala_n, india_n = await asyncio.gather(
                _nominatim_or_none(client, query, limit, KERALA_BBOX, bounded=True),
                _nominatim_or_none(client, query, limit, INDIA_BBOX, bounded=False),
            )

            merged = _kerala_first(kerala_n, india_n, limit)

            if merged is None:
                logger.warning("Both Nominatim searches also failed")
                return []

            results = merged

    _search_cache.set(cache_key, results)

    return results


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
