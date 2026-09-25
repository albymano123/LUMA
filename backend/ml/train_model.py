"""
Trains the experimental incident-rate model from a table made by
ml/build_dataset.py. It refuses to produce a model unless there is
enough real data, and marks the model "validated" only if it beats a
plain average-rate baseline on held-out AREAS (spatial cross-validation,
so it cannot just memorise neighbouring streets).

    python -m ml.train_model --data ml/training_windows.csv
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_poisson_deviance
from sklearn.model_selection import GroupKFold

from ml.features import FEATURE_COLUMNS
from ml.predict_model import MODEL_DIR


# Below these there is not enough real data for a meaningful model.
MIN_WINDOWS = 300
MIN_INCIDENTS = 200

# The model must be at least this much better than the baseline.
MIN_IMPROVEMENT = 0.02

# Spatial block size for cross-validation (degrees, about 2 km).
BLOCK_DEG = 0.02
FOLDS = 5


def new_model():

    # Poisson loss suits non-negative rates built from counts; the
    # histogram model handles missing (NaN) features natively.
    return HistGradientBoostingRegressor(
        loss="poisson",
        max_depth=4,
        learning_rate=0.05,
        max_iter=200,
        min_samples_leaf=20,
        random_state=42,
    )


def check_enough_data(table):

    windows = len(table)
    incidents = int(table["incident_count"].sum())

    problems = []

    if windows < MIN_WINDOWS:
        problems.append(f"only {windows} road windows (need {MIN_WINDOWS})")

    if incidents < MIN_INCIDENTS:
        problems.append(f"only {incidents} incidents (need {MIN_INCIDENTS})")

    return problems


def cross_validate(table):
    """Held-out-area Poisson deviance of the model vs an average-rate baseline."""

    X = table[FEATURE_COLUMNS]
    y = table["incidents_per_km"].to_numpy()
    weights = table["length_km"].to_numpy()

    groups = (
        (table["mid_lat"] // BLOCK_DEG).astype(int).astype(str)
        + "_"
        + (table["mid_lon"] // BLOCK_DEG).astype(int).astype(str)
    )

    folds = min(FOLDS, groups.nunique())

    if folds < 3:
        return None

    model_dev, base_dev = [], []

    for train, test in GroupKFold(n_splits=folds).split(X, y, groups):

        model = new_model().fit(X.iloc[train], y[train], sample_weight=weights[train])
        predicted = np.clip(model.predict(X.iloc[test]), 1e-6, None)

        baseline = np.average(y[train], weights=weights[train])
        baseline_pred = np.full(len(test), max(baseline, 1e-6))

        model_dev.append(mean_poisson_deviance(y[test], predicted, sample_weight=weights[test]))
        base_dev.append(mean_poisson_deviance(y[test], baseline_pred, sample_weight=weights[test]))

    model_dev = float(np.mean(model_dev))
    base_dev = float(np.mean(base_dev))

    return {
        "folds": folds,
        "model_poisson_deviance": round(model_dev, 4),
        "baseline_poisson_deviance": round(base_dev, 4),
        "improvement_over_baseline": round(1 - model_dev / base_dev, 4) if base_dev else None,
    }


def train(table, source_meta, model_dir=MODEL_DIR):
    """Returns the metadata dict. Raises ValueError if there is too little data."""

    problems = check_enough_data(table)

    if problems:
        raise ValueError("Not enough real data to train: " + "; ".join(problems))

    validation = cross_validate(table)

    validated = bool(
        validation
        and validation["improvement_over_baseline"] is not None
        and validation["improvement_over_baseline"] > MIN_IMPROVEMENT
    )

    model = new_model().fit(
        table[FEATURE_COLUMNS],
        table["incidents_per_km"],
        sample_weight=table["length_km"],
    )

    metadata = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "feature_columns": FEATURE_COLUMNS,
        "target": "incidents_per_km",
        "mode": source_meta.get("mode", "walking"),
        "area": source_meta.get("area"),
        "windows": len(table),
        "incident_count": int(table["incident_count"].sum()),
        "years_covered": source_meta.get("years_covered"),
        "mean_incidents_per_km": float(
            np.average(table["incidents_per_km"], weights=table["length_km"])
        ),
        "validation": validation,
        "validated": validated,
    }

    os.makedirs(model_dir, exist_ok=True)
    joblib.dump(model, os.path.join(model_dir, "incident_rate_model.joblib"))

    with open(os.path.join(model_dir, "incident_rate_model.json"), "w", encoding="utf8") as file:
        json.dump(metadata, file, indent=2)

    return metadata


def main(argv=None):

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", default="ml/training_windows.csv")
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
    print("Validated:", metadata["validated"])

    return 0


if __name__ == "__main__":
    sys.exit(main())
