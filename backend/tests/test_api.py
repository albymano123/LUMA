"""
The HTTP API end to end (FastAPI TestClient) with every external
service replaced by fakes: request validation, the response contract,
failure handling, rate limiting, CORS and log privacy.
"""

import logging

import numpy as np
import pytest
from fastapi.testclient import TestClient

import main
import route_analyzer
from routing_service import RoutingError


BODY = {
    "source_lat": 10.3042, "source_lon": 76.3371,
    "destination_lat": 10.3717, "destination_lon": 76.3042,
    "mode": "walking",
}


def line(offset):
    return {
        "type": "LineString",
        "coordinates": [
            [76.3371, 10.3042], [76.3300 + offset, 10.3300], [76.3042, 10.3717],
        ],
    }


def fake_routes(mode="walking"):
    return [
        {"id": "route-1", "name": "Route A", "mode": mode, "distance_km": 9.0,
         "duration_min": 100.0, "geometry": line(0.0), "via_roads": ["A Road"],
         "generated_via_point": False},
        {"id": "route-2", "name": "Route B", "mode": mode, "distance_km": 11.0,
         "duration_min": 130.0, "geometry": line(0.01), "via_roads": ["B Road"],
         "generated_via_point": True},
    ]


def fake_context(**overrides):
    context = {
        "source": "local",
        "dataset": {"source": "Test extract", "extract_date": "2026-01-01"},
        "emergency_available": True,
        "activity_available": True,
        "network_available": False,
        "buildings_available": True,
        "emergency": [
            {"id": "node-1", "kind": "hospital", "name": "Test Hospital", "phone": None,
             "emergency_ward": True, "lon": 76.325, "lat": 10.33},
            {"id": "node-2", "kind": "police", "name": "Test Police", "phone": None,
             "emergency_ward": False, "lon": 76.32, "lat": 10.335},
        ],
        "activity": [(76.33, 10.32), (76.32, 10.34)],
        "network": None,
        "building_counts": lambda samples: np.full(len(samples), 6),
    }
    context.update(overrides)
    return context


CLEAR_WEATHER = {
    "temperature": 29, "apparent_temperature": 33, "weather_code": 1,
    "precipitation": 0, "wind_speed": 8, "visibility": 20000, "is_day": True,
    "time": "2026-09-25T10:00",
}


@pytest.fixture
def api(monkeypatch):
    """A client whose routing, map data and weather are all fakes."""

    async def routing(*_args, mode="walking", **_kwargs):
        return fake_routes(mode)

    async def geo(_geometries, _mode="walking"):
        return fake_context()

    async def weather(points):
        return [dict(CLEAR_WEATHER) for _ in points]

    monkeypatch.setattr(main, "get_alternative_routes", routing)
    monkeypatch.setattr(route_analyzer, "get_geo_context", geo)
    monkeypatch.setattr(route_analyzer, "get_weather_for_points", weather)
    main._request_log = main.TTLCache(ttl_seconds=120, max_items=100)

    return TestClient(main.app)


def post(client, **overrides):
    return client.post("/safe-route", json={**BODY, **overrides})


# ---------------- contract ----------------

def test_health_reports_status_and_data():
    response = TestClient(main.app).get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
    assert "geo_database" in response.json()


def test_successful_response_matches_the_contract(api):
    response = post(api)

    assert response.status_code == 200

    data = response.json()

    assert data["success"] is True
    assert data["total_routes"] == 2
    assert data["geo_source"]["type"] == "local"
    assert data["data_sources"]["emergency_services"] is True
    assert data["disclaimer"]

    for route in data["routes"]:
        assert route["safety_score"] is None or 0 <= route["safety_score"] <= 100
        assert route["risk_level"]
        assert route["data_confidence"] in ("high", "medium", "low")
        assert {f["key"] for f in route["factors"]} == {
            "emergency", "activity", "surroundings", "lighting", "road_safety", "weather",
        }
        assert route["ml_estimate"]["status"] == "not_trained"
        assert route["geometry"]["type"] == "LineString"


def test_recommendation_and_categories_are_consistent(api):
    data = post(api).json()

    recommendation = data["recommendation"]
    ids = {route["id"] for route in data["routes"]}

    assert recommendation["route_id"] in ids | {None}
    assert data["recommended_route_id"] == recommendation["route_id"]
    assert data["default_route_id"] in ids

    # The recommended route is the one tagged safest.
    if recommendation["route_id"]:
        tagged = [r["id"] for r in data["routes"] if "safest" in r["categories"]]
        assert tagged == [recommendation["route_id"]]

    assert sum("fastest" in r["categories"] for r in data["routes"]) == 1


def test_response_has_no_null_scores_disguised_as_zero(api):
    for route in post(api).json()["routes"]:
        assert route["safety_score"] != 0 or route["risk_level"] == "Higher risk"


# ---------------- validation ----------------

@pytest.mark.parametrize("field,value", [
    ("source_lat", 91), ("source_lat", -91), ("source_lon", 181),
    ("destination_lat", 999), ("destination_lon", -181),
])
def test_out_of_range_coordinates_are_rejected(api, field, value):
    assert post(api, **{field: value}).status_code == 422


def test_non_numeric_and_missing_fields_are_rejected(api):
    assert post(api, source_lat="north").status_code == 422
    assert api.post("/safe-route", json={"source_lat": 10}).status_code == 422
    assert api.post("/safe-route", json={**BODY, "mode": "flying"}).status_code == 422


def test_nan_and_infinity_are_rejected(api):
    response = api.post(
        "/safe-route",
        content='{"source_lat": NaN, "source_lon": 76, "destination_lat": 10, "destination_lon": 76}',
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 422


def test_same_place_is_rejected_with_a_message(api):
    response = post(api, destination_lat=BODY["source_lat"], destination_lon=BODY["source_lon"])

    assert response.status_code == 400
    assert "same place" in response.json()["detail"]["message"]


def test_trip_too_long_for_the_mode_is_rejected(api):
    # Kochi to Delhi on foot.
    response = post(api, destination_lat=28.6, destination_lon=77.2)

    assert response.status_code == 400
    assert "too long for walking" in response.json()["detail"]["message"]


# ---------------- failure handling ----------------

def test_no_route_found_is_a_404_with_a_friendly_message(api, monkeypatch):
    async def none_found(*_a, **_k):
        raise RoutingError("No route could be found between these locations.")

    monkeypatch.setattr(main, "get_alternative_routes", none_found)

    response = post(api)

    assert response.status_code == 404
    assert response.json()["detail"]["message"] == "No route could be found between these locations."


def test_routing_outage_is_a_502_without_leaking_internals(api, monkeypatch):
    async def down(*_a, **_k):
        raise RuntimeError("connect to router.project-osrm.org:443 failed: secret-detail")

    monkeypatch.setattr(main, "get_alternative_routes", down)

    response = post(api)

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "secret-detail" not in response.text
    assert "osrm" not in response.text.lower()
    assert detail["request_id"] == response.headers["X-Request-ID"]


def test_analysis_crash_is_a_500_without_leaking_internals(api, monkeypatch):
    async def crash(*_a, **_k):
        raise ValueError("internal secret path C:/secret")

    monkeypatch.setattr(main, "analyze_all_routes", crash)

    response = post(api)

    assert response.status_code == 500
    assert "secret" not in response.text
    assert response.json()["detail"]["request_id"]


def test_analysis_timeout_is_reported(api, monkeypatch):
    import asyncio

    async def slow(*_a, **_k):
        await asyncio.sleep(5)

    monkeypatch.setattr(main, "analyze_all_routes", slow)
    monkeypatch.setattr(main, "ANALYSIS_TIMEOUT_S", 0.05)

    response = post(api)

    assert response.status_code == 502
    assert "too long" in response.json()["detail"]["message"]


# ---------------- honesty when data sources fail ----------------

def test_weather_outage_is_reported_and_score_uses_the_rest(api, monkeypatch):
    async def no_weather(points):
        return [None for _ in points]

    monkeypatch.setattr(route_analyzer, "get_weather_for_points", no_weather)

    data = post(api).json()

    assert data["data_sources"]["weather"] is False

    for route in data["routes"]:
        weather = next(f for f in route["factors"] if f["key"] == "weather")
        assert weather["available"] is False and weather["score"] is None
        assert route["weather"] is None
        # Still scored from map data, but not with high confidence.
        assert route["safety_score"] is not None
        assert route["data_confidence"] != "high"


def test_map_data_outage_gives_no_score_and_no_recommendation(api, monkeypatch):
    async def no_map_data(_geometries, _mode="walking"):
        return fake_context(
            source="overpass", dataset=None,
            emergency_available=False, activity_available=False,
            network_available=False, buildings_available=False,
            emergency=[], activity=[], building_counts=None,
        )

    monkeypatch.setattr(route_analyzer, "get_geo_context", no_map_data)

    data = post(api).json()

    assert data["geo_source"]["type"] == "live"
    assert data["data_sources"]["emergency_services"] is False
    assert data["recommendation"]["state"] == "unavailable"
    assert data["recommended_route_id"] is None

    for route in data["routes"]:
        assert route["safety_score"] is None            # never a fabricated number
        assert route["risk_level"] == "Insufficient data"
        assert route["emergency_services"] == []         # never invented locations
        assert "safest" not in route["categories"]

    assert sum("fastest" in r["categories"] for r in data["routes"]) == 1


def test_emergency_locations_come_only_from_the_map_data(api):
    services = [
        service
        for route in post(api).json()["routes"]
        for service in route["emergency_services"]
    ]

    assert {s["name"] for s in services} <= {"Test Hospital", "Test Police"}


# ---------------- rate limiting, CORS, privacy ----------------

def test_rate_limit_returns_429_with_a_friendly_message(api, monkeypatch):
    monkeypatch.setitem(main.RATE_LIMITS, "/safe-route", (2, 60))

    assert post(api).status_code == 200
    assert post(api).status_code == 200

    blocked = post(api)

    assert blocked.status_code == 429
    assert "Too many requests" in blocked.json()["detail"]["message"]
    assert blocked.headers["Retry-After"] == "60"


def test_forwarded_address_is_only_trusted_when_configured(api, monkeypatch):
    monkeypatch.setitem(main.RATE_LIMITS, "/safe-route", (1, 60))

    monkeypatch.setattr(main.settings, "TRUST_PROXY", True)
    assert api.post("/safe-route", json=BODY, headers={"X-Forwarded-For": "1.1.1.1"}).status_code == 200
    # A different real client behind the same proxy gets its own allowance.
    assert api.post("/safe-route", json=BODY, headers={"X-Forwarded-For": "2.2.2.2"}).status_code == 200
    assert api.post("/safe-route", json=BODY, headers={"X-Forwarded-For": "1.1.1.1"}).status_code == 429


def test_cors_allows_the_app_origin_only(api):
    ask = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}

    allowed = api.options("/safe-route", headers={"Origin": "http://localhost:5173", **ask})
    blocked = api.options("/safe-route", headers={"Origin": "https://evil.example", **ask})

    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in blocked.headers
    assert "access-control-allow-credentials" not in allowed.headers


def test_locations_are_never_logged(api, caplog):
    caplog.set_level(logging.DEBUG)

    post(api, source_lat=10.123456, source_lon=76.654321)

    assert "10.1234" not in caplog.text
    assert "76.6543" not in caplog.text


def test_security_headers_and_request_id(api):
    response = post(api)

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert len(response.headers["X-Request-ID"]) == 12


# ---------------- streaming progress ----------------

def read_stream(client, body=BODY):
    import json

    response = client.post("/safe-route/stream", json=body)
    events = [json.loads(line) for line in response.text.splitlines() if line]

    return response, events


def test_stream_reports_real_stages_then_the_same_result(api):
    response, events = read_stream(api)
    names = [event["event"] for event in events]

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    assert names[-1] == "result"
    assert {"routes", "weather", "map_data"} <= set(names)
    assert events[names.index("routes")]["count"] == 2
    assert events[names.index("map_data")]["source"] == "local"

    # The streamed result is exactly what /safe-route returns.
    plain = post(api).json()
    streamed = events[-1]["data"]
    assert [r["id"] for r in streamed["routes"]] == [r["id"] for r in plain["routes"]]
    assert streamed["recommendation"] == plain["recommendation"]


def test_stream_only_reports_a_stage_when_it_has_finished(api, monkeypatch):
    import asyncio

    finished = []

    async def slow_geo(_geometries, _mode="walking"):
        await asyncio.sleep(0.3)
        finished.append("map_data")
        return fake_context()

    monkeypatch.setattr(route_analyzer, "get_geo_context", slow_geo)

    import json
    import time

    started = time.monotonic()
    times = {}

    with api.stream("POST", "/safe-route/stream", json=BODY) as response:
        for line in response.iter_lines():
            if line:
                event = json.loads(line)
                times[event["event"]] = time.monotonic() - started

    assert finished == ["map_data"]
    # The map-data event cannot arrive before the (0.3 s) load finished.
    assert times["map_data"] >= 0.3
    assert times["routes"] < times["map_data"]


def test_stream_ends_with_an_error_event_when_routing_fails(api, monkeypatch):
    async def down(*_a, **_k):
        raise RuntimeError("osrm exploded: secret-detail")

    monkeypatch.setattr(main, "get_alternative_routes", down)

    response, events = read_stream(api)

    assert response.status_code == 200          # the stream itself worked
    assert events[-1]["event"] == "error"
    assert events[-1]["status"] == 502
    assert events[-1]["request_id"]
    assert "secret-detail" not in response.text
    assert "result" not in [e["event"] for e in events]


def test_stream_reports_routing_not_found(api, monkeypatch):
    async def none_found(*_a, **_k):
        raise RoutingError("No route could be found between these locations.")

    monkeypatch.setattr(main, "get_alternative_routes", none_found)

    _, events = read_stream(api)

    assert events[-1] == {**events[-1], "event": "error", "status": 404,
                          "message": "No route could be found between these locations."}


def test_stream_validates_the_request_like_the_plain_endpoint(api):
    assert api.post("/safe-route/stream", json={**BODY, "source_lat": 999}).status_code == 422

    _, events = read_stream(api, {**BODY, "destination_lat": BODY["source_lat"], "destination_lon": BODY["source_lon"]})

    assert events[-1]["event"] == "error" and events[-1]["status"] == 400


def test_stream_is_rate_limited(api, monkeypatch):
    monkeypatch.setitem(main.RATE_LIMITS, "/safe-route/stream", (1, 60))

    assert api.post("/safe-route/stream", json=BODY).status_code == 200
    assert api.post("/safe-route/stream", json=BODY).status_code == 429


# ---------------- highlights ----------------

def test_isolated_stretches_are_reported_with_real_coordinates(api, monkeypatch):
    # Buildings for the first 40% of the route, none after.
    def counts(samples):
        n = len(samples)
        return np.array([8 if i < n * 0.4 else 0 for i in range(n)])

    async def geo(_geometries, _mode="walking"):
        return fake_context(building_counts=counts)

    monkeypatch.setattr(route_analyzer, "get_geo_context", geo)

    route = post(api).json()["routes"][0]

    assert route["highlights"], "a long empty stretch must be reported"

    stretch = route["highlights"][0]
    assert stretch["kind"] == "unbuilt"
    assert stretch["length_km"] >= 0.25
    assert len(stretch["coordinates"]) >= 2

    # The stretch lies on the route itself.
    route_lons = [c[0] for c in route["geometry"]["coordinates"]]
    assert min(route_lons) - 0.01 <= stretch["coordinates"][0][0] <= max(route_lons) + 0.01


def test_a_fully_built_up_route_has_no_highlights(api):
    for route in post(api).json()["routes"]:
        assert route["highlights"] == []
