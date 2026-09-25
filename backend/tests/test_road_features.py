"""
Road-environment features, using a small hand-built road network.

Run from backend/:  venv/Scripts/python -m pytest -q
"""

import math

import numpy as np

import road_features as rf
from road_tags import way_attributes


LAT = 9.93
LON0 = 76.26
STEP = 0.0009  # about 100 m of longitude at this latitude


def point(i, dlat=0.0):
    return [LON0 + i * STEP, LAT + dlat]


def way(coords, tags):
    return {**way_attributes(tags), "coords": np.array(coords, dtype=float)}


def build_ways(main_tags=None):
    """
    Main street west -> east (11 points, ~1 km): residential, sidewalks,
    30 km/h, asphalt, lit. A side street leaves it at point 6 (a
    junction) and a 15 m stub leaves point 3 (a dead end close to the
    route).
    """

    main_tags = main_tags or {
        "highway": "residential", "sidewalk": "both",
        "maxspeed": "30", "surface": "asphalt", "lit": "yes",
    }

    return [
        way([point(i) for i in range(1, 12)], main_tags),
        way([point(6), point(6, 0.002)], {"highway": "residential"}),
        way([point(3), point(3, -0.00014)], {"highway": "residential"}),
        # a footpath running with the street
        way([point(1, 0.0001), point(5, 0.0001)], {"highway": "footway"}),
    ]


ROUTE = [point(i) for i in range(1, 12)]


def features(ways=None):
    network = rf.build_network(ways or build_ways())
    return network, rf.road_network_features(ROUTE, network)


def test_parses_segments_junctions_and_dead_ends():
    network, _ = features()

    assert len(network) > 0
    # Points 3 (stub) and 6 (side street) each join a third road.
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

    total = sum(result[f"{name}_road_share"] for name in rf.ROAD_CLASSES)

    assert math.isclose(total, 1.0, abs_tol=0.01)
    assert result["local_road_share"] > 0.6
    assert result["pedestrian_cycle_road_share"] > 0


def test_sidewalk_speed_surface_and_lighting_from_tags():
    _, result = features()

    assert result["sidewalk_share"] == 1.0
    assert result["maxspeed_mean_kmh"] == 30.0
    assert result["paved_share"] == 1.0
    assert result["lit_share"] == 1.0


def test_tag_coverage_is_reported():
    _, result = features()

    # The side street, stub and footpath carry no lighting tag, so
    # coverage is well below 100% even though every tagged street is lit.
    assert 0.5 < result["lit_coverage"] < 1.0
    assert 0.5 < result["sidewalk_coverage"] <= 1.0


def test_untagged_values_are_none_not_zero():
    _, result = features(build_ways({"highway": "residential"}))

    assert result["sidewalk_share"] is None
    assert result["maxspeed_mean_kmh"] is None
    assert result["paved_share"] is None
    assert result["lit_share"] is None
    assert result["lit_coverage"] == 0.0


def test_no_matching_roads_means_unavailable_not_zeroes():
    network = rf.build_network(build_ways())
    far_route = [[LON0 + 1, LAT + 1], [LON0 + 1.01, LAT + 1]]

    assert rf.road_network_features(far_route, network) == {"available": False}
    assert rf.road_network_features(ROUTE, None) == {"available": False}
    assert rf.build_network([]) is None


def test_split_way_is_not_a_junction():
    main = build_ways()[0]
    ways = build_ways()[1:]

    # Split the main street in two at point 6: still one road.
    ways.append({**main, "coords": main["coords"][:6]})
    ways.append({**main, "coords": main["coords"][5:]})

    network = rf.build_network(ways)

    # Point 6 now joins the two halves and the side street (1 + 1 + 1
    # arms) and point 3 still has its stub: the same two junctions.
    assert len(network.junctions) == 2


def test_closed_loop_is_not_a_dead_end():
    ring = [point(1), point(2), point(2, 0.001), point(1, 0.001), point(1)]
    network = rf.build_network([way(ring, {"highway": "residential"})])

    assert len(network.dead_ends) == 0


def test_speed_parsing():
    from road_tags import speed_kmh

    assert speed_kmh({"maxspeed": "50"}) == 50
    assert round(speed_kmh({"maxspeed": "30 mph"})) == 48
    assert math.isnan(speed_kmh({"maxspeed": "walk"}))
    assert math.isnan(speed_kmh({}))


def test_ignored_highways_are_dropped():
    assert way_attributes({"highway": "construction"}) is None
    assert way_attributes({"building": "yes"}) is None


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
