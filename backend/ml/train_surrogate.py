"""
Trains the experimental AI/ML safety-analysis model from a table built
by ml.build_route_dataset (real routes, real rule-based scores).

    python -m ml.train_surrogate --data ml/route_training_table.csv

Two models are fitted on the same real feature matrix:

  - a HistGradientBoostingRegressor predicting the rule-based score
    (supervised; the label is safety.py's real output for that route,
    not a crime or incident label)
  - an IsolationForest flagging routes with an unusual feature
    combination (unsupervised; no label used at all)

Evaluation is held-out by AREA (spatial group k-fold, grouped the same
way ml.train_model groups incident windows), so the reported R^2/MAE
describe generalisation to unseen parts of Kerala, not memorisation of
nearby streets. Both numbers are written to the model's metadata and
printed, so nothing about model quality is asserted without having
actually been measured.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, IsolationForest
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupKFold

from ml.route_features import FEATURE_COLUMNS
from ml.surrogate import MODEL_DIR

# Below this there is not enough real data to hold out areas meaningfully.
MIN_ROUTES = 60

# Spatial block size for cross-validation (degrees, about 2 km) -
# grouped by the route's midpoint, same convention as ml.train_model.
BLOCK_DEG = 0.02
FOLDS = 5

# Predictions within this many points of the rule-based score are
# reported as "agrees"; it is the same order of magnitude as the
# rounding and missing-factor rescaling already inside safety.py.
AGREEMENT_MARGIN = 10

ANOMALY_CONTAMINATION = 0.1


def new_regressor():
    return HistGradientBoostingRegressor(
        max_depth=4,
        learning_rate=0.05,
        max_iter=200,
        min_samples_leaf=15,
        random_state=42,
    )


def new_anomaly_detector():
    return IsolationForest(
        n_estimators=200,
        contamination=ANOMALY_CONTAMINATION,
        random_state=42,
    )


def _groups(table):
    return (
        (table["mid_lat"] // BLOCK_DEG).astype(int).astype(str)
        + "_"
        + (table["mid_lon"] // BLOCK_DEG).astype(int).astype(str)
    )


def cross_validate(table):
    """Held-out-area R^2 and MAE of the regressor, or None if too few areas."""

    X = table[FEATURE_COLUMNS]
    y = table["safety_score"].to_numpy(dtype=float)
    groups = _groups(table)

    folds = min(FOLDS, groups.nunique())

    if folds < 3:
        return None

    predictions = np.full(len(table), np.nan)

    for train, test in GroupKFold(n_splits=folds).split(X, y, groups):
        model = new_regressor().fit(X.iloc[train], y[train])
        predictions[test] = model.predict(X.iloc[test])

    scored = ~np.isnan(predictions)

    return {
        "folds": folds,
        "r2": round(float(r2_score(y[scored], predictions[scored])), 4),
        "mean_absolute_error": round(float(mean_absolute_error(y[scored], predictions[scored])), 2),
    }


def train(table, source_meta, model_dir=MODEL_DIR):
    """Returns the metadata dict. Raises ValueError if there is too little data."""

    if len(table) < MIN_ROUTES:
        raise ValueError(f"only {len(table)} scored routes (need {MIN_ROUTES})")

    validation = cross_validate(table)

    X = table[FEATURE_COLUMNS]
    y = table["safety_score"].to_numpy(dtype=float)

    regressor = new_regressor().fit(X, y)
    anomaly = new_anomaly_detector().fit(X)

    metadata = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "feature_columns": FEATURE_COLUMNS,
        "target": "safety_score (rule-based, safety.calculate_safety_score)",
        "mode": source_meta.get("mode", "walking"),
        "training_routes": len(table),
        "od_pairs": source_meta.get("od_pairs"),
        "agreement_margin": AGREEMENT_MARGIN,
        "anomaly_contamination": ANOMALY_CONTAMINATION,
        "held_out_r2": validation["r2"] if validation else None,
        "held_out_mae": validation["mean_absolute_error"] if validation else None,
        "cross_validation": validation,
    }

    os.makedirs(model_dir, exist_ok=True)
    joblib.dump(regressor, os.path.join(model_dir, "surrogate_regressor.joblib"))
    joblib.dump(anomaly, os.path.join(model_dir, "surrogate_anomaly.joblib"))

    with open(os.path.join(model_dir, "surrogate_model.json"), "w", encoding="utf8") as file:
        json.dump(metadata, file, indent=2)

    return metadata


def main(argv=None):

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", default="ml/route_training_table.csv")
    args = parser.parse_args(argv)

    table = pd.read_csv(args.data)

    meta_path = args.data + ".meta.json"
    source_meta = {}

    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf8") as file:
            source_meta = json.load(file)

    try:
        metadata = train(table, source_meta)
    except ValueError as error:
        print(error)
        return 1

    print(json.dumps(metadata, indent=2))

    return 0


if __name__ == "__main__":
    sys.exit(main())
