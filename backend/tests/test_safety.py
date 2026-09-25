"""Scoring behaviour when data is missing, and route categories."""

from safety import calculate_safety_score, categorize_routes


FULL_METRICS = {
    "hospital_access": 0.9,
    "police_access": 0.8,
    "hospital_median_m": 450,
    "police_median_m": 600,
    "activity_coverage": 0.6,
    "longest_quiet_km": 0.4,
    "lit_ratio": 0.9,
    "lit_tagged_segments": 20,
}

UNAVAILABLE_OSM = {
    "hospital_access": None,
    "police_access": None,
    "activity_coverage": None,
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


def test_full_data_is_high_confidence():
    result = calculate_safety_score(FULL_METRICS, CLEAR_DAY, "walking")

    assert result["data_confidence"] == "high"
    assert all(f["available"] for f in result["factors"])
    assert result["risk_level"] in ("Lower risk", "Moderate risk", "Higher risk")


def test_missing_osm_data_is_not_scored_as_zero():
    result = calculate_safety_score(UNAVAILABLE_OSM, CLEAR_DAY, "walking")

    available = {f["key"]: f["available"] for f in result["factors"]}

    assert available == {
        "emergency": False,
        "activity": False,
        "lighting": False,
        "weather": True,
    }
    assert result["data_confidence"] == "low"
    # Weather alone is too little evidence to publish a score, and
    # the missing factors must not be scored as zero either.
    assert result["safety_score"] is None
    assert result["risk_level"] == "Insufficient data"
    assert any("unavailable" in e["text"] for e in result["explanations"])


def test_missing_street_data_lowers_confidence_but_still_scores():
    metrics = {
        **FULL_METRICS,
        "activity_coverage": None,
        "lit_ratio": None,
        "lit_tagged_segments": 0,
    }

    result = calculate_safety_score(metrics, CLEAR_DAY, "walking")

    assert result["safety_score"] is not None
    assert result["data_confidence"] == "medium"
    # Only emergency (87.5) and weather (100) count, re-weighted.
    assert result["safety_score"] == round((0.30 * 85 + 0.30 * 100) / 0.60)


def test_no_data_at_all_gives_no_score():
    result = calculate_safety_score(UNAVAILABLE_OSM, None, "walking")

    assert result["safety_score"] is None
    assert result["risk_level"] == "Insufficient data"


def test_explanations_never_claim_guaranteed_safety():
    result = calculate_safety_score(FULL_METRICS, CLEAR_DAY, "walking")

    for note in result["explanations"]:
        assert "guarantee" not in note["text"].lower()
        assert " is safe" not in note["text"].lower()


def test_categories_and_recommendation():
    routes = [
        {"id": "a", "duration_min": 10, "distance_km": 1.0, "safety_score": 70},
        {"id": "b", "duration_min": 14, "distance_km": 1.2, "safety_score": 90},
        {"id": "c", "duration_min": 12, "distance_km": 1.1, "safety_score": 85},
    ]

    recommended = categorize_routes(routes)

    assert recommended["id"] == "b"
    assert "safest" in routes[1]["categories"]
    assert "fastest" in routes[0]["categories"]
    assert sum("balanced" in r["categories"] for r in routes) == 1


def test_recommendation_falls_back_to_fastest_without_scores():
    routes = [
        {"id": "a", "duration_min": 10, "distance_km": 1.0, "safety_score": None},
        {"id": "b", "duration_min": 14, "distance_km": 1.2, "safety_score": None},
    ]

    assert categorize_routes(routes)["id"] == "a"


def test_weather_only_never_scores_even_when_heavily_weighted():
    # Driving by day weights weather at 0.40 - still not enough alone.
    result = calculate_safety_score(UNAVAILABLE_OSM, CLEAR_DAY, "driving")

    assert result["safety_score"] is None


def test_emergency_and_weather_at_night_still_scores_with_low_confidence():
    metrics = {
        **FULL_METRICS,
        "activity_coverage": None,
        "lit_ratio": None,
        "lit_tagged_segments": 0,
    }
    night = {**CLEAR_DAY, "is_day": False}

    result = calculate_safety_score(metrics, night, "walking")

    assert result["safety_score"] is not None
    assert result["data_confidence"] == "low"


def test_activity_not_applicable_for_driving():
    metrics = {**FULL_METRICS, "activity_coverage": None}

    result = calculate_safety_score(metrics, CLEAR_DAY, "driving")
    activity = next(f for f in result["factors"] if f["key"] == "activity")

    assert activity["applicable"] is False
    assert activity["weight"] == 0
    # Not applicable is not "missing": confidence stays high.
    assert result["data_confidence"] == "high"
    assert not any("activity" in e["text"].lower() for e in result["explanations"])
