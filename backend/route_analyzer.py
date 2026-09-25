"""
Turns raw candidate routes into analysed, explained, ranked routes.

External data is fetched once for all routes, in parallel:

    OSRM routes ─┬─> Overpass (one query for every route)
                 └─> Open-Meteo (one query for every sample point)

and each route is then measured locally against that shared data.
"""

import asyncio
import logging
from datetime import datetime, timezone

import numpy as np

from emergency_service import (
    EMERGENCY_RADIUS_M,
    ACTIVITY_RADIUS_M,
    get_route_context,
)
from geo import distance_matrix_m, haversine_m, resample_line
from ml.predict_model import estimate_for_route
from road_features import get_road_network, road_network_features, route_shape_features
from safety import calculate_safety_score, categorize_routes
from weather_service import get_weather_for_points


logger = logging.getLogger("lumapath.analyzer")


SAMPLE_SPACING_M = 100
SAMPLE_MAX_POINTS = 400

# A lit-tagged road counts towards a route if its centre is this
# close to the route (Overpass matched it within 30 m of the line,
# but the way's centre can sit further along the road).
LIT_ASSIGN_RADIUS_M = 150

# Per kind, so dense hospital data cannot crowd police stations out
# of the list.
MAX_SERVICES_PER_KIND = 15

DISCLAIMER = (
    "Safety scores are estimates based on available open data "
    "(OpenStreetMap and Open-Meteo). They are not a guarantee of "
    "safety. Stay aware of your surroundings and contact local "
    "emergency services if you feel unsafe."
)


# ==================================================
# MEASURE ONE ROUTE AGAINST THE SHARED OSM CONTEXT
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

    samples = resample_line(
        coordinates,
        spacing_m=SAMPLE_SPACING_M,
        max_points=SAMPLE_MAX_POINTS,
    )

    along_km = _cumulative_km(samples)

    metrics = {
        "hospital_access": None,
        "police_access": None,
        "hospital_median_m": None,
        "police_median_m": None,
        "activity_coverage": None,
        "longest_quiet_km": None,
        "lit_ratio": None,
        "lit_tagged_segments": 0,
        "services": [],
    }

    if not samples:
        return metrics

    if context["emergency_available"]:
        metrics.update(_measure_emergency(samples, along_km, context, mode))

    if context["street_available"]:
        metrics.update(_measure_street(samples, along_km, context))

    return metrics


def _measure_emergency(samples, along_km, context, mode):

    # ---------------- emergency services ----------------

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


def _measure_street(samples, along_km, context):

    # ---------------- street activity ----------------

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

    # ---------------- lighting ----------------

    lit_values = []

    if context["lit_segments"]:
        segment_points = [
            [s["lon"], s["lat"]] for s in context["lit_segments"]
        ]

        segment_distances = distance_matrix_m(
            segment_points,
            samples,
        ).min(axis=1)

        lit_values = [
            segment["lit"]
            for segment, distance in zip(
                context["lit_segments"],
                segment_distances,
            )
            if distance <= LIT_ASSIGN_RADIUS_M
        ]

    return {
        "activity_coverage": round(activity_coverage, 3),
        "longest_quiet_km": longest_quiet_km,
        "lit_ratio": (
            round(sum(lit_values) / len(lit_values), 3)
            if lit_values else None
        ),
        "lit_tagged_segments": len(lit_values),
    }


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

def _route_features(coordinates, road_network, metrics):
    """
    Facts about the route's surroundings, each group labelled with
    where it came from. These are environment features, not safety
    or crime data, and they do not change the rule-based score.
    """

    return {
        "route_shape": route_shape_features(coordinates),
        "road_network": road_network_features(coordinates, road_network),
        "emergency": {
            "hospital_median_m": metrics.get("hospital_median_m"),
            "police_median_m": metrics.get("police_median_m"),
        },
        "sources": {
            "route_shape": "routing geometry",
            "road_network": "OpenStreetMap roads near the route",
            "emergency": "OpenStreetMap hospitals, clinics and police stations",
        },
    }


# ==================================================
# ANALYZE ALL ROUTES
# ==================================================

def _recommendation_reason(recommended, routes):

    if recommended.get("safety_score") is None:
        return (
            "Safety data is currently unavailable, so the quickest "
            "route is shown first."
        )

    others = [r for r in routes if r is not recommended and r.get("safety_score") is not None]

    if not others:
        return "This was the only distinct route found for this trip."

    best_other = max(r["safety_score"] for r in others)
    gap = recommended["safety_score"] - best_other

    if gap == 0:
        return (
            "Several routes share the highest safety score, so the "
            "quickest of them is recommended."
        )

    if gap >= 5:
        return (
            f"Highest safety score of the {len(routes)} routes "
            f"({gap} points ahead of the next best)."
        )

    return (
        f"Highest safety score of the {len(routes)} routes, though the "
        "scores are close - compare the alternatives if time matters more."
    )


async def analyze_all_routes(routes, mode="walking"):

    geometries = [route["geometry"]["coordinates"] for route in routes]

    weather_points = []
    route_point_indexes = []

    for coordinates in geometries:
        indexes = []

        for point in _weather_points(coordinates):
            indexes.append(len(weather_points))
            weather_points.append(point)

        route_point_indexes.append(indexes)

    context, weather_readings = await asyncio.gather(
        get_route_context(geometries, mode),
        get_weather_for_points(weather_points),
    )

    # The road-environment query is optional extra detail. It runs only
    # after the essential data arrived, so it can never compete with
    # those queries for the public Overpass servers' rate limit.
    road_network = (
        await get_road_network(geometries)
        if context["emergency_available"]
        else None
    )

    analyzed = []

    for route, coordinates, indexes in zip(routes, geometries, route_point_indexes):

        metrics = measure_route(coordinates, context, mode)
        weather = _combine_weather([weather_readings[i] for i in indexes])

        safety = calculate_safety_score(metrics, weather, mode)

        services = metrics.pop("services")

        hospital_count = sum(s["kind"] in ("hospital", "clinic") for s in services)
        police_count = sum(s["kind"] == "police" for s in services)
        fire_count = sum(s["kind"] == "fire_station" for s in services)

        route_features = _route_features(coordinates, road_network, metrics)

        ml_estimate = estimate_for_route(
            route_features["route_shape"],
            route_features["road_network"],
            route_features["emergency"],
            mode,
        )

        analyzed.append({
            **route,
            **safety,
            "metrics": metrics,
            "weather": weather,
            "emergency_services": _closest_per_kind(services),
            "hospital_count": hospital_count,
            "police_station_count": police_count,
            "fire_station_count": fire_count,
            "route_features": route_features,
            "ml_estimate": ml_estimate,
        })

    recommended = categorize_routes(analyzed)

    logger.info(
        "Analysed %d routes; recommended %s (score %s)",
        len(analyzed),
        recommended["name"] if recommended else None,
        recommended.get("safety_score") if recommended else None,
    )

    return {
        "routes": analyzed,
        "recommended_route_id": recommended["id"] if recommended else None,
        "recommendation_reason": (
            _recommendation_reason(recommended, analyzed)
            if recommended else None
        ),
        "data_sources": {
            "emergency_services": context["emergency_available"],
            "street_activity": context["street_available"],
            "weather": any(weather_readings),
            "road_network": road_network is not None,
        },
        "disclaimer": DISCLAIMER,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
