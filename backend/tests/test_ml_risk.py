"""
ml.risk_features / ml.risk_model / ml.train_risk_model, and safety.py's
AI/ML-aware ranking blend (_ranking_score / categorize_routes).

The real, shipped model is trained on real UK STATS19 pedestrian/
cyclist collision data (ml.risk_dataset + ml.train_risk_model; see
ml/README.md and ml/risk_features.py). The feature numbers used here to
exercise the training/prediction CODE are synthetic-but-labelled with a
known relationship, exactly like tests/test_ml_surrogate.py's
convention - they test that the pipeline works, not a real-world
accuracy claim.
"""

import json

import numpy as np
import pandas as pd
import pytest

from ml import risk_model, train_risk_model
from ml.risk_features import FEATURE_COLUMNS, lumapath_route_features, stats19_row_features
from safety import ML_RANKING_WEIGHT, SCORE_TIE_MARGIN, _ranking_score, categorize_routes


# ==================================================
# risk_features: real-data mapping (STATS19 side)
# ==================================================

def _collision_row(**overrides):
    row = {
        "first_road_class": 3,       # A road -> major
        "speed_limit": 30,           # mph
        "junction_detail": 0,        # not at junction
        "light_conditions": 1,       # daylight
        "weather_conditions": 1,     # fine, no high winds
        "urban_or_rural_area": 1,    # urban
        "time": "08:15",
        "day_of_week": 2,            # Monday
    }
    row.update(overrides)
    return row


def test_stats19_row_features_maps_known_codes_correctly():
    features = stats19_row_features(_collision_row(), casualty_type=0)

    assert features["major_road"] == 1.0
    assert features["speed_limit_kmh"] == pytest.approx(30 * 1.60934)
    assert features["at_junction"] == 0.0
    assert features["daylight"] == 1.0
    assert features["dark_lit"] == 0.0
    assert features["dark_unlit"] == 0.0
    assert features["urban"] == 1.0
    assert features["is_cyclist"] == 0.0
    assert features["is_weekend"] == 0.0


def test_stats19_row_features_cyclist_and_weekend_and_dark_unlit():
    row = _collision_row(light_conditions=6, day_of_week=7, first_road_class=6, urban_or_rural_area=2)
    features = stats19_row_features(row, casualty_type=1)

    assert features["is_cyclist"] == 1.0
    assert features["is_weekend"] == 1.0
    assert features["dark_unlit"] == 1.0
    assert features["daylight"] == 0.0
    assert features["major_road"] == 0.0
    assert features["urban"] == 0.0


@pytest.mark.parametrize("field,bad_value", [
    ("first_road_class", -1),
    ("speed_limit", -1),
    ("junction_detail", -1),
    ("light_conditions", -1),
    ("weather_conditions", -1),
    ("urban_or_rural_area", -1),
    ("urban_or_rural_area", 3),   # "Unallocated" - not usable
    ("light_conditions", 7),      # "lighting unknown" - not usable
])
def test_stats19_row_features_rejects_missing_or_unusable_codes(field, bad_value):
    row = _collision_row(**{field: bad_value})

    assert stats19_row_features(row, casualty_type=0) is None


def test_stats19_row_features_rejects_unparseable_time():
    assert stats19_row_features(_collision_row(time="unknown"), casualty_type=0) is None
    assert stats19_row_features(_collision_row(time=None), casualty_type=0) is None


def test_stats19_row_features_hour_is_cyclically_encoded():
    midnight = stats19_row_features(_collision_row(time="00:05"), casualty_type=0)
    noon = stats19_row_features(_collision_row(time="12:05"), casualty_type=0)

    # Midnight and noon are opposite points on the 24h cycle.
    assert midnight["hour_sin"] == pytest.approx(-noon["hour_sin"], abs=0.2)
    assert midnight["hour_cos"] == pytest.approx(-noon["hour_cos"], abs=0.2)


# ==================================================
# risk_features: live LumaPath-side mapping
# ==================================================

def test_lumapath_route_features_has_one_column_per_declared_feature():
    road = {"available": True, "major_road_share": 0.2, "maxspeed_mean_kmh": 30, "junctions_per_km": 5, "lit_share": 0.8}
    row = lumapath_route_features(road, {"built_up_share": 0.7}, None, True, "walking")

    assert set(row) == set(FEATURE_COLUMNS)


def test_lumapath_route_features_mode_sets_is_cyclist():
    road = {"available": True}

    walking = lumapath_route_features(road, {}, None, True, "walking")
    cycling = lumapath_route_features(road, {}, None, True, "cycling")

    assert walking["is_cyclist"] == 0.0
    assert cycling["is_cyclist"] == 1.0


def test_lumapath_route_features_weather_thresholds_match_real_reading():
    road = {"available": True}
    weather = {"precipitation": 5.0, "wind_speed": 40.0, "weather_code": 45, "visibility": 500}

    row = lumapath_route_features(road, {}, weather, True, "walking")

    assert row["raining"] == 1.0
    assert row["high_wind"] == 1.0
    assert row["fog_or_poor_visibility"] == 1.0


def test_lumapath_route_features_night_splits_lit_share_between_dark_lit_and_unlit():
    road = {"available": True, "lit_share": 0.3}

    row = lumapath_route_features(road, {}, None, is_day=False, mode="walking")

    assert row["daylight"] == 0.0
    assert row["dark_lit"] == pytest.approx(0.3)
    assert row["dark_unlit"] == pytest.approx(0.7)


def test_lumapath_route_features_hour_cyclic_values_are_unit_circle():
    road = {"available": True}
    row = lumapath_route_features(road, {}, None, True, "walking")

    assert row["hour_sin"] ** 2 + row["hour_cos"] ** 2 == pytest.approx(1.0, abs=1e-6)


# ==================================================
# risk_model.assess_route: status handling, never raises
# ==================================================

@pytest.fixture(autouse=True)
def _reset_cache():
    risk_model.reset_cache()
    yield
    risk_model.reset_cache()


def _synthetic_table(n, seed=0):
    """
    A synthetic, labelled feature table with a KNOWN relationship
    (higher speed_limit_kmh and is_cyclist -> more likely severe), used
    only to exercise the training/prediction code paths - not a dataset
    of real collisions (see module docstring, and ml/risk_dataset.py
    for how the real one is actually built).
    """

    rng = np.random.default_rng(seed)
    rows = []

    for i in range(n):
        speed = rng.uniform(15, 110)
        is_cyclist = float(rng.integers(0, 2))
        logit = -4 + 0.04 * speed + 1.2 * is_cyclist
        probability = 1 / (1 + np.exp(-logit))
        severe = int(rng.random() < probability)

        row = {
            "major_road": float(rng.integers(0, 2)),
            "speed_limit_kmh": speed,
            "at_junction": rng.uniform(0, 1),
            "daylight": float(rng.integers(0, 2)),
            "dark_lit": rng.uniform(0, 1),
            "dark_unlit": rng.uniform(0, 1),
            "raining": float(rng.integers(0, 2)),
            "snowing": 0.0,
            "high_wind": float(rng.integers(0, 2)),
            "fog_or_poor_visibility": float(rng.integers(0, 2)),
            "urban": rng.uniform(0, 1),
            "is_cyclist": is_cyclist,
            "hour_sin": rng.uniform(-1, 1),
            "hour_cos": rng.uniform(-1, 1),
            "is_weekend": float(rng.integers(0, 2)),
            "severe": severe,
            "collision_year": 2023 if i < n // 2 else 2024,
            "local_authority_ons_district": f"D{i % 20}",
        }
        rows.append(row)

    return pd.DataFrame(rows)


@pytest.fixture
def _trained_model_dir(tmp_path):
    """A real model directory, fitted on the synthetic-but-labelled table above."""

    table = _synthetic_table(12000)
    metadata = train_risk_model.train(table, model_dir=str(tmp_path))

    return tmp_path, metadata


def _point_module_at(monkeypatch, model_dir):
    monkeypatch.setattr(risk_model, "MODEL_PATH", str(model_dir / "risk_model.joblib"))
    monkeypatch.setattr(risk_model, "METADATA_PATH", str(model_dir / "risk_model.json"))
    risk_model.reset_cache()


def test_not_trained_status_when_no_model_exists(monkeypatch, tmp_path):
    monkeypatch.setattr(risk_model, "MODEL_PATH", str(tmp_path / "missing.joblib"))
    monkeypatch.setattr(risk_model, "METADATA_PATH", str(tmp_path / "missing.json"))

    result = risk_model.assess_route({"available": True}, {}, None, True, "walking")

    assert result["status"] == "not_trained"
    assert result["predicted_severe_share"] is None


# ==================================================
# checksum verification (ml/train_risk_model.py writes it, ml/risk_model.py checks it)
# ==================================================

def test_training_writes_a_real_matching_checksum(_trained_model_dir):
    model_dir, metadata = _trained_model_dir

    assert "model_sha256" in metadata
    assert len(metadata["model_sha256"]) == 64  # a real sha256 hex digest

    import hashlib

    real_digest = hashlib.sha256((model_dir / "risk_model.joblib").read_bytes()).hexdigest()
    assert metadata["model_sha256"] == real_digest
    assert metadata["model_bytes"] == (model_dir / "risk_model.joblib").stat().st_size


def test_a_corrupted_model_file_is_rejected_rather_than_loaded(monkeypatch, _trained_model_dir):
    model_dir, _ = _trained_model_dir
    _point_module_at(monkeypatch, model_dir)

    # Simulate exactly what the checksum exists to catch: a truncated
    # download or a bad copy, not a crafted attack.
    with open(model_dir / "risk_model.joblib", "r+b") as file:
        file.seek(0)
        file.write(b"\x00" * 16)

    result = risk_model.assess_route({"available": True}, {}, None, True, "walking")

    assert result["status"] == "not_trained"  # refused, not a crash, not a silent bad prediction


def test_a_model_with_no_recorded_checksum_still_loads(monkeypatch, _trained_model_dir):
    # Older metadata (before this check existed) must not be bricked by it.
    model_dir, _ = _trained_model_dir

    with open(model_dir / "risk_model.json", encoding="utf8") as file:
        metadata = json.load(file)

    del metadata["model_sha256"]

    with open(model_dir / "risk_model.json", "w", encoding="utf8") as file:
        json.dump(metadata, file)

    _point_module_at(monkeypatch, model_dir)

    result = risk_model.assess_route(
        {"available": True, "major_road_share": 0.1, "maxspeed_mean_kmh": 30, "junctions_per_km": 2, "lit_share": 0.8},
        {"built_up_share": 0.5}, None, True, "walking",
    )

    assert result["status"] == "ready"


def test_unsupported_mode_status_for_driving(monkeypatch, _trained_model_dir):
    model_dir, _ = _trained_model_dir
    _point_module_at(monkeypatch, model_dir)

    result = risk_model.assess_route({"available": True}, {}, None, True, "driving")

    assert result["status"] == "unsupported_mode"


def test_unavailable_status_when_road_data_missing(monkeypatch, _trained_model_dir):
    model_dir, _ = _trained_model_dir
    _point_module_at(monkeypatch, model_dir)

    result = risk_model.assess_route({"available": False}, {}, None, True, "walking")

    assert result["status"] == "unavailable"


def test_ready_status_reports_prediction_label_and_explanation(monkeypatch, _trained_model_dir):
    model_dir, _ = _trained_model_dir
    _point_module_at(monkeypatch, model_dir)

    road = {"available": True, "major_road_share": 0.1, "maxspeed_mean_kmh": 100, "junctions_per_km": 1, "lit_share": 0.9}

    result = risk_model.assess_route(road, {"built_up_share": 0.5}, None, True, "cycling")

    assert result["status"] == "ready"
    assert 0.0 <= result["predicted_severe_share"] <= 1.0
    assert result["risk_label"] in ("Lower relative risk", "Moderate relative risk", "Higher relative risk")
    assert isinstance(result["top_factors"], list)
    assert result["model_info"]["training_rows"] == 6000  # half of 12000 (2023 train year)


def test_high_speed_cyclist_predicts_higher_severity_than_low_speed_pedestrian(monkeypatch, _trained_model_dir):
    # Exercises the real, known relationship baked into the synthetic
    # training data: this is a sanity check on the pipeline's direction,
    # not a real-world claim.
    model_dir, _ = _trained_model_dir
    _point_module_at(monkeypatch, model_dir)

    fast_cyclist = risk_model.assess_route(
        {"available": True, "major_road_share": 0.0, "maxspeed_mean_kmh": 100, "junctions_per_km": 0, "lit_share": 1.0},
        {"built_up_share": 0.0}, None, True, "cycling",
    )
    slow_pedestrian = risk_model.assess_route(
        {"available": True, "major_road_share": 0.0, "maxspeed_mean_kmh": 20, "junctions_per_km": 0, "lit_share": 1.0},
        {"built_up_share": 0.0}, None, True, "walking",
    )

    assert fast_cyclist["predicted_severe_share"] > slow_pedestrian["predicted_severe_share"]


# ==================================================
# train_risk_model: refuses too little data, bootstrap significance
# ==================================================

def test_train_refuses_too_few_rows():
    table = _synthetic_table(100)

    with pytest.raises(ValueError, match="only"):
        train_risk_model.train(table)


def test_train_writes_real_model_and_metadata_files(tmp_path):
    table = _synthetic_table(12000)

    metadata = train_risk_model.train(table, model_dir=str(tmp_path))

    assert (tmp_path / "risk_model.joblib").exists()
    assert (tmp_path / "risk_model.json").exists()
    assert metadata["feature_columns"] == FEATURE_COLUMNS
    assert metadata["training_year"] == 2023
    assert metadata["test_year"] == 2024


def test_bootstrap_significance_is_high_for_a_clearly_learnable_relationship():
    table = _synthetic_table(12000)

    train_rows = table[table.collision_year == 2023]
    test_rows = table[table.collision_year == 2024]
    model = train_risk_model.new_classifier().fit(train_rows[FEATURE_COLUMNS], train_rows["severe"])
    proba = model.predict_proba(test_rows[FEATURE_COLUMNS])[:, 1]

    confidence = train_risk_model.bootstrap_auc_significance(test_rows["severe"], proba, samples=200)

    assert confidence > 0.9


def test_bootstrap_significance_is_low_for_pure_noise():
    rng = np.random.default_rng(1)
    y = rng.integers(0, 2, 500)
    proba = rng.uniform(0, 1, 500)  # unrelated to y

    confidence = train_risk_model.bootstrap_auc_significance(y, proba, samples=300)

    assert confidence < 0.9


def test_trained_model_is_validated_on_a_clearly_learnable_relationship(_trained_model_dir):
    _, metadata = _trained_model_dir

    assert metadata["validated"] is True
    assert metadata["bootstrap_confidence_auc_above_chance"] >= train_risk_model.MIN_BOOTSTRAP_CONFIDENCE


# ==================================================
# safety.py: AI/ML-aware ranking blend
# ==================================================

def _route(route_id, duration_min, distance_km, safety_score, confidence="high", ml_status="not_trained", predicted_severe_share=None):
    ml = {"status": ml_status}

    if predicted_severe_share is not None:
        ml["predicted_severe_share"] = predicted_severe_share

    return {
        "id": route_id,
        "duration_min": duration_min,
        "distance_km": distance_km,
        "safety_score": safety_score,
        "data_confidence": confidence,
        "ml_risk_assessment": ml,
    }


def test_ranking_score_equals_safety_score_when_ml_not_ready():
    for status in ("not_trained", "not_validated", "unsupported_mode", "unavailable"):
        route = _route("r1", 10, 1.0, 80, ml_status=status)
        assert _ranking_score(route) == 80


def test_ranking_score_is_none_when_safety_score_is_none():
    route = _route("r1", 10, 1.0, None)
    assert _ranking_score(route) is None


def test_ranking_score_blends_toward_ml_when_ready():
    route = _route("r1", 10, 1.0, 80, ml_status="ready", predicted_severe_share=1.0)

    # predicted_severe_share=1.0 -> ml_equivalent=0; a full-weight pull down.
    expected = (1 - ML_RANKING_WEIGHT) * 80 + ML_RANKING_WEIGHT * 0
    assert _ranking_score(route) == pytest.approx(expected)
    assert _ranking_score(route) < 80


def test_ranking_score_is_unchanged_when_ml_agrees_with_rule_score():
    # predicted_severe_share corresponding to exactly the same 0-100
    # value as the rule score leaves the blend at that same value.
    route = _route("r1", 10, 1.0, 80, ml_status="ready", predicted_severe_share=0.2)

    assert _ranking_score(route) == pytest.approx(80, abs=1e-6)


def test_categorize_routes_behaviour_is_identical_without_a_trained_ml_model():
    # Two routes, clear rule-based winner; ml status is the normal,
    # untrained state. Must behave exactly as if ml never existed.
    routes = [
        _route("a", 10, 1.0, 90),
        _route("b", 8, 0.9, 60),
    ]

    result = categorize_routes(routes)

    assert result["route_id"] == "a"
    assert routes[0]["ranking_score"] == 90
    assert routes[1]["ranking_score"] == 60


def test_ml_can_change_which_route_is_safest_within_tie_margin():
    # Two routes whose rule-based scores are close (within the tie
    # margin); without ML the quicker of the two near-tied routes wins.
    # A confident ML signal against route "a" can tip the choice to "b"
    # if it moves "a" out of the tie band - this is the AI/ML model's
    # one real, bounded point of influence (safety.py's module docstring).
    close_gap = SCORE_TIE_MARGIN  # exactly at the boundary, so both start tied

    without_ml = [
        _route("a", 10, 1.0, 80),
        _route("b", 8, 0.9, 80 - close_gap),
    ]
    assert categorize_routes(without_ml)["route_id"] == "b"  # quicker of the tied pair

    with_ml_against_a = [
        _route("a", 10, 1.0, 80, ml_status="ready", predicted_severe_share=1.0),
        _route("b", 8, 0.9, 80 - close_gap),
    ]
    result = categorize_routes(with_ml_against_a)

    # "a"'s ranking_score has been pulled down by ML enough to fall
    # outside the tie margin with "b", which is now the clear top score.
    assert with_ml_against_a[0]["ranking_score"] < with_ml_against_a[1]["ranking_score"]
    assert result["route_id"] == "b"


def test_ml_influence_is_bounded_and_cannot_invert_a_clear_rule_based_win():
    # Even the most extreme possible ML signal cannot overturn a rule-
    # based lead larger than ML_RANKING_WEIGHT * 100 points.
    routes = [
        _route("a", 10, 1.0, 100, ml_status="ready", predicted_severe_share=1.0),  # worst possible ML view of "a"
        _route("b", 10, 1.0, 100 - (ML_RANKING_WEIGHT * 100) - 1),
    ]

    assert categorize_routes(routes)["route_id"] == "a"
