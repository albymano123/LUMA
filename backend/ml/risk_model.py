"""
Live AI/ML risk assessment for a route: loads the model trained by
ml.train_risk_model (real UK STATS19 collision data; see
ml/risk_features.py for what it learns and why) and scores a route's
real, live road/weather features with it.

There is no shipped model by default. Until ml.train_risk_model has
been run, and whenever its model did not pass validation, status stays
"not_trained"/"not_validated": no prediction, no guess. This mirrors
ml/predict_model.py and ml/surrogate.py's existing honesty convention
in this project.

The model's output is a predicted probability that a collision under
conditions like this route's tends to be severe (fatal/serious) rather
than slight - called "predicted_severe_share" throughout, deliberately
not "crash probability" or "chance of an accident here", because
STATS19 has no traffic-exposure denominator to support that stronger
claim. It is read alongside the rule-based score, and both are
combined, boundedly, into route RANKING - see safety.py's
_ranking_score, which falls back to the pure rule-based score whenever
this module reports anything other than "ready".
"""

import hashlib
import json
import logging
import os

import numpy as np

from ml.risk_features import FEATURE_COLUMNS, SUPPORTED_MODES, lumapath_route_features

logger = logging.getLogger("lumapath.ml.risk")

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "risk_model.joblib")
METADATA_PATH = os.path.join(MODEL_DIR, "risk_model.json")

# Boundary between "lower" and "higher" predicted severity share. Not
# a crime-rate threshold: it is simply the midpoint of the model's own
# [0, 1] output, used only to produce a human-readable label.
RISK_LABEL_BOUNDARIES = (0.33, 0.66)

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
            logger.warning("Risk model was trained on different features; ignoring it")
            return None

        expected_sha256 = metadata.get("model_sha256")

        if expected_sha256 and not _checksum_matches(MODEL_PATH, expected_sha256):
            logger.warning(
                "Risk model file does not match its recorded checksum (corrupted or "
                "mismatched artifact); ignoring it"
            )
            return None

        import joblib

        _loaded = (joblib.load(MODEL_PATH), metadata)

    except Exception as error:
        logger.warning("Risk model could not be loaded: %s", error)
        _loaded = None

    return _loaded


def _checksum_matches(path, expected_sha256, chunk_size=1 << 20):
    """True if `path`'s real SHA-256 matches the one recorded at training
    time (risk_model.json's model_sha256) - catches a truncated download,
    a bad Docker COPY, or an accidental overwrite, rather than silently
    loading (or crashing on) a corrupted model file."""

    digest = hashlib.sha256()

    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(chunk_size), b""):
            digest.update(chunk)

    return digest.hexdigest() == expected_sha256


def _status(status, message, **extra):

    return {
        "status": status,
        "message": message,
        "predicted_severe_share": None,
        "risk_label": None,
        "top_factors": [],
        **extra,
    }


def _risk_label(probability):

    low, high = RISK_LABEL_BOUNDARIES

    if probability < low:
        return "Lower relative risk"

    if probability < high:
        return "Moderate relative risk"

    return "Higher relative risk"


def _local_explanation(model, row, columns, training_medians, top_n=3):
    """
    Which features this specific prediction depended on most, found by
    occlusion: replace one feature at a time with the training data's
    median (a neutral, typical value) and see how much the predicted
    probability moves. A real, model-agnostic, per-prediction technique
    (not a global average), cheap enough to run on every request.
    """

    import pandas as pd

    base = model.predict_proba(pd.DataFrame([row], columns=columns))[0, 1]
    effects = []

    for i, name in enumerate(columns):
        neutral = row.copy()
        neutral[i] = training_medians[i]
        neutral_proba = model.predict_proba(pd.DataFrame([neutral], columns=columns))[0, 1]
        effects.append((name, float(base - neutral_proba)))

    effects.sort(key=lambda pair: -abs(pair[1]))

    return [
        {
            "feature": name,
            "effect": round(effect, 4),
            "direction": "increased" if effect > 0 else "decreased",
        }
        for name, effect in effects[:top_n]
        if abs(effect) > 1e-4
    ]


def assess_route(road, surroundings, weather, is_day, mode):
    """
    Returns a dict that always has "status":

      not_trained       no model exists (the normal state until trained)
      not_validated     a model exists but failed its validation
      unsupported_mode  the model is trained for pedestrians/cyclists only
      unavailable       not enough road data was available for this route
      ready             predicted_severe_share, risk_label, top_factors filled in

    road, surroundings, weather, is_day: see ml/risk_features.py
    """

    if mode not in SUPPORTED_MODES:
        return _status(
            "unsupported_mode",
            "The risk model is trained on real pedestrian/cyclist casualty "
            "data and is only meaningful for walking and cycling routes.",
        )

    loaded = _load()

    if loaded is None:
        return _status(
            "not_trained",
            "No AI/ML risk model has been trained yet. Train one with "
            "ml.risk_dataset and ml.train_risk_model.",
        )

    model, metadata = loaded

    if not metadata.get("validated"):
        return _status(
            "not_validated",
            "A risk model exists but did not beat its baseline in "
            "validation, so its output is not shown.",
        )

    if not (road and road.get("available")):
        return _status(
            "unavailable",
            "Not enough road data was available for this route.",
        )

    features = lumapath_route_features(road, surroundings, weather, is_day, mode)
    row = np.array([features[c] for c in FEATURE_COLUMNS], dtype=float)

    try:
        import pandas as pd

        probability = float(model.predict_proba(pd.DataFrame([row], columns=FEATURE_COLUMNS))[0, 1])
        medians = np.array([metadata["feature_medians"][c] for c in FEATURE_COLUMNS], dtype=float)
        top_factors = _local_explanation(model, row, FEATURE_COLUMNS, medians)
    except Exception as error:
        logger.warning("Risk model prediction failed: %s", error)
        return _status("unavailable", "The model could not assess this route.")

    return {
        "status": "ready",
        "message": (
            "An AI/ML estimate of how severe collisions tend to be in "
            "conditions like this route's (road type, speed limit, "
            "junctions, lighting, weather), learned from real UK road "
            "collision records because no India/Kerala-specific "
            "collision dataset is publicly available. It is not a "
            "prediction that a collision will occur, and it never "
            "changes the rule-based score shown above; it only nudges "
            "which route is tagged safest/balanced (safety.py)."
        ),
        "predicted_severe_share": round(probability, 4),
        "risk_label": _risk_label(probability),
        "top_factors": top_factors,
        "model_info": {
            "trained_at": metadata.get("trained_at"),
            "training_rows": metadata.get("training_rows"),
            "test_year": metadata.get("test_year"),
            "test_roc_auc": metadata.get("test_metrics", {}).get("roc_auc"),
        },
    }
