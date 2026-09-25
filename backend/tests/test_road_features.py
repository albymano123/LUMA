"""
Road-environment features, using a small hand-built OSM fragment.

Run from backend/:  venv/Scripts/python -m pytest -q
"""

import math

import road_features as rf


LAT = 9.93
LON0 = 76.26
STEP = 0.0009  # about 100 m of longitude at this latitude


def node(node_id, lon, lat):
    return {"type": "node", "id": node_id, "lon": lon, "lat": lat}


def build_elements():
    """
    Main street west -> east (11 nodes, ~1 km): residential, sidewalks,
    30 km/h, asphalt. A side street leaves it at node 6 (a junction) and
    a 15 m stub leaves node 3 (a dead end close to the route).
    """

    nodes = [node(i, LON0 + i * STEP, LAT) for i in range(1, 12)]

    nodes += [
        node(20, LON0 + 6 * STEP, LAT + 0.002),   # side street end, ~220 m away
        node(30, LON0 + 3 * STEP, LAT - 0.00014),  # stub end, ~15 m away
        # a footpath running with the street
        node(40, LON0 + 1 * STEP, LAT + 0.0001),
        node(41, LON0 + 5 * STEP, LAT + 0.0001),
    ]

    ways = [
        {"type": "way", "id": 100, "nodes": list(range(1, 12)), "tags": {
            "highway": "residential", "sidewalk": "both",
            "maxspeed": "30", "surface": "asphalt"}},
        {"type": "way", "id": 101, "nodes": [6, 20], "tags": {"highway": "residential"}},
        {"type": "way", "id": 102, "nodes": [3, 30], "tags": {"highway": "residential"}},
        {"type": "way", "id": 103, "nodes": [40, 41], "tags": {"highway": "footway"}},
    ]

    return ways + nodes


ROUTE = [[LON0 + i * STEP, LAT] for i in range(1, 12)]


def features():
    network = rf.parse_road_network(build_elements())
    return network, rf.road_network_features(ROUTE, network)


def test_parses_segments_junctions_and_dead_ends():
    network, _ = features()

    assert len(network) > 0
    # Nodes 3 (stub) and 6 (side street) each join a third road.
    assert len(network.junctions) == 2
    # Dead ends: both ends of the main street, the side street's far
    # end and the stub's end.
    assert len(network.dead_ends) == 4


def test_junction_and_dead_end_counts_are_limited_to_the_route():
    _, result = features()

    assert result["available"]
    assert result["junctions"] == 2
    # The main street's two ends and the stub's end are on or within
    # 25 m of the route; the side street's far end (~220 m) is not.
    assert result["dead_ends"] == 3
    assert result["junctions_per_km"] > 0


def test_road_class_shares_add_up_to_one():
    _, result = features()

    total = sum(
        result[f"{name}_road_share"] for name in rf.ROAD_CLASSES
    )

    assert math.isclose(total, 1.0, abs_tol=0.01)
    assert result["local_road_share"] > 0.6
    assert result["pedestrian_cycle_road_share"] > 0


def test_sidewalk_speed_and_surface_from_tags():
    _, result = features()

    assert result["sidewalk_share"] == 1.0
    assert result["maxspeed_mean_kmh"] == 30.0
    assert result["paved_share"] == 1.0


def test_untagged_values_are_none_not_zero():
    elements = build_elements()

    for element in elements:
        if element["type"] == "way":
            element["tags"] = {"highway": element["tags"]["highway"]}

    network = rf.parse_road_network(elements)
    result = rf.road_network_features(ROUTE, network)

    assert result["sidewalk_share"] is None
    assert result["maxspeed_mean_kmh"] is None
    assert result["paved_share"] is None


def test_no_matching_roads_means_unavailable_not_zeroes():
    network = rf.parse_road_network(build_elements())
    far_route = [[LON0 + 1, LAT + 1], [LON0 + 1.01, LAT + 1]]

    assert rf.road_network_features(far_route, network) == {"available": False}
    assert rf.road_network_features(ROUTE, None) == {"available": False}


def test_split_way_is_not_a_junction():
    elements = build_elements()

    # Split the main street in two at node 6: still one road, no new junction.
    main = next(e for e in elements if e.get("id") == 100)
    elements.remove(main)
    elements += [
        {"type": "way", "id": 110, "nodes": list(range(1, 7)), "tags": main["tags"]},
        {"type": "way", "id": 111, "nodes": list(range(6, 12)), "tags": main["tags"]},
    ]

    network = rf.parse_road_network(elements)

    # Node 6 now joins the two halves and the side street (1 + 1 + 1
    # arms) and node 3 still has its stub: exactly the same two junctions.
    assert len(network.junctions) == 2


def test_speed_parsing():
    assert rf._parse_speed_kmh("50") == 50
    assert round(rf._parse_speed_kmh("30 mph")) == 48
    assert math.isnan(rf._parse_speed_kmh("walk"))
    assert math.isnan(rf._parse_speed_kmh(None))


def test_route_shape_straight_vs_twisty():
    straight = rf.route_shape_features(ROUTE)

    assert straight["directness"] > 0.99
    assert straight["sharp_turns"] == 0

    # A zig-zag of 90 degree turns every ~110 m.
    zigzag = [[LON0, LAT]]

    for i in range(1, 9):
        last = zigzag[-1]
        zigzag.append(
            [last[0] + STEP, last[1]] if i % 2 else [last[0], last[1] + STEP]
        )

    twisty = rf.route_shape_features(zigzag)

    assert twisty["sharp_turns"] >= 5
    assert twisty["directness"] < straight["directness"]
    assert twisty["turns_per_km"] > straight["turns_per_km"]


def test_query_targets_roads_near_each_route():
    query = rf.build_road_query([ROUTE, ROUTE])

    assert query.count('way["highway"]') == 2
    assert "out body qt;>;out skel qt;" in query
