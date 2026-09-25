"""
Real road-environment features for a route, taken from OpenStreetMap.

These describe the ENVIRONMENT of a route: what kind of roads it uses,
whether they have sidewalks, how many junctions and dead ends it
passes, how twisty it is. They are not safety or crime data, and
nothing here says a road is "unsafe" - only what the map says about it.
They feed the (experimental) ML component and are shown to the user as
plain facts; the rule-based score in safety.py stays the primary score.

Data flow:

    Overpass ("way[highway]" near every route, one query)
        -> parse_road_network()   segments, junctions, dead ends
        -> road_network_features() per-route numbers

The same two functions are used by ml/build_dataset.py, so a model
trained later sees features computed exactly like the live ones.

Every value that depends on OSM tagging is reported with how much of
the route was actually tagged, and is None (not zero) when there is
too little tagged data to say anything.
"""

import asyncio
import logging
import math
import re

import numpy as np

from emergency_service import _cached_fetch, _polyline_param
from geo import bearing_rad, distance_matrix_m, haversine_m, line_length_m, resample_line


logger = logging.getLogger("lumapath.roads")


# ==================================================
# SETTINGS
# ==================================================

# A road segment counts as "on the route" if its midpoint is within
# this distance of the route line.
MATCH_RADIUS_M = 25

# Ways are fetched a little wider than the match radius so that every
# way touching a matched junction is present (needed for junction and
# dead-end detection).
QUERY_RADIUS_M = 45

FEATURE_SPACING_M = 20
FEATURE_MAX_POINTS = 600

# Fewer matched segments than this and we do not describe the route.
MIN_MATCHED_SEGMENTS = 5

# Fewer tagged segments than this and a tag-based ratio is not trusted.
MIN_TAGGED_SEGMENTS = 4

# Give up on this optional query quickly so results are never held up.
ROAD_FETCH_TIMEOUT_S = 10

SHARP_TURN_DEG = 45
TURN_SPACING_M = 50

ROAD_CLASSES = ("major", "local", "pedestrian_cycle", "other")

_CLASS_OF = {}

for _highway in (
    "motorway", "motorway_link", "trunk", "trunk_link",
    "primary", "primary_link", "secondary", "secondary_link",
):
    _CLASS_OF[_highway] = 0

for _highway in (
    "tertiary", "tertiary_link", "residential", "unclassified",
    "living_street", "service",
):
    _CLASS_OF[_highway] = 1

for _highway in ("footway", "pedestrian", "path", "steps", "cycleway"):
    _CLASS_OF[_highway] = 2

# Streets where a sidewalk could reasonably exist.
_SIDEWALK_CLASSES = (0, 1)

# Street types where a dead end is meaningful (driveways and service
# lanes end in dead ends everywhere, so they are ignored).
_DEAD_END_HIGHWAYS = {
    "residential", "unclassified", "tertiary", "secondary", "primary",
    "living_street",
}

_SIDEWALK_YES = {"both", "left", "right", "yes", "separate"}
_SIDEWALK_NO = {"no", "none"}

_PAVED = {
    "paved", "asphalt", "concrete", "concrete:plates", "concrete:lanes",
    "paving_stones", "sett", "cobblestone", "metal", "wood", "bricks",
}
_UNPAVED = {
    "unpaved", "gravel", "fine_gravel", "compacted", "dirt", "earth",
    "ground", "grass", "mud", "sand", "pebblestone", "rock",
}

_SPEED_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(mph)?\s*$", re.IGNORECASE)


# ==================================================
# QUERY
# ==================================================

def build_road_query(route_geometries, server_timeout_s=18):
    """All roads and paths within QUERY_RADIUS_M of any route, with their nodes."""

    statements = "".join(
        'way["highway"]'
        '["highway"!~"^(proposed|construction|abandoned|razed|platform|'
        'raceway|bus_guideway|elevator|corridor)$"]'
        f"(around:{QUERY_RADIUS_M},{_polyline_param(coordinates)});"
        for coordinates in route_geometries
    )

    return f"[out:json][timeout:{server_timeout_s}];({statements});out body qt;>;out skel qt;"


def build_bbox_road_query(south, west, north, east, server_timeout_s=90):
    """Every road and path inside a bounding box (used to build training data)."""

    return (
        f"[out:json][timeout:{server_timeout_s}];"
        '(way["highway"]'
        '["highway"!~"^(proposed|construction|abandoned|razed|platform|'
        'raceway|bus_guideway|elevator|corridor)$"]'
        f"({south},{west},{north},{east}););out body qt;>;out skel qt;"
    )


# ==================================================
# PARSE OSM ELEMENTS
# ==================================================

def _parse_speed_kmh(value):

    if not value:
        return math.nan

    match = _SPEED_RE.match(value)

    if not match:
        return math.nan

    speed = float(match.group(1))

    return speed * 1.609344 if match.group(2) else speed


def _sidewalk_flag(tags):
    """1 = has a sidewalk, 0 = mapped as having none, -1 = not mapped."""

    values = {
        tags.get(key, "").lower()
        for key in ("sidewalk", "sidewalk:both", "sidewalk:left", "sidewalk:right")
        if key in tags
    }

    if values & _SIDEWALK_YES:
        return 1

    if values & _SIDEWALK_NO:
        return 0

    return -1


def _paved_flag(tags):

    surface = tags.get("surface", "").lower()

    if surface in _PAVED:
        return 1

    if surface in _UNPAVED:
        return 0

    return -1


class RoadNetwork:
    """Road segments plus junction and dead-end points, as numpy arrays."""

    def __init__(self, mid, length_m, road_class, sidewalk, speed, paved, junctions, dead_ends):
        self.mid = mid
        self.length_m = length_m
        self.road_class = road_class
        self.sidewalk = sidewalk
        self.speed = speed
        self.paved = paved
        self.junctions = junctions
        self.dead_ends = dead_ends

    def __len__(self):
        return len(self.length_m)


def parse_road_network(elements):
    """
    Turns Overpass elements (ways with node lists, then bare nodes)
    into a RoadNetwork, or None if there are no usable roads.

    An "arm" is one road leaving a node: a way's end contributes one,
    a node in the middle of a way contributes two. A node with three or
    more arms is a junction; one with a single arm on a real street is
    a dead end. (Counting arms rather than "shared nodes" avoids
    calling a way that was merely split at a tag change a junction.)
    """

    coordinates = {}
    ways = []

    for element in elements:

        if element.get("type") == "node" and "lat" in element:
            coordinates[element["id"]] = (element["lon"], element["lat"])

        elif element.get("type") == "way" and element.get("nodes"):
            ways.append(element)

    mids = []
    lengths = []
    classes = []
    sidewalks = []
    speeds = []
    paveds = []

    arms = {}
    street_end_nodes = set()

    for way in ways:

        tags = way.get("tags", {})
        highway = tags.get("highway")

        if highway is None:
            continue

        node_ids = way["nodes"]
        closed = len(node_ids) > 2 and node_ids[0] == node_ids[-1]

        for position, node_id in enumerate(node_ids):

            at_end = position in (0, len(node_ids) - 1) and not closed

            arms[node_id] = arms.get(node_id, 0) + (1 if at_end else 2)

            if at_end and highway in _DEAD_END_HIGHWAYS:
                street_end_nodes.add(node_id)

        road_class = _CLASS_OF.get(highway, 3)
        sidewalk = _sidewalk_flag(tags) if road_class in _SIDEWALK_CLASSES else -1
        speed = _parse_speed_kmh(tags.get("maxspeed"))
        paved = _paved_flag(tags)

        for a_id, b_id in zip(node_ids, node_ids[1:]):

            a = coordinates.get(a_id)
            b = coordinates.get(b_id)

            if a is None or b is None:
                continue

            length = haversine_m(a[1], a[0], b[1], b[0])

            if length <= 0:
                continue

            mids.append(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
            lengths.append(length)
            classes.append(road_class)
            sidewalks.append(sidewalk)
            speeds.append(speed)
            paveds.append(paved)

    if not lengths:
        return None

    junctions = [coordinates[n] for n, count in arms.items() if count >= 3 and n in coordinates]
    dead_ends = [
        coordinates[n]
        for n in street_end_nodes
        if arms[n] == 1 and n in coordinates
    ]

    return RoadNetwork(
        mid=np.array(mids, dtype=float),
        length_m=np.array(lengths, dtype=float),
        road_class=np.array(classes, dtype=np.int8),
        sidewalk=np.array(sidewalks, dtype=np.int8),
        speed=np.array(speeds, dtype=float),
        paved=np.array(paveds, dtype=np.int8),
        junctions=np.array(junctions, dtype=float).reshape(-1, 2),
        dead_ends=np.array(dead_ends, dtype=float).reshape(-1, 2),
    )


# ==================================================
# MEASURE ONE ROUTE
# ==================================================

def _near(points, samples, radius_m, chunk=2000):
    """Boolean mask: which [lon, lat] points lie within radius_m of any sample."""

    if len(points) == 0 or len(samples) == 0:
        return np.zeros(len(points), dtype=bool)

    samples = np.asarray(samples, dtype=float)

    # Cheap bounding-box prefilter (degrees) before the distance matrix.
    pad_lat = radius_m / 111_320 * 1.5
    pad_lon = pad_lat / max(0.2, math.cos(math.radians(samples[:, 1].mean())))

    inside = (
        (points[:, 0] >= samples[:, 0].min() - pad_lon)
        & (points[:, 0] <= samples[:, 0].max() + pad_lon)
        & (points[:, 1] >= samples[:, 1].min() - pad_lat)
        & (points[:, 1] <= samples[:, 1].max() + pad_lat)
    )

    mask = np.zeros(len(points), dtype=bool)
    candidates = np.flatnonzero(inside)

    for start in range(0, len(candidates), chunk):
        part = candidates[start:start + chunk]
        mask[part] = distance_matrix_m(points[part], samples).min(axis=1) <= radius_m

    return mask


def _share(weights, condition):

    total = weights.sum()

    return round(float(weights[condition].sum() / total), 3) if total else None


def _unavailable():

    return {"available": False}


def road_network_features(route_coordinates, network):
    """
    Per-route road features from a RoadNetwork, or {"available": False}
    when there is not enough matched map data.
    """

    if network is None:
        return _unavailable()

    samples = resample_line(
        route_coordinates,
        spacing_m=FEATURE_SPACING_M,
        max_points=FEATURE_MAX_POINTS,
    )

    if len(samples) < 2:
        return _unavailable()

    route_km = line_length_m(route_coordinates) / 1000
    spacing = route_km * 1000 / (len(samples) - 1)
    radius = max(MATCH_RADIUS_M, spacing * 0.75)

    matched = _near(network.mid, samples, radius)

    if matched.sum() < MIN_MATCHED_SEGMENTS or route_km <= 0:
        return _unavailable()

    length = network.length_m[matched]
    road_class = network.road_class[matched]
    sidewalk = network.sidewalk[matched]
    speed = network.speed[matched]
    paved = network.paved[matched]

    features = {
        "available": True,
        "matched_segments": int(matched.sum()),
    }

    for index, name in enumerate(ROAD_CLASSES):
        features[f"{name}_road_share"] = _share(length, road_class == index)

    # ---- sidewalks (only streets where one could exist) ----

    sidewalk_known = sidewalk >= 0
    features["sidewalk_tagged_segments"] = int(sidewalk_known.sum())
    features["sidewalk_share"] = (
        _share(length[sidewalk_known], sidewalk[sidewalk_known] == 1)
        if sidewalk_known.sum() >= MIN_TAGGED_SEGMENTS
        else None
    )

    # ---- speed limits ----

    speed_known = ~np.isnan(speed)
    features["maxspeed_tagged_segments"] = int(speed_known.sum())
    features["maxspeed_mean_kmh"] = (
        round(float(np.average(speed[speed_known], weights=length[speed_known])), 1)
        if speed_known.sum() >= MIN_TAGGED_SEGMENTS
        else None
    )

    # ---- surface ----

    paved_known = paved >= 0
    features["surface_tagged_segments"] = int(paved_known.sum())
    features["paved_share"] = (
        _share(length[paved_known], paved[paved_known] == 1)
        if paved_known.sum() >= MIN_TAGGED_SEGMENTS
        else None
    )

    # ---- junctions and dead ends ----

    junctions = int(_near(network.junctions, samples, radius).sum())
    dead_ends = int(_near(network.dead_ends, samples, radius).sum())

    features["junctions"] = junctions
    features["junctions_per_km"] = round(junctions / route_km, 2)
    features["dead_ends"] = dead_ends
    features["dead_ends_per_km"] = round(dead_ends / route_km, 2)

    return features


# ==================================================
# ROUTE SHAPE (from the routing geometry, no map lookup needed)
# ==================================================

def route_shape_features(route_coordinates):
    """How direct and how twisty the route is."""

    route_m = line_length_m(route_coordinates)

    if route_m <= 0 or len(route_coordinates) < 2:
        return {"route_km": 0.0, "directness": None, "sharp_turns": 0, "turns_per_km": None}

    start, end = route_coordinates[0], route_coordinates[-1]
    straight_m = haversine_m(start[1], start[0], end[1], end[0])

    samples = resample_line(route_coordinates, spacing_m=TURN_SPACING_M, max_points=800)

    bearings = [
        math.degrees(bearing_rad(a[1], a[0], b[1], b[0]))
        for a, b in zip(samples, samples[1:])
    ]

    turns = 0
    previous_was_turn = False

    for a, b in zip(bearings, bearings[1:]):

        change = abs((b - a + 180) % 360 - 180)
        is_turn = change >= SHARP_TURN_DEG

        # One physical turn can span two samples; count it once.
        if is_turn and not previous_was_turn:
            turns += 1

        previous_was_turn = is_turn

    route_km = route_m / 1000

    return {
        "route_km": round(route_km, 2),
        "directness": round(min(1.0, straight_m / route_m), 3),
        "sharp_turns": turns,
        "turns_per_km": round(turns / route_km, 2),
    }


# ==================================================
# FETCH
# ==================================================

async def get_road_network(route_geometries):
    """
    RoadNetwork for all routes, or None if Overpass could not answer
    in time. Never raises: this data only enriches the response.
    """

    try:
        elements = await asyncio.wait_for(
            _cached_fetch(build_road_query(route_geometries)),
            timeout=ROAD_FETCH_TIMEOUT_S,
        )
    except Exception as error:
        logger.warning("Road-network fetch failed: %s", error)
        return None

    if not elements:
        return None

    network = parse_road_network(elements)

    if network is not None:
        logger.info(
            "Road network: %d segments, %d junctions, %d dead ends",
            len(network), len(network.junctions), len(network.dead_ends),
        )

    return network
