"""
The local map database: encoding, spatial queries, coverage. Uses a tiny
database built inside the test, so it needs neither the real data nor
the network.
"""

import json
import math
import sqlite3

import numpy as np
import pytest

import road_features as rf
from geodata.codec import cell_key, decode_nodes, encode_nodes
from geodata.coverage import inside_margin, parse_poly
from geodata.schema import DDL, SCHEMA_VERSION
from geodata.store import GeoStore
from road_tags import way_attributes


# A 0.5 x 0.5 degree "region": lon 76.0-76.5, lat 10.0-10.5
POLYGON = [[76.0, 10.0], [76.5, 10.0], [76.5, 10.5], [76.0, 10.5], [76.0, 10.0]]

MAIN_STREET = [[76.25 + i * 0.0009, 10.25] for i in range(0, 12)]


def build_test_db(path, schema_version=SCHEMA_VERSION):

    connection = sqlite3.connect(path)
    connection.executescript(DDL)

    meta = {
        "schema_version": schema_version,
        "source": "Test extract",
        "extract_timestamp": "2026-09-01T00:00:00Z",
        "coverage_polygon": json.dumps(POLYGON),
        "way_count": 2,
        "poi_counts": json.dumps({"hospital": 1}),
        "attribution": "test",
    }
    connection.executemany("INSERT INTO meta VALUES (?,?)", [(k, str(v)) for k, v in meta.items()])

    pois = [
        # id, ref, kind, name, phone, ward, lon, lat
        (1, "node-1", "hospital", "Near Hospital", "+91 1", 1, 76.2500, 10.2510, "24/7"),
        (2, "node-2", "police", "Near Police", None, 0, 76.2540, 10.2490, None),
        (3, "node-3", "clinic", "Far Clinic", None, 0, 76.4000, 10.4000, "Mo-Sa 09:00-17:00"),
        (4, "node-4", "activity", None, None, 0, 76.2520, 10.2502, None),
        (5, "node-5", "activity", None, None, 0, 76.4400, 10.4400, None),
    ]
    connection.executemany("INSERT INTO pois VALUES (?,?,?,?,?,?,?,?,?)", pois)
    connection.executemany(
        "INSERT INTO pois_idx VALUES (?,?,?,?,?)",
        [(p[0], p[6], p[6], p[7], p[7]) for p in pois],
    )

    lit_street = way_attributes({"highway": "residential", "sidewalk": "both", "lit": "yes", "maxspeed": "30"})
    plain = way_attributes({"highway": "tertiary"})

    def way_row(way_id, attributes, coords):
        coords = np.array(coords)
        speed = attributes["speed"]
        connection.execute(
            "INSERT INTO ways VALUES (?,?,?,?,?,?,?,?)",
            (way_id, attributes["highway"], attributes["road_class"], attributes["sidewalk"],
             None if math.isnan(speed) else speed, attributes["paved"], attributes["lit"],
             encode_nodes(coords)),
        )
        connection.execute(
            "INSERT INTO ways_idx VALUES (?,?,?,?,?)",
            (way_id, coords[:, 0].min(), coords[:, 0].max(), coords[:, 1].min(), coords[:, 1].max()),
        )

    way_row(1, lit_street, MAIN_STREET)
    way_row(2, plain, [[76.45, 10.45], [76.451, 10.451]])   # far away

    # 7 buildings in the cell of the middle of the street, none elsewhere.
    middle = MAIN_STREET[5]
    key = int(cell_key(middle[0], middle[1]))
    connection.execute("INSERT INTO building_cells VALUES (?,?)", (key, 7))

    connection.commit()
    connection.close()


@pytest.fixture
def store(tmp_path):
    path = str(tmp_path / "test_geo.sqlite")
    build_test_db(path)
    return GeoStore(path)


# ---------------- encoding ----------------

def test_way_geometry_round_trips_exactly_enough():
    coords = np.array([[76.2536781, 10.3070123], [76.2540002, 10.3071999], [76.2539, 10.30]])

    decoded = decode_nodes(encode_nodes(coords))

    assert decoded.shape == coords.shape
    assert np.abs(decoded - coords).max() < 1e-7


def test_encoding_is_compact():
    coords = np.array([[76.25 + i * 0.0001, 10.3 + i * 0.00005] for i in range(60)])

    assert len(encode_nodes(coords)) < coords.size * 8 / 2


def test_grid_cell_key_is_stable_and_local():
    same = cell_key(np.array([76.25001, 76.25002]), np.array([10.3, 10.3]))
    far = cell_key(np.array([76.26]), np.array([10.3]))

    assert same[0] == same[1]
    assert far[0] != same[0]


# ---------------- store ----------------

def test_describes_itself(store):
    assert store.describe() == {
        "source": "Test extract",
        "extract_date": "2026-09-01",
        "attribution": "test",
    }
    assert store.stats()["ways"] == 2


def test_schema_mismatch_is_refused(tmp_path):
    path = str(tmp_path / "old.sqlite")
    build_test_db(path, schema_version=1)

    with pytest.raises(ValueError, match="rebuild"):
        GeoStore(path)


def test_database_is_read_only(store):
    with pytest.raises(sqlite3.OperationalError):
        store._connection().execute("DELETE FROM pois")


def test_emergency_services_within_radius_only(store):
    found = store.emergency_services([MAIN_STREET], radius_m=2000)

    assert {s["name"] for s in found} == {"Near Hospital", "Near Police"}

    hospital = next(s for s in found if s["kind"] == "hospital")
    assert hospital["emergency_ward"] is True
    assert hospital["phone"] == "+91 1"
    assert hospital["opening_hours"] == "24/7"

    police = next(s for s in found if s["kind"] == "police")
    assert police["opening_hours"] is None      # not mapped: stays None, never invented


def test_emergency_search_reaches_farther_when_asked(store):
    found = store.emergency_services([MAIN_STREET], radius_m=30_000)

    assert "Far Clinic" in {s["name"] for s in found}


def test_activity_places_are_only_those_near_the_route(store):
    found = store.activity_places([MAIN_STREET], radius_m=100)

    assert found == [(76.2520, 10.2502)]


def test_ways_near_returns_the_street_with_its_tags(store):
    ways = store.ways_near([MAIN_STREET], radius_m=45)

    assert len(ways) == 1
    assert ways[0]["highway"] == "residential"
    assert ways[0]["sidewalk"] == 1
    assert ways[0]["lit"] == 1
    assert ways[0]["speed"] == 30
    assert ways[0]["coords"].shape == (12, 2)

    network = rf.build_network(ways)
    features = rf.road_network_features(MAIN_STREET, network)

    assert features["available"]
    assert features["lit_share"] == 1.0


def test_missing_speed_comes_back_as_nan_not_zero(store):
    ways = store.ways_near([[[76.45, 10.45], [76.451, 10.451]]], radius_m=45)

    assert math.isnan(ways[0]["speed"])


def test_building_counts_use_the_surrounding_cells(store):
    middle = MAIN_STREET[5]
    far = [76.30, 10.30]

    counts = store.building_counts([middle, far])

    assert counts[0] == 7
    assert counts[1] == 0

    # A point one cell (~50 m) away still sees the same buildings.
    assert store.building_counts([[middle[0] + 0.0004, middle[1]]])[0] == 7


def test_ways_in_box_for_training_data(store):
    assert len(store.ways_in_box(76.24, 76.27, 10.24, 10.26)) == 1
    assert len(store.ways_in_box(76.0, 76.5, 10.0, 10.5)) == 2


# ---------------- coverage ----------------

def test_route_inside_the_area_is_covered(store):
    assert store.covers([MAIN_STREET], margin_m=2000) is True


def test_route_near_the_border_is_not_covered_when_a_margin_is_needed(store):
    near_edge = [[76.0005, 10.25], [76.001, 10.251]]

    assert store.covers([near_edge], margin_m=0) is True
    # 2 km of emergency search radius would cross the border.
    assert store.covers([near_edge], margin_m=2000) is False


def test_route_outside_the_area_is_not_covered(store):
    delhi = [[77.2, 28.6], [77.21, 28.61]]

    assert store.covers([delhi], margin_m=0) is False


def test_one_route_outside_makes_the_trip_uncovered(store):
    assert store.covers([MAIN_STREET, [[77.2, 28.6], [77.21, 28.61]]], margin_m=0) is False


def test_poly_file_parsing():
    text = "name\n1\n\t76.0\t10.0\n\t76.5\t10.0\n\t76.5\t10.5\nEND\n!2\n\t76.2\t10.2\nEND\nEND\n"

    assert parse_poly(text) == [[76.0, 10.0], [76.5, 10.0], [76.5, 10.5]]

    with pytest.raises(ValueError):
        parse_poly("name\nEND\n")


def test_inside_margin_geometry():
    points = [[76.25, 10.25], [76.001, 10.25], [77.0, 10.25]]

    assert inside_margin(points, POLYGON, 0).tolist() == [True, True, False]
    assert inside_margin(points, POLYGON, 5000).tolist() == [True, False, False]
