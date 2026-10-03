"""
The feature vector for the experimental AI/ML safety-analysis model
(ml/surrogate.py). This is a SEPARATE, additive feature set from
ml/features.py (the incident-rate pipeline): it extends the same real
environment features with real weather readings, because this model's
target is the rule-based score, which weather also feeds into.

Every feature is a real, measured quantity: OpenStreetMap-derived road
and surroundings data (the same functions route_analyzer.py uses live),
or an Open-Meteo weather reading taken at analysis time. None of them
is a crime or incident measurement, and nothing here is invented.
"""

import math

from ml.features import FEATURE_COLUMNS as _ENVIRONMENT_COLUMNS
from ml.features import feature_row as _environment_feature_row

WEATHER_COLUMNS = [
    "precipitation_mm",
    "wind_speed_kmh",
    "temperature_c",
    "visibility_m",
    "is_day",
]

# Order matters: it is the column order the surrogate model is trained on.
FEATURE_COLUMNS = _ENVIRONMENT_COLUMNS + WEATHER_COLUMNS


def _pick(weather, key):
    value = weather.get(key) if weather else None
    return math.nan if value is None else float(value)


def surrogate_feature_row(shape, road, surroundings, emergency, weather):
    """
    shape, road, surroundings, emergency: see ml/features.feature_row.
    weather: route_analyzer._combine_weather() output, or None.

    Missing values become NaN, exactly as in ml/features.feature_row:
    "not measured" is kept distinct from "a measured zero".
    """

    row = _environment_feature_row(shape, road, surroundings, emergency)

    row.update({
        "precipitation_mm": _pick(weather, "precipitation"),
        "wind_speed_kmh": _pick(weather, "wind_speed"),
        "temperature_c": _pick(weather, "temperature"),
        "visibility_m": _pick(weather, "visibility"),
        # is_day is boolean, not an OpenStreetMap tag coverage question;
        # unknown defaults to day (the same default safety.py uses).
        "is_day": 1.0 if (weather is None or weather.get("is_day", True)) else 0.0,
    })

    return row
