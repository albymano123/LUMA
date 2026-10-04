"""
Trains the AI/ML risk model on the real STATS19-derived table built by
ml.risk_dataset.

    python -m ml.train_risk_model --data ml/risk_training_table.csv

The task: binary classification of whether a real, individually
recorded pedestrian or cyclist casualty was severe (fatal or serious)
rather than slight, from the real road/lighting/weather/junction/area/
time conditions of the collision they were in (ml/risk_features.py).
Applied live to a candidate route, the trained model's output is read
as "how severe pedestrian/cyclist casualties tend to be in conditions
like this route's", not a claim about how likely a collision is at any
specific place - STATS19 has no reliable traffic-exposure denominator,
so a true incidence rate cannot be estimated honestly from it alone.

Evaluation uses a temporal holdout (train on 2023, test on 2024 - a
real casualty from a later year the model never saw) plus grouped (by
real geographic district) cross-validation on the training year, so
neither temporal nor spatial leakage inflates the reported numbers.
A plain logistic regression is reported alongside the chosen model, as
model-selection context.

"validated" means something specific and deliberately modest: that the
held-out ROC-AUC is statistically significantly above 0.5 (chance), by
a bootstrap confidence interval on the real test year - i.e. the model
carries genuine, non-random signal. It is not a claim that the model
is highly accurate; severity, given only the real features this
project can know before a trip, is inherently hard to predict (the
dominant real-world drivers of injury severity - impact speed,
vehicle mass, protective equipment - are not observable in advance).
Reporting that honestly, with a real confidence interval, is the
point: ml/risk_model.py's bounded integration into ranking
(safety.py's ML_RANKING_WEIGHT) is sized for a genuinely-present but
modest signal, not a strong one.
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score, f1_score, precision_score, recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from ml.risk_features import FEATURE_COLUMNS
from ml.risk_model import MODEL_DIR

MIN_ROWS = 5_000
FOLDS = 5
BOOTSTRAP_SAMPLES = 1000
# The model is "validated" when this much of its bootstrap ROC-AUC
# distribution, on the real held-out test year, lies above 0.5 (no
# better than chance). 0.99 is a 99%-one-sided test, deliberately
# strict given how the result feeds into live ranking.
MIN_BOOTSTRAP_CONFIDENCE = 0.99


def new_classifier():
    return HistGradientBoostingClassifier(
        max_depth=5,
        learning_rate=0.08,
        max_iter=300,
        min_samples_leaf=50,
        l2_regularization=0.1,
        class_weight="balanced",
        random_state=42,
    )


def new_baseline():
    return make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, class_weight="balanced"))


def _metrics(y_true, proba, threshold=0.5):
    predicted = (proba >= threshold).astype(int)

    return {
        "roc_auc": round(float(roc_auc_score(y_true, proba)), 4),
        "average_precision": round(float(average_precision_score(y_true, proba)), 4),
        "precision": round(float(precision_score(y_true, predicted, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, predicted, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, predicted, zero_division=0)), 4),
        "positive_rate_actual": round(float(np.mean(y_true)), 4),
        "positive_rate_predicted": round(float(np.mean(predicted)), 4),
        "n": int(len(y_true)),
    }


def grouped_cross_validate(train):
    """Held-out-district ROC-AUC/AP on the training year, for both
    models, as a spatial-leakage sanity check (not the headline number
    - the temporal holdout below is)."""

    X = train[FEATURE_COLUMNS]
    y = train["severe"].to_numpy()
    groups = train["local_authority_ons_district"]

    folds = min(FOLDS, groups.nunique())

    if folds < 3:
        return None

    scores = {"risk_model": [], "logistic_baseline": []}

    for fold_train, fold_test in GroupKFold(n_splits=folds).split(X, y, groups):

        model = new_classifier().fit(X.iloc[fold_train], y[fold_train])
        scores["risk_model"].append(roc_auc_score(y[fold_test], model.predict_proba(X.iloc[fold_test])[:, 1]))

        baseline = new_baseline().fit(X.iloc[fold_train], y[fold_train])
        scores["logistic_baseline"].append(roc_auc_score(y[fold_test], baseline.predict_proba(X.iloc[fold_test])[:, 1]))

    return {
        "folds": folds,
        "risk_model_roc_auc_mean": round(float(np.mean(scores["risk_model"])), 4),
        "logistic_baseline_roc_auc_mean": round(float(np.mean(scores["logistic_baseline"])), 4),
    }


def bootstrap_auc_significance(y_true, proba, samples=BOOTSTRAP_SAMPLES, seed=42):
    """
    Share of bootstrap resamples of the real test set whose ROC-AUC is
    above 0.5. A real, standard significance test (not a heuristic
    threshold): resampling the actual held-out predictions, with
    replacement, many times, and checking how consistently the model
    beats chance.
    """

    rng = np.random.default_rng(seed)
    y_true = np.asarray(y_true)
    proba = np.asarray(proba)
    n = len(y_true)
    above_chance = 0

    for _ in range(samples):
        idx = rng.integers(0, n, n)

        if len(np.unique(y_true[idx])) < 2:
            continue

        if roc_auc_score(y_true[idx], proba[idx]) > 0.5:
            above_chance += 1

    return above_chance / samples


def train(table, model_dir=MODEL_DIR):
    """Returns the metadata dict. Raises ValueError if there is too
    little real data, or if the required columns are not present."""

    if len(table) < MIN_ROWS:
        raise ValueError(f"only {len(table)} real rows (need {MIN_ROWS})")

    train_rows = table[table["collision_year"] < table["collision_year"].max()]
    test_rows = table[table["collision_year"] == table["collision_year"].max()]

    if len(train_rows) < MIN_ROWS or len(test_rows) < MIN_ROWS:
        raise ValueError("not enough rows in both the training year and the held-out test year")

    X_train, y_train = train_rows[FEATURE_COLUMNS], train_rows["severe"].to_numpy()
    X_test, y_test = test_rows[FEATURE_COLUMNS], test_rows["severe"].to_numpy()

    spatial_cv = grouped_cross_validate(train_rows)

    model = new_classifier().fit(X_train, y_train)
    baseline_majority = DummyClassifier(strategy="prior").fit(X_train, y_train)
    baseline_logistic = new_baseline().fit(X_train, y_train)

    test_proba = model.predict_proba(X_test)[:, 1]
    test_metrics = _metrics(y_test, test_proba)
    majority_metrics = _metrics(y_test, baseline_majority.predict_proba(X_test)[:, 1])
    logistic_metrics = _metrics(y_test, baseline_logistic.predict_proba(X_test)[:, 1])

    bootstrap_confidence = bootstrap_auc_significance(y_test, test_proba)
    validated = bootstrap_confidence >= MIN_BOOTSTRAP_CONFIDENCE
    improvement_over_logistic = test_metrics["roc_auc"] - logistic_metrics["roc_auc"]

    feature_medians = X_train.median().to_dict()

    importance = permutation_importance(
        model, X_test, y_test, scoring="roc_auc", n_repeats=8, random_state=42, n_jobs=-1,
    )
    feature_importance = sorted(
        (
            {"feature": name, "importance_mean": round(float(mean), 5), "importance_std": round(float(std), 5)}
            for name, mean, std in zip(FEATURE_COLUMNS, importance.importances_mean, importance.importances_std)
        ),
        key=lambda row: -row["importance_mean"],
    )

    metadata = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "feature_columns": FEATURE_COLUMNS,
        "target": "severe (real STATS19 casualty_severity for a real pedestrian/cyclist casualty: Fatal/Serious=1, Slight=0)",
        "data_source": "UK DfT STATS19 road collision data, Open Government Licence v3.0 "
                        "(data.dft.gov.uk) - no India/Kerala-specific collision dataset is "
                        "publicly available; see ml/risk_features.py.",
        "training_year": int(train_rows["collision_year"].iloc[0]),
        "test_year": int(test_rows["collision_year"].iloc[0]),
        "training_rows": int(len(train_rows)),
        "test_rows": int(len(test_rows)),
        "training_districts": int(train_rows["local_authority_ons_district"].nunique()),
        "test_metrics": test_metrics,
        "baseline_majority_class_metrics": majority_metrics,
        "baseline_logistic_regression_metrics": logistic_metrics,
        "spatial_cross_validation": spatial_cv,
        "roc_auc_improvement_over_logistic_baseline": round(improvement_over_logistic, 4),
        "bootstrap_confidence_auc_above_chance": round(bootstrap_confidence, 4),
        "bootstrap_samples": BOOTSTRAP_SAMPLES,
        "validated": validated,
        "feature_importance_permutation": feature_importance,
        "feature_medians": {name: round(float(feature_medians[name]), 4) for name in FEATURE_COLUMNS},
    }

    os.makedirs(model_dir, exist_ok=True)
    model_path = os.path.join(model_dir, "risk_model.joblib")
    joblib.dump(model, model_path)

    # A checksum of the artifact actually written, so risk_model.py can
    # detect a truncated download, a bad COPY, or an accidental overwrite
    # at load time instead of silently loading (or crashing on) a
    # corrupted file.
    digest = hashlib.sha256()

    with open(model_path, "rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            digest.update(chunk)

    metadata["model_sha256"] = digest.hexdigest()
    metadata["model_bytes"] = os.path.getsize(model_path)

    with open(os.path.join(model_dir, "risk_model.json"), "w", encoding="utf8") as file:
        json.dump(metadata, file, indent=2)

    return metadata


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", default="ml/risk_training_table.csv")
    args = parser.parse_args(argv)

    table = pd.read_csv(args.data)

    try:
        metadata = train(table)
    except ValueError as error:
        print(error)
        return 1

    print(json.dumps(metadata, indent=2))
    print("Validated:", metadata["validated"])

    return 0


if __name__ == "__main__":
    sys.exit(main())
