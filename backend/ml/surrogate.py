"""
Experimental AI/ML safety analysis: a model trained to approximate the
RULE-BASED score (safety.py) from real route/weather features, plus an
unsupervised model that flags routes with an unusual feature combination.

What this is, precisely:

  - A supervised regressor (gradient boosting) learns to predict the
    existing rule-based safety score from real OpenStreetMap route
    features and real weather readings, over many real Kerala routes.
    This is sometimes called a surrogate or distilled model: it does
    not learn from crime or incident records (none exist in this
    project; see ml/predict_model.py for that, separate, gated
    pipeline), it learns the rule engine's own real-data-driven
    reasoning, so it can generalise across feature combinations the
    hand-tuned weights in safety.py were not explicitly tuned for, and
    its feature importances show which real factors the rule engine's
    output is most sensitive to.
  - An unsupervised isolation forest, trained on the same real feature
    matrix with no labels, flags routes whose features are unusual
    compared to the training routes (e.g. an atypical mix of road type,
    lighting and weather) -- a genuinely different, label-free signal.

Neither model ever ranks or recommends routes, and neither replaces
the rule-based score, which stays the only source of truth for the
numeric score and the recommendation (route_analyzer.py,
safety.categorize_routes). This module's output is additional,
clearly-labelled, and the API reports "not_trained" until a model has
actually been trained on real routes (ml/build_route_dataset.py,
ml/train_surrogate.py).
"""

import json
import logging
import os

from ml.route_features import FEATURE_COLUMNS

logger = logging.getLogger("lumapath.ml.surrogate")

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
REGRESSOR_PATH = os.path.join(MODEL_DIR, "surrogate_regressor.joblib")
ANOMALY_PATH = os.path.join(MODEL_DIR, "surrogate_anomaly.joblib")
METADATA_PATH = os.path.join(MODEL_DIR, "surrogate_model.json")

_loaded = None
_load_attempted = False


def reset_cache():
    """For tests, and after retraining without restarting the API."""

    global _loaded, _load_attempted
    _loaded = None
    _load_attempted = False


def _load():
    """(regressor, anomaly_detector, metadata) or None. Never raises."""

    global _loaded, _load_attempted

    if _load_attempted:
        return _loaded

    _load_attempted = True

    paths = (REGRESSOR_PATH, ANOMALY_PATH, METADATA_PATH)

    if not all(os.path.exists(path) for path in paths):
        return None

    try:
        with open(METADATA_PATH, encoding="utf8") as file:
            metadata = json.load(file)

        if metadata.get("feature_columns") != FEATURE_COLUMNS:
            logger.warning("Surrogate model was trained on different features; ignoring it")
            return None

        # Imported here so the API does not load scikit-learn/pandas/
        # joblib unless a trained model actually exists.
        import joblib

        regressor = joblib.load(REGRESSOR_PATH)
        anomaly = joblib.load(ANOMALY_PATH)
        _loaded = (regressor, anomaly, metadata)

    except Exception as error:
        logger.warning("Surrogate model could not be loaded: %s", error)
        _loaded = None

    return _loaded


def _status(status, message, **extra):

    return {
        "status": status,
        "message": message,
        "predicted_safety_score": None,
        "agrees_with_rule_score": None,
        "unusual_route": None,
        **extra,
    }


def analyze_route(shape, road, surroundings, emergency, weather, mode, rule_score=None):
    """
    Returns a dict that always has "status":

      not_trained       no model exists (the normal state until trained)
      unsupported_mode  the model was trained for another travel mode
      unavailable       not enough map data for this route
      ready             the prediction fields below are filled in

    rule_score: safety.py's "safety_score" for the same route, if
    available, only used to report whether the two methods agree
    (within AGREEMENT_MARGIN points) - never to adjust the prediction.
    """

    loaded = _load()

    if loaded is None:
        return _status(
            "not_trained",
            "No AI/ML model has been trained yet. Train one with "
            "ml.build_route_dataset and ml.train_surrogate.",
        )

    regressor, anomaly, metadata = loaded

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

    from ml.route_features import surrogate_feature_row

    row = surrogate_feature_row(shape, road, surroundings, emergency, weather)

    try:
        import pandas as pd

        frame = pd.DataFrame([row])[FEATURE_COLUMNS]
        predicted = float(regressor.predict(frame)[0])
        # IsolationForest: -1 is an outlier, 1 is typical.
        is_outlier = bool(anomaly.predict(frame)[0] == -1)
    except Exception as error:
        logger.warning("Surrogate prediction failed: %s", error)
        return _status("unavailable", "The model could not analyse this route.")

    predicted = round(max(0.0, min(100.0, predicted)))
    agreement_margin = metadata.get("agreement_margin", 10)

    return {
        "status": "ready",
        "message": (
            "An AI/ML model's estimate of the rule-based safety score, "
            "learned from real route and weather features over many "
            "real Kerala routes. It approximates the rule-based engine "
            "above, it does not predict crime or incidents, and it "
            "never changes which route is recommended."
        ),
        "predicted_safety_score": predicted,
        "agrees_with_rule_score": (
            None if rule_score is None
            else abs(predicted - rule_score) <= agreement_margin
        ),
        "unusual_route": is_outlier,
        "model_info": {
            "trained_at": metadata.get("trained_at"),
            "training_routes": metadata.get("training_routes"),
            "held_out_r2": metadata.get("held_out_r2"),
            "held_out_mae": metadata.get("held_out_mae"),
        },
    }
