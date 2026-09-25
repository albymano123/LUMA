"""
Turns raw candidate routes into analysed, explained, ranked routes.

Map data comes from geo_context (the local Kerala database, or live
Overpass outside it) and weather from Open-Meteo. Both are fetched once
for ALL routes, in parallel, and each route is then measured locally
against that shared data:

    OSRM routes ─┬─> geo_context   (local database / Overpass fallback)
                 └─> Open-Meteo    (one request for every sample point)

Nothing here invents data: whatever could not be loaded is reported
as unavailable and the safety engine lowers its confidence.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone

import numpy as np

from geo import distance_matrix_m, haversine_m, resample_line
from geo_context import get_geo_context
from ml.predict_model import estimate_for_route
from road_features import road_network_features, route_shape_features
from safety import calculate_safety_score, categorize_routes
from settings import ACTIVITY_RADIUS_M, BUILT_UP_MIN_BUILDINGS, EMERGENCY_RADIUS_M
from weather_service import get_weather_for_points


logger = logging.getLogger("lumapath.analyzer")


SAMPLE_SPACING_M = 100
SAMPLE_MAX_POINTS = 400

BUILDING_SPACING_M = 50
BUILDING_MAX_POINTS = 600

# Per kind, so dense hospital data cannot crowd police stations out
# of the list.
MAX_SERVICES_PER_KIND = 15

DISCLAIMER = (
    "Safety scores are estimates based on available open data "
    "(OpenStreetMap and Open-Meteo). They are not a guarantee of "
    "safety and are not built from crime records. Map completeness "
    "varies. Stay aware of your surroundings and contact local "
    "emergency services if you feel unsafe."
)


# ==================================================
# MEASURE ONE ROUTE AGAINST THE SHARED MAP DATA
# ==================================================

def _cumulative_km(samples):

    distances = [0.0]

    for a, b in zip(samples, samples[1:]):
        distances.append(
            distances[-1] + haversine_m(a[1], a[0], b[1], b[0]) / 1000
        )

    return distances


def _longest_run_km(mask, along_km):
    """Longest continuous stretch (km) where mask is True."""

    longest = 0.0
    start = None

    for index, value in enumerate(mask):

        if value and start is None:
            start = index

        if (not value or index == len(mask) - 1) and start is not None:
            end = index if value else index - 1
            longest = max(longest, along_km[end] - along_km[start])
            start = None

    return round(longest, 2)


# Distance to the nearest hospital / police station at which the
# access score starts to fall, and where it reaches zero. Drivers
# can reasonably cover more ground than people on foot.
ACCESS_DISTANCE_M = {
    "walking": (500, EMERGENCY_RADIUS_M["walking"]),
    "cycling": (1000, EMERGENCY_RADIUS_M["cycling"]),
    "driving": (1500, EMERGENCY_RADIUS_M["driving"]),
}


def _access_score(nearest_m, mode):
    """Mean 0-1 access along the route from per-sample distances."""

    full, zero = ACCESS_DISTANCE_M[mode]

    return float(np.clip((zero - nearest_m) / (zero - full), 0, 1).mean())


def measure_route(coordinates, context, mode="walking"):
    """All measurements for one route; anything unavailable stays None."""

    samples = resample_line(
        coordinates,
        spacing_m=SAMPLE_SPACING_M,
        max_points=SAMPLE_MAX_POINTS,
    )

    metrics = {
        "hospital_access": None,
        "police_access": None,
        "hospital_median_m": None,
        "police_median_m": None,
        "activity_coverage": None,
        "longest_quiet_km": None,
        "built_up_share": None,
        "longest_unbuilt_km": None,
        "lit_ratio": None,
        "lit_coverage": None,
        "lit_tagged_segments": 0,
        "services": [],
    }

    road = road_network_features(coordinates, context.get("network"))
    metrics["road"] = road

    if road.get("available"):
        metrics.update({
            "lit_ratio": road["lit_share"],
            "lit_coverage": road["lit_coverage"],
            "lit_tagged_segments": road["lit_tagged_segments"],
            "major_road_share": road["major_road_share"],
            "sidewalk_share": road["sidewalk_share"],
            "sidewalk_coverage": road["sidewalk_coverage"],
            "maxspeed_mean_kmh": road["maxspeed_mean_kmh"],
            "maxspeed_coverage": road["maxspeed_coverage"],
        })

    if not samples:
        return metrics

    along_km = _cumulative_km(samples)

    if context["emergency_available"]:
        metrics.update(_measure_emergency(samples, along_km, context, mode))

    if context["activity_available"]:
        metrics.update(_measure_activity(samples, along_km, context))

    if context.get("buildings_available") and context.get("building_counts"):
        metrics.update(_measure_buildings(coordinates, context))

    return metrics


def _measure_emergency(samples, along_km, context, mode):

    services = context["emergency"]
    service_points = [[s["lon"], s["lat"]] for s in services]

    hospital_access = 0.0
    police_access = 0.0
    hospital_median_m = None
    police_median_m = None
    nearby = []

    if services:
        # rows: samples, columns: services
        distances = distance_matrix_m(samples, service_points)

        kinds = np.array([s["kind"] for s in services])
        is_hospital = np.isin(kinds, ["hospital", "clinic"])
        is_police = kinds == "police"

        if is_hospital.any():
            nearest = distances[:, is_hospital].min(axis=1)
            hospital_access = _access_score(nearest, mode)
            hospital_median_m = int(np.median(nearest))

        if is_police.any():
            nearest = distances[:, is_police].min(axis=1)
            police_access = _access_score(nearest, mode)
            police_median_m = int(np.median(nearest))

        nearest_sample = distances.argmin(axis=0)
        nearest_distance = distances.min(axis=0)

        for index, service in enumerate(services):

            if nearest_distance[index] > EMERGENCY_RADIUS_M[mode]:
                continue

            nearby.append({
                **service,
                "distance_m": int(nearest_distance[index]),
                "along_route_km": round(along_km[nearest_sample[index]], 2),
            })

    nearby.sort(key=lambda s: s["distance_m"])

    return {
        "hospital_access": round(hospital_access, 3),
        "police_access": round(police_access, 3),
        "hospital_median_m": hospital_median_m,
        "police_median_m": police_median_m,
        "services": nearby,
    }


def _measure_activity(samples, along_km, context):

    activity_coverage = 0.0
    longest_quiet_km = round(along_km[-1], 2)

    if context["activity"]:
        activity_distances = distance_matrix_m(
            samples,
            context["activity"],
        ).min(axis=1)

        active = activity_distances <= ACTIVITY_RADIUS_M
        activity_coverage = float(active.mean())
        longest_quiet_km = _longest_run_km(~active, along_km)

    return {
        "activity_coverage": round(activity_coverage, 3),
        "longest_quiet_km": longest_quiet_km,
    }


def _measure_buildings(coordinates, context):
    """How much of the route has mapped buildings nearby, and the longest empty stretch."""

    samples = resample_line(
        coordinates,
        spacing_m=BUILDING_SPACING_M,
        max_points=BUILDING_MAX_POINTS,
    )

    if len(samples) < 2:
        return {}

    counts = context["building_counts"](samples)
    built = counts >= BUILT_UP_MIN_BUILDINGS
    along_km = _cumulative_km(samples)

    return {
        "built_up_share": round(float(built.mean()), 3),
        "longest_unbuilt_km": _longest_run_km(~built, along_km),
        "highlights": _isolated_stretches(samples, ~built, along_km),
    }


# Stretches shorter than this are not worth pointing out on the map.
MIN_HIGHLIGHT_KM = 0.25
MAX_HIGHLIGHTS = 6


def _isolated_stretches(samples, unbuilt, along_km):
    """
    The longest unbroken stretches with no mapped buildings nearby, with
    the coordinates to draw them. These are real measurements of the
    route, shown on the map's "Safety factors" layer.
    """

    stretches = []
    start = None

    for index, value in enumerate(unbuilt):

        if value and start is None:
            start = index

        if start is not None and (not value or index == len(unbuilt) - 1):
            end = index if value else index - 1
            length = along_km[end] - along_km[start]

            if length >= MIN_HIGHLIGHT_KM:
                stretches.append({
                    "kind": "unbuilt",
                    "label": "No mapped buildings nearby",
                    "from_km": round(along_km[start], 2),
                    "to_km": round(along_km[end], 2),
                    "length_km": round(length, 2),
                    "coordinates": [[round(lon, 6), round(lat, 6)] for lon, lat in samples[start:end + 1]],
                })

            start = None

    stretches.sort(key=lambda stretch: -stretch["length_km"])

    return sorted(stretches[:MAX_HIGHLIGHTS], key=lambda stretch: stretch["from_km"])


def _closest_per_kind(services):
    """services are sorted by distance; keep the nearest N of each kind."""

    kept = []
    per_kind = {}

    for service in services:
        count = per_kind.get(service["kind"], 0)

        if count < MAX_SERVICES_PER_KIND:
            kept.append(service)
            per_kind[service["kind"]] = count + 1

    return kept


# ==================================================
# WEATHER
# ==================================================

def _weather_points(coordinates):
    """Start, middle and end of a route as (lat, lon)."""

    if not coordinates:
        return []

    picks = [
        coordinates[0],
        coordinates[len(coordinates) // 2],
        coordinates[-1],
    ]

    return [(lat, lon) for lon, lat in picks]


def _combine_weather(readings):

    readings = [r for r in readings if r]

    if not readings:
        return None

    def mean(key):
        values = [r[key] for r in readings if r.get(key) is not None]
        return round(sum(values) / len(values), 1) if values else None

    visibilities = [r["visibility"] for r in readings if r.get("visibility") is not None]
    codes = [r["weather_code"] for r in readings if r.get("weather_code") is not None]

    return {
        "temperature": mean("temperature"),
        "apparent_temperature": mean("apparent_temperature"),
        "precipitation": mean("precipitation"),
        "wind_speed": mean("wind_speed"),
        # Report the worst conditions met along the way.
        "visibility": min(visibilities) if visibilities else None,
        "weather_code": max(codes) if codes else None,
        "is_day": readings[0]["is_day"],
        "time": readings[0].get("time"),
    }


# ==================================================
# ROUTE ENVIRONMENT FEATURES
# ==================================================

def _route_features(coordinates, metrics):
    """
    Facts about the route's surroundings, each group labelled with
    where it came from. These are environment features, not safety
    or crime data. They feed the experimental ML component and are
    shown to the user as plain map facts.
    """

    road = metrics.get("road") or {"available": False}

    return {
        "route_shape": route_shape_features(coordinates),
        "road_network": road,
        "surroundings": {
            "built_up_share": metrics.get("built_up_share"),
            "longest_unbuilt_km": metrics.get("longest_unbuilt_km"),
        },
        "emergency": {
            "hospital_median_m": metrics.get("hospital_median_m"),
            "police_median_m": metrics.get("police_median_m"),
        },
        "sources": {
            "route_shape": "routing geometry",
            "road_network": "OpenStreetMap roads near the route",
            "surroundings": "OpenStreetMap buildings near the route",
            "emergency": "OpenStreetMap hospitals, clinics and police stations",
        },
    }


# ==================================================
# ANALYZE ALL ROUTES
# ==================================================

def _geo_source(context):

    if context["source"] == "local":
        dataset = context["dataset"] or {}
        return {
            "type": "local",
            "label": dataset.get("source") or "Local OpenStreetMap database",
            "date": dataset.get("extract_date"),
        }

    if context["source"] == "overpass":
        return {
            "type": "live",
            "label": "OpenStreetMap via public Overpass servers",
            "date": None,
        }

    return {"type": "none", "label": "No map data source available", "date": None}


def _data_sources(context, weather_readings):
    """Which data sets loaded. Only sets that this trip needed are listed."""

    sources = {
        "emergency_services": context["emergency_available"],
        "street_activity": context["activity_available"],
        "road_network": context["network_available"],
        "weather": any(weather_readings),
    }

    if context["source"] == "local":
        sources["buildings"] = context["buildings_available"]

    return sources


async def analyze_all_routes(routes, mode="walking", progress=None):

    started = time.monotonic()
    geometries = [route["geometry"]["coordinates"] for route in routes]

    weather_points = []
    route_point_indexes = []

    for coordinates in geometries:
        indexes = []

        for point in _weather_points(coordinates):
            indexes.append(len(weather_points))
            weather_points.append(point)

        route_point_indexes.append(indexes)

    async def load_map_data():
        loaded = await get_geo_context(geometries, mode)

        if progress is not None:
            await progress("map_data", {
                "source": loaded["source"],
                "emergency_services": loaded["emergency_available"],
                "road_network": loaded["network_available"],
            })

        return loaded

    context, weather_readings = await asyncio.gather(
        load_map_data(),
        get_weather_for_points(weather_points),
    )

    fetched = time.monotonic()

    analyzed = []

    for route, coordinates, indexes in zip(routes, geometries, route_point_indexes):

        metrics = measure_route(coordinates, context, mode)
        weather = _combine_weather([weather_readings[i] for i in indexes])

        safety = calculate_safety_score(metrics, weather, mode)

        services = metrics.pop("services")
        highlights = metrics.pop("highlights", [])
        route_features = _route_features(coordinates, metrics)

        ml_estimate = estimate_for_route(
            route_features["route_shape"],
            route_features["road_network"],
            route_features["surroundings"],
            route_features["emergency"],
            mode,
        )

        # The detailed road measurements live in route_features.
        metrics.pop("road", None)

        analyzed.append({
            **route,
            **safety,
            "metrics": metrics,
            "weather": weather,
            "emergency_services": _closest_per_kind(services),
            "hospital_count": sum(s["kind"] in ("hospital", "clinic") for s in services),
            "police_station_count": sum(s["kind"] == "police" for s in services),
            "fire_station_count": sum(s["kind"] == "fire_station" for s in services),
            "highlights": highlights,
            "route_features": route_features,
            "ml_estimate": ml_estimate,
        })

    recommendation = categorize_routes(analyzed)

    logger.info(
        "Analysed %d routes via %s data (fetch %.2fs, measure %.2fs); recommendation: %s",
        len(analyzed),
        context["source"],
        fetched - started,
        time.monotonic() - fetched,
        recommendation["state"],
    )

    return {
        "routes": analyzed,
        "recommendation": recommendation,
        # Kept at the top level for simple clients.
        "recommended_route_id": recommendation["route_id"],
        "recommendation_reason": recommendation["reason"],
        "default_route_id": recommendation["default_route_id"],
        "data_sources": _data_sources(context, weather_readings),
        "geo_source": _geo_source(context),
        "disclaimer": DISCLAIMER,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
