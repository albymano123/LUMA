"""
Route generation with the OSRM servers replaced by a fake: distinct
alternatives only, no absurd detours, no routes that double back, and
clear failure when nothing can be found.
"""

import asyncio
import math

import pytest

import routing_service as rs
from geo import haversine_m, line_length_m, route_overlap, resample_line


SOURCE = (10.3042, 76.3371)
DESTINATION = (10.3717, 76.3042)


def densify(points, step_m=60):
    """[lon, lat] polyline with a point about every step_m metres."""

    out = [points[0]]

    for a, b in zip(points, points[1:]):
        n = max(1, int(haversine_m(a[1], a[0], b[1], b[0]) // step_m))
        for i in range(1, n + 1):
            out.append([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n])

    return out


def osrm_route(points, summary="Main Road"):
    coordinates = densify(points)
    metres = line_length_m(coordinates)

    return {
        "distance": metres,
        "duration": metres / 1.4,
        "geometry": {"type": "LineString", "coordinates": coordinates},
        "legs": [{"summary": summary}],
    }


def lonlat(place):
    return [place[1], place[0]]


DIRECT = [lonlat(SOURCE), lonlat(DESTINATION)]


def via_route(waypoints):
    """A route through the requested via point, as a straight-line detour."""

    return osrm_route([lonlat(p) for p in waypoints], summary="Detour Road")


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch):
    monkeypatch.setattr(rs, "_route_cache", rs.TTLCache(ttl_seconds=60))


def install(monkeypatch, handler):
    calls = []

    async def fake(_client, mode, waypoints, alternatives):
        calls.append((mode, waypoints, alternatives))
        return handler(mode, waypoints, alternatives)

    monkeypatch.setattr(rs, "_request_osrm", fake)

    return calls


def get(mode="walking"):
    return asyncio.run(rs.get_alternative_routes(*SOURCE, *DESTINATION, mode=mode))


def test_returns_distinct_alternatives_fastest_first(monkeypatch):
    def handler(_mode, waypoints, _alternatives):
        if len(waypoints) == 2:
            return [osrm_route(DIRECT)]
        return [via_route(waypoints)]

    install(monkeypatch, handler)

    routes = get()

    assert 2 <= len(routes) <= rs.MAX_ROUTES
    assert [r["id"] for r in routes] == [f"route-{i + 1}" for i in range(len(routes))]
    assert [r["name"] for r in routes] == [f"Route {chr(65 + i)}" for i in range(len(routes))]
    assert [r["duration_min"] for r in routes] == sorted(r["duration_min"] for r in routes)
    assert all(r["mode"] == "walking" for r in routes)


def test_routes_are_meaningfully_different(monkeypatch):
    install(monkeypatch, lambda _m, w, _a: [osrm_route(DIRECT)] if len(w) == 2 else [via_route(w)])

    routes = get()
    samples = [resample_line(r["geometry"]["coordinates"], 80, 300) for r in routes]

    for i, a in enumerate(samples):
        for b in samples[i + 1:]:
            assert route_overlap(a, b) <= rs.MAX_OVERLAP


def test_near_duplicate_routes_are_dropped(monkeypatch):
    def handler(_mode, waypoints, _alternatives):
        if len(waypoints) == 2:
            # OSRM's "alternative" is the same road, shifted by a few metres.
            shifted = [[lon + 0.00002, lat] for lon, lat in DIRECT]
            return [osrm_route(DIRECT), osrm_route(shifted)]
        return []

    install(monkeypatch, handler)

    assert len(get()) == 1


def test_absurd_detours_are_dropped(monkeypatch):
    def handler(_mode, waypoints, _alternatives):
        if len(waypoints) == 2:
            return [osrm_route(DIRECT)]

        # Every via route goes ~3x the direct distance.
        mid = waypoints[1]
        far = (mid[0] + 0.25, mid[1] + 0.25)
        return [osrm_route([lonlat(SOURCE), lonlat(far), lonlat(DESTINATION)])]

    install(monkeypatch, handler)

    routes = get()

    assert len(routes) == 1
    assert routes[0]["distance_km"] == min(r["distance_km"] for r in routes)


def test_routes_that_double_back_are_dropped(monkeypatch):
    out_and_back = [lonlat(SOURCE)]

    # Walk 1.5 km out along a side road and come back the same way.
    for i in range(1, 26):
        out_and_back.append([SOURCE[1] + 0.0005 * i, SOURCE[0] + 0.0001 * i])
    for i in range(24, 0, -1):
        out_and_back.append([SOURCE[1] + 0.0005 * i, SOURCE[0] + 0.0001 * i])
    out_and_back.append(lonlat(DESTINATION))

    def handler(_mode, waypoints, _alternatives):
        if len(waypoints) == 2:
            return [osrm_route(DIRECT)]
        return [osrm_route(out_and_back, "Dead End")]

    install(monkeypatch, handler)

    routes = get()

    assert all("Dead End" not in " ".join(r["via_roads"]) for r in routes)
    assert len(routes) == 1


def test_no_route_raises_a_clear_error(monkeypatch):
    install(monkeypatch, lambda *_: [])

    with pytest.raises(rs.RoutingError, match="No route could be found"):
        get()


def test_unsupported_mode_is_rejected():
    with pytest.raises(rs.RoutingError):
        get(mode="flying")


def test_results_are_cached(monkeypatch):
    calls = install(monkeypatch, lambda _m, w, _a: [osrm_route(DIRECT)] if len(w) == 2 else [])

    get()
    first = len(calls)
    get()

    assert first > 0
    assert len(calls) == first


def test_each_mode_uses_its_own_profile():
    assert "routed-foot" in rs.OSRM_PROFILES["walking"][0]
    assert "routed-bike" in rs.OSRM_PROFILES["cycling"][0]
    assert "routed-car" in rs.OSRM_PROFILES["driving"][0]


def test_via_points_sit_on_both_sides_of_the_direct_line():
    candidates = rs._via_candidates(SOURCE, DESTINATION)

    assert len(candidates) == 4

    mid_lat = (SOURCE[0] + DESTINATION[0]) / 2
    mid_lon = (SOURCE[1] + DESTINATION[1]) / 2
    heading = rs.bearing_rad(*SOURCE, *DESTINATION)

    sides = set()

    for lat, lon in candidates:
        cross = math.sin(heading) * (lat - mid_lat) - math.cos(heading) * (lon - mid_lon)
        sides.add(cross > 0)

    assert sides == {True, False}
