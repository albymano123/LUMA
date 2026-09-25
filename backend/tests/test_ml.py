"""
The experimental ML component: honest defaults and a working
pipeline for when real incident data arrives.

The training tables below are generated INSIDE the tests to check the
mechanics only. They are never saved as a dataset or shipped as a model.
"""

import math

import numpy as np
import pandas as pd
import pytest

from ml import predict_model
from ml import train_model
from ml.build_dataset import count_incidents, load_incidents, road_windows
from ml.features import FEATURE_COLUMNS, feature_row


ROAD = {
    "available": True,
    "major_road_share": 0.1, "local_road_share": 0.8,
    "pedestrian_cycle_road_share": 0.1,
    "sidewalk_share": 0.5, "maxspeed_mean_kmh": 40.0, "paved_share": 1.0,
    "junctions_per_km": 5.0, "dead_ends_per_km": 1.0,
}
SHAPE = {"directness": 0.9, "turns_per_km": 2.0}
EMERGENCY = {"hospital_median_m": 800, "police_median_m": 1200}


@pytest.fixture(autouse=True)
def empty_model_dir(tmp_path, monkeypatch):
    """Point the predictor at an empty folder, as in a fresh checkout."""

    monkeypatch.setattr(predict_model, "MODEL_PATH", str(tmp_path / "incident_rate_model.joblib"))
    monkeypatch.setattr(predict_model, "METADATA_PATH", str(tmp_path / "incident_rate_model.json"))
    predict_model.reset_cache()

    yield tmp_path

    predict_model.reset_cache()


def test_no_shipped_model_or_synthetic_dataset():
    import os

    ml_dir = os.path.dirname(predict_model.__file__)

    assert not os.path.exists(os.path.join(ml_dir, "dataset.csv"))
    assert not os.path.exists(os.path.join(ml_dir, "safety_model.pkl"))


def test_untrained_reports_status_and_no_score():
    result = predict_model.estimate_for_route(SHAPE, ROAD, EMERGENCY, "walking")

    assert result["status"] == "not_trained"
    assert result["expected_incidents_per_km"] is None
    assert result["relative_to_area_average"] is None


def test_feature_row_keeps_missing_as_nan_not_zero():
    row = feature_row(SHAPE, {"available": False}, {"hospital_median_m": None})

    assert list(row) == FEATURE_COLUMNS
    assert math.isnan(row["sidewalk_share"])
    assert math.isnan(row["hospital_median_m"])
    assert row["directness"] == 0.9


def test_training_refuses_too_little_data():
    tiny = pd.DataFrame({"incident_count": [1, 2], "length_km": [0.5, 0.5]})

    with pytest.raises(ValueError, match="Not enough real data"):
        train_model.train(tiny, {})


def synthetic_table(rows=600, signal=True, seed=0):
    """Test-only table: incident rate depends on a feature (or on nothing)."""

    rng = np.random.default_rng(seed)

    table = pd.DataFrame({
        "mid_lat": 9.9 + rng.random(rows) * 0.1,
        "mid_lon": 76.2 + rng.random(rows) * 0.1,
        "length_km": 0.5,
    })

    for column in FEATURE_COLUMNS:
        table[column] = rng.random(rows)

    rate = 1 + (6 * table["dead_ends_per_km"] if signal else 0)
    table["incident_count"] = rng.poisson(rate * 0.5)
    table["incidents_per_km"] = table["incident_count"] / table["length_km"]

    return table


def test_trained_model_is_used_only_when_validated(tmp_path):
    metadata = train_model.train(
        synthetic_table(signal=True), {"mode": "walking", "area": "test"}, model_dir=str(tmp_path)
    )

    assert metadata["validated"]

    predict_model.reset_cache()
    ready = predict_model.estimate_for_route(SHAPE, ROAD, EMERGENCY, "walking")

    assert ready["status"] == "ready"
    assert ready["expected_incidents_per_km"] >= 0
    assert ready["trained_on"]["area"] == "test"

    # Wrong travel mode and missing road data are refused, not guessed.
    assert predict_model.estimate_for_route(SHAPE, ROAD, EMERGENCY, "driving")["status"] == "unsupported_mode"
    assert predict_model.estimate_for_route(SHAPE, {"available": False}, EMERGENCY, "walking")["status"] == "unavailable"


def test_model_with_no_real_signal_is_not_validated(tmp_path):
    metadata = train_model.train(
        synthetic_table(signal=False, seed=3), {"mode": "walking"}, model_dir=str(tmp_path)
    )

    assert not metadata["validated"]

    predict_model.reset_cache()

    assert predict_model.estimate_for_route(SHAPE, ROAD, EMERGENCY, "walking")["status"] == "not_validated"


def test_incident_file_is_validated(tmp_path):
    path = tmp_path / "incidents.csv"
    path.write_text(
        "lat,lon,timestamp\n9.93,76.26,2024-01-01\n999,76.26,2024-02-01\nabc,76.2,2024-03-01\n9.94,76.27,2025-01-01\n"
    )

    frame, report = load_incidents(str(path))

    assert len(frame) == 2
    assert report["rows_in_file"] == 4
    assert report["rows_used"] == 2
    assert report["years_covered"] == pytest.approx(1.0, abs=0.05)

    bad = tmp_path / "bad.csv"
    bad.write_text("x,y\n1,2\n")

    with pytest.raises(ValueError, match="missing columns"):
        load_incidents(str(bad))


def test_windows_and_incident_counts():
    nodes = [{"type": "node", "id": i, "lon": 76.26 + i * 0.0009, "lat": 9.93} for i in range(1, 12)]
    way = {"type": "way", "id": 1, "nodes": list(range(1, 12)), "tags": {"highway": "residential"}}

    windows = road_windows(nodes + [way])

    assert len(windows) == 2  # ~1 km of road cut into ~500 m windows

    incidents = np.array([
        [76.2618, 9.93003],    # on the first window
        [76.2618, 9.93003],    # a second one at the same place
        [76.2700, 9.9400],     # ~1 km away: not counted
    ])

    assert count_incidents(windows[0], incidents) == 2
    assert count_incidents(windows[1], incidents) == 0
