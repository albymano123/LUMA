"""
Sanity checks against the REAL Kerala database (backend/data/kerala_geo.sqlite).
They check that the map data and the scoring pipeline behave sensibly
on real places. Skipped when the database has not been built.

Everything here is offline: only the weather service is replaced.
"""

import asyncio
import os

import pytest

import geo_context
import route_analyzer
from geo import resample_line
from geodata.store import GeoStore
from road_features import build_network, road_network_features
from settings import GEO_DB_PATH


pytestmark = pytest.mark.skipif(
    not os.path.exists(GEO_DB_PATH),
    reason="local geo-database not built (python -m geodata.build)",
)

# Rough centre lines (lon, lat) of real trips.
KOCHI_CITY = [[76.2846, 9.9716], [76.2900, 9.9800], [76.2999, 9.9816]]        # MG Road area
CHALAKUDY_KODAKARA = [[76.3371, 10.3042], [76.3200, 10.3300], [76.3042, 10.3717]]
ATHIRAPPILLY_FOREST = [[76.5700, 10.2850], [76.6400, 10.2600], [76.7000, 10.2300]]
DELHI = [[77.2, 28.6], [77.21, 28.61]]
PALAKKAD_BORDER = [[76.83, 10.80], [76.84, 10.81]]


@pytest.fixture(scope="module")
def store():
    return GeoStore(GEO_DB_PATH)


def test_database_has_kerala_scale_data(store):
    stats = store.stats()

    assert stats["ways"] > 300_000
    assert stats["places"]["hospital"] > 2_000
    assert stats["places"]["police"] > 300
    assert stats["places"]["activity"] > 50_000
    assert store.describe()["extract_date"]


def test_coverage_matches_geography(store):
    assert store.covers([KOCHI_CITY], 2000)
    assert store.covers([CHALAKUDY_KODAKARA], 5000)
    assert not store.covers([DELHI], 0)
    # Near the Tamil Nadu border, emergency services across it are missing.
    assert not store.covers([PALAKKAD_BORDER], 5000)


def test_kochi_has_many_hospitals_and_police_nearby(store):
    found = store.emergency_services([KOCHI_CITY], 2000)
    kinds = [s["kind"] for s in found]

    assert sum(k in ("hospital", "clinic") for k in kinds) >= 10
    assert kinds.count("police") >= 2


def test_chalakudy_has_a_police_station_and_a_hospital_within_a_few_km(store):
    found = store.emergency_services([CHALAKUDY_KODAKARA], 2000)
    kinds = {s["kind"] for s in found}

    assert "police" in kinds
    assert kinds & {"hospital", "clinic"}


def test_emergency_places_have_real_coordinates_inside_kerala(store):
    for service in store.emergency_services([KOCHI_CITY], 5000):
        assert 8.0 < service["lat"] < 13.0
        assert 74.5 < service["lon"] < 77.5


def test_city_is_far_more_built_up_than_a_forest_road(store):
    def built_up(route):
        samples = resample_line(route, 50, 600)
        return (store.building_counts(samples) >= 3).mean()

    # (The Kochi line crosses some harbour water, so it is not 100%.)
    assert built_up(KOCHI_CITY) > 0.5
    assert built_up(ATHIRAPPILLY_FOREST) < 0.2
    assert built_up(KOCHI_CITY) > 3 * built_up(ATHIRAPPILLY_FOREST)


def test_road_features_on_a_real_route_are_plausible(store):
    ways = store.ways_near([CHALAKUDY_KODAKARA], 45)
    features = road_network_features(CHALAKUDY_KODAKARA, build_network(ways))

    assert features["available"]
    assert features["matched_segments"] > 50

    shares = [features[f"{n}_road_share"] for n in ("major", "local", "pedestrian_cycle", "other")]

    assert sum(shares) == pytest.approx(1.0, abs=0.02)
    assert 0 < features["junctions_per_km"] < 60
    assert 0 <= features["dead_ends_per_km"] < 30
    # Kerala's OSM has almost no lighting tags: coverage must be honest.
    assert features["lit_coverage"] < 0.3


def analyze(routes, monkeypatch, mode="walking"):
    async def weather(points):
        return [{"temperature": 29, "apparent_temperature": 32, "weather_code": 1,
                 "precipitation": 0, "wind_speed": 8, "visibility": 20000,
                 "is_day": True, "time": "t"} for _ in points]

    monkeypatch.setattr(route_analyzer, "get_weather_for_points", weather)
    geo_context.reset_store()

    prepared = [
        {"id": f"route-{i + 1}", "name": f"Route {i + 1}", "mode": mode, "distance_km": 5.0 + i,
         "duration_min": 60.0 + 10 * i, "geometry": {"type": "LineString", "coordinates": line},
         "via_roads": [], "generated_via_point": False}
        for i, line in enumerate(routes)
    ]

    return asyncio.run(route_analyzer.analyze_all_routes(prepared, mode))


def test_full_analysis_on_real_data_is_scored_and_uses_the_local_database(monkeypatch):
    result = analyze([KOCHI_CITY, CHALAKUDY_KODAKARA], monkeypatch)

    assert result["geo_source"]["type"] == "local"
    assert all(result["data_sources"].values())

    for route in result["routes"]:
        assert route["safety_score"] is not None
        assert route["data_confidence"] in ("high", "medium")
        assert route["emergency_services"]
        assert route["ml_estimate"]["status"] == "not_trained"


def test_analysis_is_deterministic(monkeypatch):
    first = analyze([KOCHI_CITY, CHALAKUDY_KODAKARA], monkeypatch)
    second = analyze([KOCHI_CITY, CHALAKUDY_KODAKARA], monkeypatch)

    assert [r["safety_score"] for r in first["routes"]] == [r["safety_score"] for r in second["routes"]]
    assert first["recommendation"] == second["recommendation"]


def test_isolated_forest_road_scores_lower_than_the_city_on_surroundings(monkeypatch):
    result = analyze([KOCHI_CITY, ATHIRAPPILLY_FOREST], monkeypatch)

    def surroundings(route):
        return next(f for f in route["factors"] if f["key"] == "surroundings")["score"]

    city, forest = result["routes"]

    assert surroundings(forest) < surroundings(city)
    assert any("isolated" in e["text"] for e in forest["explanations"])


def test_driving_analysis_does_not_score_walking_only_factors(monkeypatch):
    result = analyze([KOCHI_CITY], monkeypatch, mode="driving")

    factors = {f["key"]: f for f in result["routes"][0]["factors"]}

    assert factors["activity"]["applicable"] is False
    assert factors["road_safety"]["applicable"] is False
    assert factors["emergency"]["available"] and factors["weather"]["available"]


def test_uncovered_trip_does_not_touch_the_local_database(monkeypatch):
    # Outside Kerala the live path is used; here it is switched off to
    # prove nothing is invented in its place.
    monkeypatch.setattr(geo_context, "OVERPASS_FALLBACK", False)
    result = analyze([DELHI], monkeypatch)

    route = result["routes"][0]

    assert route["safety_score"] is None
    assert route["emergency_services"] == []
    assert result["recommendation"]["state"] == "unavailable"
