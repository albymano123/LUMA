"""
The safety engine: honesty about missing data, weighting, the
Safest / Balanced / Fastest categories, and when a recommendation is
(and is not) defensible.
"""

import pytest

from safety import (
    SCORE_TIE_MARGIN,
    WEIGHTS,
    calculate_safety_score,
    categorize_routes,
)


FULL_METRICS = {
    "hospital_access": 0.9,
    "police_access": 0.8,
    "hospital_median_m": 450,
    "police_median_m": 600,
    "activity_coverage": 0.6,
    "longest_quiet_km": 0.4,
    "built_up_share": 0.9,
    "longest_unbuilt_km": 0.2,
    "lit_ratio": 0.9,
    "lit_coverage": 0.8,
    "lit_tagged_segments": 20,
    "major_road_share": 0.1,
    "sidewalk_share": 0.8,
    "sidewalk_coverage": 0.7,
    "maxspeed_mean_kmh": 30,
    "maxspeed_coverage": 0.6,
}

NO_MAP_DATA = {
    "hospital_access": None,
    "police_access": None,
    "activity_coverage": None,
    "built_up_share": None,
    "lit_ratio": None,
    "lit_tagged_segments": 0,
}

CLEAR_DAY = {
    "precipitation": 0,
    "wind_speed": 10,
    "visibility": 20000,
    "weather_code": 1,
    "is_day": True,
}


def factor(result, key):
    return next(f for f in result["factors"] if f["key"] == key)


# ---------------- weights ----------------

def test_every_weight_row_sums_to_one():
    for key, row in WEIGHTS.items():
        assert sum(row.values()) == pytest.approx(1.0), key


# ---------------- honesty about missing data ----------------

def test_full_data_is_high_confidence():
    result = calculate_safety_score(FULL_METRICS, CLEAR_DAY, "walking")

    assert result["data_confidence"] == "high"
    assert all(f["available"] for f in result["factors"])
    assert result["risk_level"] in ("Lower risk", "Moderate risk", "Higher risk")


def test_missing_map_data_is_not_scored_as_zero():
    result = calculate_safety_score(NO_MAP_DATA, CLEAR_DAY, "walking")

    available = {f["key"]: f["available"] for f in result["factors"]}

    assert available == {
        "emergency": False,
        "activity": False,
        "surroundings": False,
        "lighting": False,
        "road_safety": False,
        "weather": True,
    }
    assert result["data_confidence"] == "low"
    # Weather alone is too little evidence to publish a score, and
    # the missing factors must not be scored as zero either.
    assert result["safety_score"] is None
    assert result["risk_level"] == "Insufficient data"
    assert any("unavailable" in e["text"] for e in result["explanations"])


def test_no_data_at_all_gives_no_score():
    result = calculate_safety_score(NO_MAP_DATA, None, "walking")

    assert result["safety_score"] is None
    assert result["risk_level"] == "Insufficient data"


def test_weather_only_never_scores_even_when_heavily_weighted():
    result = calculate_safety_score(NO_MAP_DATA, CLEAR_DAY, "driving")

    assert result["safety_score"] is None


def test_missing_factors_lower_confidence_but_still_score():
    metrics = {
        **FULL_METRICS,
        "activity_coverage": None,
        "built_up_share": None,
        "lit_ratio": None,
        "major_road_share": None,
    }

    result = calculate_safety_score(metrics, CLEAR_DAY, "walking")

    # Half the weight is missing: still scored, but flagged low confidence.
    assert result["safety_score"] is not None
    assert result["data_confidence"] == "low"

    # Only emergency (85) and weather (100) count, re-weighted.
    weights = WEIGHTS[("walking", True)]
    expected = (weights["emergency"] * 85 + weights["weather"] * 100) / (
        weights["emergency"] + weights["weather"]
    )
    assert result["safety_score"] == round(expected)


def test_too_little_evidence_at_night_gives_no_score():
    metrics = {
        **FULL_METRICS,
        "activity_coverage": None,
        "built_up_share": None,
        "lit_ratio": None,
        "major_road_share": None,
    }

    result = calculate_safety_score(metrics, {**CLEAR_DAY, "is_day": False}, "walking")

    # At night emergency + weather are only 30% of the weight: too little
    # to publish a number.
    assert result["safety_score"] is None
    assert result["risk_level"] == "Insufficient data"


def test_sparsely_tagged_lighting_is_not_trusted():
    # 5 lit streets out of a route that is 95% untagged says nothing.
    metrics = {**FULL_METRICS, "lit_ratio": 1.0, "lit_coverage": 0.05}

    result = calculate_safety_score(metrics, CLEAR_DAY, "walking")

    assert factor(result, "lighting")["available"] is False
    assert any("not mapped" in e["text"] for e in result["explanations"])


def test_sparse_sidewalk_and_speed_tags_are_left_out_of_road_safety():
    dense = calculate_safety_score({**FULL_METRICS, "sidewalk_share": 0.5}, CLEAR_DAY, "walking")
    sparse = calculate_safety_score(
        {**FULL_METRICS, "sidewalk_coverage": 0.05, "maxspeed_coverage": 0.05},
        CLEAR_DAY,
        "walking",
    )

    # Without trusted sidewalk/speed data only the main-road share counts:
    # 100 * (1 - 0.1) = 90.
    assert factor(sparse, "road_safety")["score"] == 90
    assert factor(dense, "road_safety")["score"] != 90


# ---------------- factors behave sensibly ----------------

def test_isolated_route_scores_lower_than_built_up_route():
    built = calculate_safety_score(FULL_METRICS, CLEAR_DAY, "walking")
    isolated = calculate_safety_score(
        {**FULL_METRICS, "built_up_share": 0.2, "longest_unbuilt_km": 2.0},
        CLEAR_DAY,
        "walking",
    )

    assert factor(isolated, "surroundings")["score"] < factor(built, "surroundings")["score"]
    assert isolated["safety_score"] < built["safety_score"]
    assert any("isolated" in e["text"] for e in isolated["explanations"])


def test_main_road_exposure_lowers_walking_score():
    quiet = calculate_safety_score({**FULL_METRICS, "major_road_share": 0.05}, CLEAR_DAY, "walking")
    busy = calculate_safety_score({**FULL_METRICS, "major_road_share": 0.9}, CLEAR_DAY, "walking")

    assert busy["safety_score"] < quiet["safety_score"]


def test_bad_weather_lowers_score():
    storm = {**CLEAR_DAY, "precipitation": 9, "wind_speed": 55, "weather_code": 95}

    good = calculate_safety_score(FULL_METRICS, CLEAR_DAY, "walking")
    bad = calculate_safety_score(FULL_METRICS, storm, "walking")

    assert bad["safety_score"] < good["safety_score"]


def test_score_does_not_grow_with_route_length():
    # Scores are built from shares of the route, not raw counts, so
    # identical measurements give identical scores whatever the length.
    assert (
        calculate_safety_score(FULL_METRICS, CLEAR_DAY, "walking")["safety_score"]
        == calculate_safety_score({**FULL_METRICS}, CLEAR_DAY, "walking")["safety_score"]
    )


def test_more_hospitals_do_not_mean_perfectly_safe():
    result = calculate_safety_score(
        {**FULL_METRICS, "hospital_access": 1.0, "police_access": 1.0,
         "built_up_share": 0.0, "longest_unbuilt_km": 3.0},
        CLEAR_DAY,
        "walking",
    )

    assert result["safety_score"] < 100


def test_activity_and_road_safety_not_applicable_for_driving():
    result = calculate_safety_score(FULL_METRICS, CLEAR_DAY, "driving")

    for key in ("activity", "road_safety"):
        assert factor(result, key)["applicable"] is False
        assert factor(result, key)["weight"] == 0

    # Not applicable is not "missing": confidence stays high.
    assert result["data_confidence"] == "high"
    assert not any("activity" in e["text"].lower() for e in result["explanations"])


def test_night_raises_lighting_weight():
    assert WEIGHTS[("walking", False)]["lighting"] > WEIGHTS[("walking", True)]["lighting"]


def test_language_never_claims_guaranteed_safety():
    banned = ("guarantee", "100% safe", "completely safe", " is safe")

    for mode in ("walking", "cycling", "driving"):
        for weather in (CLEAR_DAY, {**CLEAR_DAY, "is_day": False}, None):
            result = calculate_safety_score(FULL_METRICS, weather, mode)

            for note in result["explanations"]:
                assert not any(word in note["text"].lower() for word in banned)


# ---------------- categories and recommendation ----------------

def route(route_id, minutes, km, score, confidence="high"):
    return {
        "id": route_id,
        "duration_min": minutes,
        "distance_km": km,
        "safety_score": score,
        "data_confidence": confidence,
    }


def tagged(routes, category):
    return [r["id"] for r in routes if category in r["categories"]]


def test_clear_winner_is_recommended():
    routes = [route("a", 10, 1.0, 70), route("b", 14, 1.2, 90), route("c", 12, 1.1, 82)]

    result = categorize_routes(routes)

    assert result["state"] == "recommended"
    assert result["route_id"] == "b"
    assert tagged(routes, "safest") == ["b"]
    assert tagged(routes, "fastest") == ["a"]
    assert len(tagged(routes, "balanced")) == 1


def test_scores_within_margin_are_a_tie_broken_by_time():
    routes = [route("a", 20, 2.0, 90), route("b", 12, 1.3, 89), route("c", 30, 3.0, 70)]

    result = categorize_routes(routes)

    assert 90 - 89 <= SCORE_TIE_MARGIN
    assert result["state"] == "tie"
    assert result["route_id"] == "b"          # quicker of the near-equal pair
    assert tagged(routes, "safest") == ["b"]


def test_close_scores_are_flagged_as_close():
    routes = [route("a", 10, 1.0, 80), route("b", 13, 1.2, 84)]

    result = categorize_routes(routes)

    assert result["state"] == "close"
    assert result["route_id"] == "b"


def test_single_route():
    routes = [route("a", 10, 1.0, 80)]

    result = categorize_routes(routes)

    assert result["state"] == "single"
    assert result["route_id"] == "a"


def test_no_scores_means_no_recommendation_only_a_default():
    routes = [route("a", 10, 1.0, None, "low"), route("b", 14, 1.2, None, "low")]

    result = categorize_routes(routes)

    assert result["state"] == "unavailable"
    assert result["route_id"] is None            # never labelled "recommended"
    assert result["default_route_id"] == "a"     # merely the quickest
    assert tagged(routes, "safest") == []
    assert tagged(routes, "fastest") == ["a"]
    assert "safest" in result["reason"]


def test_low_confidence_winner_is_not_recommended():
    routes = [route("a", 10, 1.0, 60), route("b", 14, 1.2, 95, "low")]

    result = categorize_routes(routes)

    assert result["state"] == "unavailable"
    assert result["route_id"] is None
    assert result["default_route_id"] == "a"


def test_recommendation_is_deterministic():
    def build():
        return [route("a", 10, 1.0, 80), route("b", 12, 1.1, 80), route("c", 9, 0.9, 60)]

    first = categorize_routes(build())
    second = categorize_routes(list(reversed(build())))

    assert first["route_id"] == second["route_id"]


def test_no_routes():
    result = categorize_routes([])

    assert result["route_id"] is None
    assert result["default_route_id"] is None
