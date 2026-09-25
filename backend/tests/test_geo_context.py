"""
Choosing between the local database and live Overpass data.
"""

import asyncio

import numpy as np
import pytest

import geo_context as gc


ROUTE = [[[76.30, 10.30], [76.31, 10.31]]]


class FakeStore:

    def __init__(self, covers=True):
        self._covers = covers
        self.margin_asked = None

    def covers(self, _geometries, margin_m):
        self.margin_asked = margin_m
        return self._covers

    def describe(self):
        return {"source": "Fake extract", "extract_date": "2026-01-01"}

    def ways_near(self, *_):
        return []

    def emergency_services(self, *_):
        return [{"id": "node-1", "kind": "hospital", "name": "H", "phone": None,
                 "emergency_ward": False, "lon": 76.3, "lat": 10.3}]

    def activity_places(self, *_):
        return [(76.3, 10.3)]

    def building_counts(self, samples):
        return np.full(len(samples), 4)


LIVE = {
    "emergency_available": True, "activity_available": False, "network_available": False,
    "emergency": [], "activity": [], "network": None,
}


@pytest.fixture
def live_calls(monkeypatch):
    calls = []

    async def fake_live(geometries, mode="walking", **_):
        calls.append(mode)
        return dict(LIVE)

    monkeypatch.setattr(gc, "get_live_context", fake_live)

    return calls


def context(mode="walking"):
    return asyncio.run(gc.get_geo_context(ROUTE, mode))


def test_covered_trip_uses_the_local_database_and_never_the_network(monkeypatch, live_calls):
    monkeypatch.setattr(gc, "get_store", lambda: FakeStore(covers=True))

    result = context()

    assert result["source"] == "local"
    assert live_calls == []
    assert result["dataset"]["source"] == "Fake extract"
    assert result["emergency_available"] and result["activity_available"]
    assert result["buildings_available"] is True
    assert len(result["emergency"]) == 1
    assert result["building_counts"]([[76.3, 10.3]]).tolist() == [4]


def test_uncovered_trip_falls_back_to_live_data(monkeypatch, live_calls):
    monkeypatch.setattr(gc, "get_store", lambda: FakeStore(covers=False))

    result = context()

    assert result["source"] == "overpass"
    assert live_calls == ["walking"]
    # Buildings are only in the local database: reported as unavailable.
    assert result["buildings_available"] is False
    assert result["building_counts"] is None


def test_missing_database_falls_back_to_live_data(monkeypatch, live_calls):
    monkeypatch.setattr(gc, "get_store", lambda: None)

    assert context()["source"] == "overpass"


def test_fallback_can_be_disabled_and_then_nothing_is_invented(monkeypatch, live_calls):
    monkeypatch.setattr(gc, "get_store", lambda: FakeStore(covers=False))
    monkeypatch.setattr(gc, "OVERPASS_FALLBACK", False)

    result = context()

    assert result["source"] == "none"
    assert live_calls == []
    assert result["emergency_available"] is False
    assert result["emergency"] == []


def test_coverage_margin_grows_with_the_emergency_search_radius(monkeypatch):
    store = FakeStore()
    monkeypatch.setattr(gc, "get_store", lambda: store)

    context("walking")
    walking = store.margin_asked
    context("driving")

    assert store.margin_asked > walking


def test_missing_database_file_is_handled(monkeypatch, tmp_path):
    monkeypatch.setattr(gc, "GEO_DB_PATH", str(tmp_path / "nope.sqlite"))
    gc.reset_store()

    assert gc.get_store() is None

    gc.reset_store()


def test_corrupt_database_file_is_handled(monkeypatch, tmp_path):
    broken = tmp_path / "broken.sqlite"
    broken.write_bytes(b"this is not a database")
    monkeypatch.setattr(gc, "GEO_DB_PATH", str(broken))
    gc.reset_store()

    assert gc.get_store() is None

    gc.reset_store()
