"""
The feature vector shared by the real-data risk model's training table
(risk_dataset.py, built from real UK DfT STATS19 collision and
casualty records) and its live inference (risk_model.py, fed by
LumaPath's own real route and weather data). One shared, named feature
schema for both is the same discipline ml/features.py already uses for
the rule-distillation model: training and live inference cannot
silently drift apart.

No Kerala- or India-specific, geocoded road-collision dataset is
publicly available (see ml/README.md for the earlier, still-unresolved
search for one). STATS19 is Great Britain's official, person-level,
open road-collision dataset (data.dft.gov.uk). This project uses the
CASUALTY-level records for pedestrians and pedal cyclists specifically
(casualty_type 0 and 1), not collisions in general, for two reasons:
first, the relationship between vehicle speed and the severity of
injury to a pedestrian or cyclist is one of the most consistently
replicated findings in road-safety research (unlike overall collision
severity, which depends heavily on vehicle-to-vehicle factors this
project has no data on), so it is the more learnable real target;
second, it is the travel modes LumaPath weighs road/traffic exposure
and lighting most heavily for (safety.py's WEIGHTS table), so it is
also the most relevant one. The model therefore applies to walking and
cycling routes; for driving, ml/risk_model.py reports
"unsupported_mode" rather than a guess, the same convention
ml/predict_model.py already uses for its own, separately-scoped model.

This is an honest, documented limitation, not a hidden one: the model
learns a feature-based relationship between real-world road/weather
conditions and real casualty severity, generalised to Kerala routes
through the same real, measured features LumaPath already computes
(road class, speed limit, junction presence, lighting, weather) - not
through location. It does not predict crime, and it does not predict
whether a collision will occur (STATS19 has no traffic-exposure
denominator to support that); it predicts how severe one tends to be,
for a pedestrian or cyclist, given conditions like these.
"""

import math
from datetime import datetime, timedelta, timezone

# LumaPath is an India/Kerala-focused product (place search, default
# region, Overpass/local-database coverage); "now" for the time-of-day
# feature is the current time in India, not the server's.
INDIA_TZ = timezone(timedelta(hours=5, minutes=30))

FEATURE_COLUMNS = [
    "major_road",             # share of the route on a motorway/trunk/primary/A-road; STATS19: first_road_class in {Motorway, A(M), A}
    "speed_limit_kmh",        # STATS19 speed_limit (mph) * 1.60934; LumaPath: maxspeed_mean_kmh
    "at_junction",             # probability a given point is at/near a junction; STATS19: junction_detail != "not at junction"
    "daylight",                # STATS19: light_conditions == Daylight; LumaPath: is_day
    "dark_lit",                 # STATS19: light_conditions == Darkness, lights lit; LumaPath: not is_day, weighted by lit_share
    "dark_unlit",               # STATS19: light_conditions == Darkness, lights unlit/none; LumaPath: not is_day, weighted by (1 - lit_share)
    "raining",                  # STATS19: weather_conditions involves rain; LumaPath: precipitation > rain threshold
    "snowing",                  # STATS19: weather_conditions involves snow; LumaPath: weather_code in the WMO snow range
    "high_wind",                # STATS19: weather_conditions "+ high winds"; LumaPath: wind_speed > wind threshold
    "fog_or_poor_visibility",   # STATS19: weather_conditions == Fog or mist; LumaPath: weather_code fog/haze or low visibility
    "urban",                    # STATS19: urban_or_rural_area == Urban; LumaPath: built_up_share
    "is_cyclist",                # STATS19 casualty_type == 1; LumaPath: mode == "cycling" (vs. "walking" == pedestrian, the reference level)
    "hour_sin", "hour_cos",      # cyclical encoding of time of day; STATS19: collision time; LumaPath: the current time, in India Standard Time
    "is_weekend",                 # STATS19: day_of_week; LumaPath: the current date, in India Standard Time
]

# Same thresholds safety.py's score_weather uses, so the mapping from a
# real live weather reading to a STATS19-style weather category is
# consistent with the rest of the system rather than a second,
# independently-invented set of numbers.
RAIN_MM = 0.2
WIND_KMH = 30
FOG_VISIBILITY_M = 1000
FOG_WEATHER_CODES = (45, 48)
# WMO weather codes (Open-Meteo uses the WMO 4677 table) for snowfall
# and snow showers.
SNOW_WEATHER_CODES = (71, 73, 75, 77, 85, 86)

# A route's junctions_per_km (junctions per kilometre of road) converted
# to an approximate probability that a given point on it is "at/near a
# junction" in the STATS19 sense (within 20 m). One junction's 20 m-radius
# influence covers about 0.04 km of a route; this is a documented,
# approximate, monotonic conversion, not a measured probability.
JUNCTION_INFLUENCE_KM = 0.04

# casualty_type codes this model is trained on.
PEDESTRIAN_CASUALTY_TYPE = 0
CYCLIST_CASUALTY_TYPE = 1

# The travel modes this model supports (see the module docstring).
SUPPORTED_MODES = ("walking", "cycling")


def _get(source, key, default=0.0):
    if not source:
        return default

    value = source.get(key)

    return default if value is None else value


def _hour_cyclic(hour):
    radians = 2 * math.pi * hour / 24
    return math.sin(radians), math.cos(radians)


def stats19_row_features(collision_row, casualty_type):
    """collision_row: a dict-like with the real STATS19 collision
    columns used. casualty_type: 0 (pedestrian) or 1 (cyclist), from
    the matching real casualty record. Returns a FEATURE_COLUMNS dict,
    or None if the row is missing data this mapping needs."""

    first_road_class = collision_row.get("first_road_class")
    speed_limit_mph = collision_row.get("speed_limit")
    junction_detail = collision_row.get("junction_detail")
    light = collision_row.get("light_conditions")
    weather = collision_row.get("weather_conditions")
    urban_rural = collision_row.get("urban_or_rural_area")
    time_str = collision_row.get("time")
    day_of_week = collision_row.get("day_of_week")

    if any(v is None or v == -1 for v in (first_road_class, speed_limit_mph, junction_detail, light, weather, urban_rural, day_of_week)):
        return None

    if light not in (1, 4, 5, 6):  # Daylight / dark-lit / dark-unlit / dark-no-lighting
        return None

    if urban_rural not in (1, 2):
        return None

    if not isinstance(time_str, str) or ":" not in time_str:
        return None

    try:
        hour = int(time_str.split(":")[0])
    except ValueError:
        return None

    hour_sin, hour_cos = _hour_cyclic(hour)

    return {
        "major_road": 1.0 if first_road_class in (1, 2, 3) else 0.0,
        "speed_limit_kmh": float(speed_limit_mph) * 1.60934,
        "at_junction": 0.0 if junction_detail in (0, 99) else 1.0,
        "daylight": 1.0 if light == 1 else 0.0,
        "dark_lit": 1.0 if light == 4 else 0.0,
        "dark_unlit": 1.0 if light in (5, 6) else 0.0,
        "raining": 1.0 if weather in (2, 5) else 0.0,
        "snowing": 1.0 if weather in (3, 6) else 0.0,
        "high_wind": 1.0 if weather in (4, 5, 6) else 0.0,
        "fog_or_poor_visibility": 1.0 if weather == 7 else 0.0,
        "urban": 1.0 if urban_rural == 1 else 0.0,
        "is_cyclist": 1.0 if casualty_type == CYCLIST_CASUALTY_TYPE else 0.0,
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        # STATS19: 1=Sunday, 7=Saturday.
        "is_weekend": 1.0 if day_of_week in (1, 7) else 0.0,
    }


def lumapath_route_features(road, surroundings, weather, is_day, mode):
    """
    road: road_network_features() output (major_road_share,
          maxspeed_mean_kmh, junctions_per_km, ...)
    surroundings: {"built_up_share": ..}
    weather: route_analyzer._combine_weather() output, or None
    is_day: bool
    mode: "walking" or "cycling" (see SUPPORTED_MODES)

    Returns a FEATURE_COLUMNS dict with the same meaning as
    stats19_row_features, built entirely from real LumaPath
    measurements (OpenStreetMap road data, live Open-Meteo weather).
    """

    road = road or {}
    lit_share = road.get("lit_share")
    lit_share = 0.5 if lit_share is None else lit_share  # unmapped: no lean either way

    junctions_per_km = road.get("junctions_per_km") or 0.0
    at_junction = min(1.0, junctions_per_km * JUNCTION_INFLUENCE_KM)

    precipitation = _get(weather, "precipitation")
    wind = _get(weather, "wind_speed")
    visibility = weather.get("visibility") if weather else None
    code = _get(weather, "weather_code")

    fog = 1.0 if (code in FOG_WEATHER_CODES or (visibility is not None and visibility < FOG_VISIBILITY_M)) else 0.0

    now = datetime.now(INDIA_TZ)
    hour_sin, hour_cos = _hour_cyclic(now.hour + now.minute / 60)

    return {
        "major_road": road.get("major_road_share") if road.get("available") else 0.0,
        "speed_limit_kmh": road.get("maxspeed_mean_kmh") or 40.0,  # a plausible mid-range default when unmapped
        "at_junction": at_junction,
        "daylight": 1.0 if is_day else 0.0,
        "dark_lit": 0.0 if is_day else lit_share,
        "dark_unlit": 0.0 if is_day else (1 - lit_share),
        "raining": 1.0 if precipitation > RAIN_MM else 0.0,
        "snowing": 1.0 if code in SNOW_WEATHER_CODES else 0.0,
        "high_wind": 1.0 if wind > WIND_KMH else 0.0,
        "fog_or_poor_visibility": fog,
        "urban": _get(surroundings, "built_up_share", 0.5),
        "is_cyclist": 1.0 if mode == "cycling" else 0.0,
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        # Python's weekday(): 0=Monday..6=Sunday; weekend is Saturday/Sunday.
        "is_weekend": 1.0 if now.weekday() in (5, 6) else 0.0,
    }


def to_row(features):
    return [features[c] for c in FEATURE_COLUMNS]
