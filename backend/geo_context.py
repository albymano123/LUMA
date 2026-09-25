"""
Where the map data for a set of routes comes from.

Two providers, one answer shape:

  local     the Kerala geo-database (geodata/). Instant, complete and
            deterministic. Used whenever every route lies inside the
            covered area, with a safety margin from its border.
  overpass  the public Overpass servers (overpass_provider.py). Used
            for trips elsewhere. Slower and can be rate-limited, so
            parts of it may come back unavailable.

Whichever provider answers, callers get the same dictionary and treat
"unavailable" as missing data (never as zero).
"""

import asyncio
import logging
import os

from geodata.store import GeoStore
from overpass_provider import get_live_context
from road_features import QUERY_RADIUS_M, build_network
from settings import (
    ACTIVITY_RADIUS_M,
    EMERGENCY_RADIUS_M,
    GEO_DB_PATH,
    OVERPASS_FALLBACK,
)


logger = logging.getLogger("lumapath.geocontext")


_store = None
_store_checked = False


def get_store():
    """The local GeoStore, or None if the database file is missing or unusable."""

    global _store, _store_checked

    if _store_checked:
        return _store

    _store_checked = True

    if not os.path.exists(GEO_DB_PATH):
        logger.warning(
            "Local geo-database not found at %s; using live Overpass data only. "
            "Build it with: python -m geodata.build",
            GEO_DB_PATH,
        )
        return None

    try:
        _store = GeoStore(GEO_DB_PATH)
        logger.info("Local geo-database loaded: %s", _store.stats())
    except Exception as error:
        logger.error("Local geo-database unusable (%s); using live data only", error)
        _store = None

    return _store


def reset_store():
    """For tests."""

    global _store, _store_checked
    _store = None
    _store_checked = False


def _from_store(store, route_geometries, mode):
    """All map data for the routes from the local database (blocking; run in a thread)."""

    network_ways = store.ways_near(route_geometries, QUERY_RADIUS_M)

    return {
        "source": "local",
        "dataset": store.describe(),
        "emergency_available": True,
        "activity_available": True,
        "network_available": True,
        "buildings_available": True,
        "emergency": store.emergency_services(route_geometries, EMERGENCY_RADIUS_M[mode]),
        "activity": store.activity_places(route_geometries, ACTIVITY_RADIUS_M),
        "network": build_network(network_ways),
        "building_counts": store.building_counts,
    }


async def get_geo_context(route_geometries, mode="walking"):
    """
    Map data for all routes of a trip.

    Keys: source ("local" | "overpass"), dataset, emergency_available,
    activity_available, network_available, buildings_available,
    emergency, activity, network, building_counts (callable or None).
    """

    store = get_store()

    if store is not None and store.covers(route_geometries, EMERGENCY_RADIUS_M[mode]):
        return await asyncio.to_thread(_from_store, store, route_geometries, mode)

    if store is not None:
        logger.info("Trip is outside the local database's area")

    if not OVERPASS_FALLBACK:
        return {
            "source": "none",
            "dataset": None,
            "emergency_available": False,
            "activity_available": False,
            "network_available": False,
            "buildings_available": False,
            "emergency": [],
            "activity": [],
            "network": None,
            "building_counts": None,
        }

    live = await get_live_context(route_geometries, mode)

    return {
        "source": "overpass",
        "dataset": None,
        "buildings_available": False,
        "building_counts": None,
        **live,
    }
