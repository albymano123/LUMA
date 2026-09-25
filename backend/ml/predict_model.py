"""
Experimental ML estimate for a route.

There is NO shipped model. The estimate stays "not_trained" until
someone trains one on a real incident dataset (ml/README.md). Until
then, and whenever a trained model has not passed validation, the API
reports the status and nothing else: no score, no guess.

Even with a validated model the output is an expected historical
incident RATE for roads like these (incidents per km), relative to the
training area's average. It is not a safety guarantee, it is returned
next to the rule-based score, and it is never used to rank or
recommend routes.
"""

import json
import logging
import math
import os

import joblib
import pandas as pd

from ml.features import FEATURE_COLUMNS, feature_row


logger = logging.getLogger("lumapath.ml")


MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "incident_rate_model.joblib")
METADATA_PATH = os.path.join(MODEL_DIR, "incident_rate_model.json")


_loaded = None
_load_attempted = False


def reset_cache():
    """For tests, and after retraining without restarting the API."""

    global _loaded, _load_attempted
    _loaded = None
    _load_attempted = False


def _load():
    """(model, metadata) or None. Never raises."""

    global _loaded, _load_attempted

    if _load_attempted:
        return _loaded

    _load_attempted = True

    if not (os.path.exists(MODEL_PATH) and os.path.exists(METADATA_PATH)):
        return None

    try:
        with open(METADATA_PATH, encoding="utf8") as file:
            metadata = json.load(file)

        if metadata.get("feature_columns") != FEATURE_COLUMNS:
            logger.warning("ML model was trained on different features; ignoring it")
            return None

        _loaded = (joblib.load(MODEL_PATH), metadata)

    except Exception as error:
        logger.warning("ML model could not be loaded: %s", error)
        _loaded = None

    return _loaded


def _status(status, message, **extra):

    return {
        "status": status,
        "message": message,
        "expected_incidents_per_km": None,
        "relative_to_area_average": None,
        **extra,
    }


def estimate_for_route(shape, road, emergency, mode):
    """
    Returns a dict that always has "status":

      not_trained      no model exists (the normal state today)
      not_validated    a model exists but failed its validation
      unsupported_mode the model was trained for another travel mode
      unavailable      not enough map data for this route
      ready            "expected_incidents_per_km" etc. are filled in
    """

    loaded = _load()

    if loaded is None:
        return _status(
            "not_trained",
            "No model has been trained. This needs a real incident or "
            "crime dataset, which has not been provided yet.",
        )

    model, metadata = loaded

    if not metadata.get("validated"):
        return _status(
            "not_validated",
            "A model exists but did not beat a simple baseline in "
            "validation, so its output is not shown.",
        )

    if metadata.get("mode") != mode:
        return _status(
            "unsupported_mode",
            f"The model was trained for {metadata.get('mode')} routes.",
        )

    if not (road and road.get("available")):
        return _status(
            "unavailable",
            "Not enough road data was available for this route.",
        )

    row = feature_row(shape, road, emergency)

    try:
        rate = float(model.predict(pd.DataFrame([row])[FEATURE_COLUMNS])[0])
    except Exception as error:
        logger.warning("ML prediction failed: %s", error)
        return _status("unavailable", "The model could not score this route.")

    rate = max(0.0, rate)
    baseline = metadata.get("mean_incidents_per_km") or math.nan

    return {
        "status": "ready",
        "message": (
            "Expected historical incidents per km for roads like this, "
            "learned from past reports in the training area. Not a "
            "prediction for any individual trip."
        ),
        "expected_incidents_per_km": round(rate, 3),
        "relative_to_area_average": (
            None if math.isnan(baseline) or baseline <= 0
            else round(rate / baseline, 2)
        ),
        "trained_on": {
            "area": metadata.get("area"),
            "incident_count": metadata.get("incident_count"),
            "windows": metadata.get("windows"),
            "trained_at": metadata.get("trained_at"),
            "validation": metadata.get("validation"),
        },
    }
