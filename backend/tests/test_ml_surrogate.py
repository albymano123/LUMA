"""
ml.surrogate / ml.route_features / ml.train_surrogate: the experimental
AI/ML safety-analysis model's code paths.

The feature numbers used to fit a model in these tests are synthetic:
they exercise the TRAINING AND PREDICTION CODE (does fitting work, does
loading work, does an obvious outlier get flagged), not a claim about
real-world safety. The real, shipped model is trained on real routes by
ml.build_route_dataset + ml.train_surrogate; see docs/DEPLOYMENT.md and
ml/README.md.
"""

import numpy as np
import pandas as pd
import pytest

from ml import surrogate, train_surrogate
from ml.route_features import FEATURE_COLUMNS, surrogate_feature_row


# ==================================================
# surrogate_feature_row
# ==================================================

def test_feature_row_has_one_column_per_declared_feature():
    road = {"available": True, "major_road_share": 0.2, "sidewalk_share": 0.5}
    shape = {"directness": 0.9, "turns_per_km": 3}
    row = surrogate_feature_row(shape, road, {}, {}, None)

    assert set(row) == set(FEATURE_COLUMNS)


def test_feature_row_uses_nan_for_missing_weather_not_zero():
    row = surrogate_feature_row({}, {"available": False}, {}, {}, None)

    assert np.isnan(row["precipitation_mm"])
    assert np.isnan(row["wind_speed_kmh"])
    # is_day defaults to day (the same default safety.py uses), not NaN.
    assert row["is_day"] == 1.0


def test_feature_row_reads_real_weather_fields():
    weather = {"precipitation": 4.0, "wind_speed": 12.0, "temperature": 29.0,
               "visibility": 8000, "is_day": False}
    row = surrogate_feature_row({}, {"available": False}, {}, {}, weather)

    assert row["precipitation_mm"] == 4.0
    assert row["wind_speed_kmh"] == 12.0
    assert row["is_day"] == 0.0


# ==================================================
# surrogate.analyze_route: status handling, never raises
# ==================================================

@pytest.fixture(autouse=True)
def _reset_cache():
    surrogate.reset_cache()
    yield
    surrogate.reset_cache()


def test_not_trained_status_when_no_model_exists(monkeypatch, tmp_path):
    monkeypatch.setattr(surrogate, "REGRESSOR_PATH", str(tmp_path / "missing.joblib"))

    result = surrogate.analyze_route({}, {"available": True}, {}, {}, None, "walking")

    assert result["status"] == "not_trained"
    assert result["predicted_safety_score"] is None


def test_unavailable_status_when_road_data_missing(monkeypatch, tmp_path, _trained_model_dir):
    _point_module_at(monkeypatch, _trained_model_dir)

    result = surrogate.analyze_route({}, {"available": False}, {}, {}, None, "walking")

    assert result["status"] == "unavailable"


def test_unsupported_mode_status(monkeypatch, _trained_model_dir):
    _point_module_at(monkeypatch, _trained_model_dir)

    result = surrogate.analyze_route({}, {"available": True}, {}, {}, None, "cycling")

    assert result["status"] == "unsupported_mode"


def test_ready_status_reports_prediction_and_agreement(monkeypatch, _trained_model_dir):
    _point_module_at(monkeypatch, _trained_model_dir)

    road = {"available": True, "major_road_share": 0.1, "sidewalk_share": 0.8,
            "maxspeed_mean_kmh": 30, "lit_share": 0.9, "pedestrian_cycle_road_share": 0.5}
    shape = {"directness": 0.95, "turns_per_km": 2}

    result = surrogate.analyze_route(shape, road, {}, {}, None, "walking", rule_score=80)

    assert result["status"] == "ready"
    assert isinstance(result["predicted_safety_score"], int)
    assert 0 <= result["predicted_safety_score"] <= 100
    assert result["agrees_with_rule_score"] in (True, False)
    assert isinstance(result["unusual_route"], bool)
    assert result["model_info"]["training_routes"] == 120


def test_a_feature_combination_far_outside_training_is_flagged_unusual(monkeypatch, _trained_model_dir):
    _point_module_at(monkeypatch, _trained_model_dir)

    # Every column here is set (no NaNs: a fair comparison, since the
    # synthetic training table in _synthetic_table has none either) and
    # far outside every training column's range.
    road = {
        "available": True, "major_road_share": 1.0, "local_road_share": 1.0,
        "pedestrian_cycle_road_share": 1.0, "sidewalk_share": 1.0,
        "maxspeed_mean_kmh": 400, "paved_share": 0.0, "lit_share": 1.0,
        "junctions_per_km": 500, "dead_ends_per_km": 200,
    }
    shape = {"directness": 0.1, "turns_per_km": 1000}
    surroundings = {"built_up_share": 1.0, "longest_unbuilt_km": 100}
    emergency = {"hospital_median_m": 50_000, "police_median_m": 50_000}
    weather = {"precipitation": 500, "wind_speed": 400, "temperature": 70,
               "visibility": 50, "is_day": True}

    result = surrogate.analyze_route(shape, road, surroundings, emergency, weather, "walking")

    assert result["status"] == "ready"
    assert result["unusual_route"] is True


# ==================================================
# train_surrogate.train: refuses too little data, validates on held-out areas
# ==================================================

def _synthetic_table(n, seed=0):
    """
    A synthetic feature table with a KNOWN relationship to the label, used
    only to check that fitting/cross-validation/metadata work correctly -
    not a dataset of real routes (see module docstring).
    """

    rng = np.random.default_rng(seed)
    rows = []

    for i in range(n):
        major_road_share = rng.uniform(0, 0.5)
        lit_share = rng.uniform(0, 1)
        maxspeed = rng.uniform(10, 60)
        score = 100 - 80 * major_road_share + 15 * lit_share - 0.3 * maxspeed
        score = float(np.clip(score + rng.normal(0, 2), 0, 100))

        # Every column gets a plausible real value: a HistGradientBoosting
        # model treats an entirely-NaN column as degenerate, and real
        # routes rarely lack every feature at once anyway.
        row = {
            "major_road_share": major_road_share,
            "local_road_share": rng.uniform(0, 1),
            "pedestrian_cycle_road_share": rng.uniform(0, 1),
            "sidewalk_share": rng.uniform(0, 1),
            "maxspeed_mean_kmh": maxspeed,
            "paved_share": rng.uniform(0.5, 1),
            "lit_share": lit_share,
            "built_up_share": rng.uniform(0, 1),
            "longest_unbuilt_km": rng.uniform(0, 2),
            "junctions_per_km": rng.uniform(0, 20),
            "dead_ends_per_km": rng.uniform(0, 5),
            "hospital_median_m": rng.uniform(100, 3000),
            "police_median_m": rng.uniform(100, 3000),
            "directness": rng.uniform(0.7, 1.0),
            "turns_per_km": rng.uniform(0, 10),
            "precipitation_mm": rng.uniform(0, 5),
            "wind_speed_kmh": rng.uniform(0, 40),
            "temperature_c": rng.uniform(22, 34),
            "visibility_m": rng.uniform(2000, 10000),
            "is_day": float(rng.integers(0, 2)),
        }
        row.update({
            "safety_score": score,
            "mid_lat": 10.0 + (i % 10) * 0.05,
            "mid_lon": 76.0 + (i // 10 % 10) * 0.05,
        })
        rows.append(row)

    return pd.DataFrame(rows)


def test_train_refuses_too_few_routes():
    table = _synthetic_table(10)

    with pytest.raises(ValueError, match="only 10"):
        train_surrogate.train(table, {})


def test_train_succeeds_and_writes_metadata(tmp_path):
    table = _synthetic_table(120)

    metadata = train_surrogate.train(table, {"mode": "walking", "od_pairs": 60}, model_dir=str(tmp_path))

    assert metadata["training_routes"] == 120
    assert metadata["feature_columns"] == FEATURE_COLUMNS
    assert metadata["held_out_r2"] is not None
    assert (tmp_path / "surrogate_regressor.joblib").exists()
    assert (tmp_path / "surrogate_anomaly.joblib").exists()


def test_cross_validated_r2_is_reasonable_on_a_learnable_synthetic_relationship():
    # Confirms the held-out evaluation actually measures something: a
    # clear synthetic signal should score well above zero (not a claim
    # about the real model's real-world accuracy).
    table = _synthetic_table(300)

    validation = train_surrogate.cross_validate(table)

    assert validation is not None
    assert validation["r2"] > 0.5


# ==================================================
# fixtures
# ==================================================

@pytest.fixture
def _trained_model_dir(tmp_path):
    """A real model directory, fitted on a synthetic-but-labelled table."""

    table = _synthetic_table(120)
    train_surrogate.train(table, {"mode": "walking", "od_pairs": 60}, model_dir=str(tmp_path))

    return tmp_path


def _point_module_at(monkeypatch, model_dir):
    monkeypatch.setattr(surrogate, "REGRESSOR_PATH", str(model_dir / "surrogate_regressor.joblib"))
    monkeypatch.setattr(surrogate, "ANOMALY_PATH", str(model_dir / "surrogate_anomaly.joblib"))
    monkeypatch.setattr(surrogate, "METADATA_PATH", str(model_dir / "surrogate_model.json"))
    surrogate.reset_cache()
