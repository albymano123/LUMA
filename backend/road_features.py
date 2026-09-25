"""
Real road-environment features for a route, from OpenStreetMap data.

These describe the ENVIRONMENT of a route: what kind of roads it uses,
whether they have sidewalks or lighting, how many junctions and dead
ends it passes, how twisty it is. They are not safety or crime data.
The safety engine (safety.py) and the experimental ML component both
consume them.

This module is pure computation (no network, no database), so the
same code measures a live route, a route from the local geo-database,
and a training window for ML.

    ways (from the local database or Overpass)
        -> build_network()          numpy segments, junctions, dead ends
        -> road_network_features()  per-route numbers

Every value that depends on OSM tagging is reported with how much of
the route was actually tagged, and is None (not zero) when there is
too little tagged data to say anything.
"""

import math

import numpy as np

from geo import (
    EARTH_RADIUS_M,
    bearing_rad,
    distance_matrix_m,
    haversine_m,
    line_length_m,
    resample_line,
)
from road_tags import DEAD_END_HIGHWAYS, ROAD_CLASSES, SIDEWALK_CLASSES


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

SHARP_TURN_DEG = 45
TURN_SPACING_M = 50

_COORD_SCALE = 10_000_000
_KEY_MULTIPLIER = 4_294_967_296


# ==================================================
# ROAD NETWORK
# ==================================================

class RoadNetwork:
    """Road segments plus junction and dead-end points, as numpy arrays."""

    def __init__(
        self, mid, length_m, road_class, sidewalk, speed, paved, lit,
        junctions, dead_ends,
    ):
        self.mid = mid
        self.length_m = length_m
        self.road_class = road_class
        self.sidewalk = sidewalk
        self.speed = speed
        self.paved = paved
        self.lit = lit
        self.junctions = junctions
        self.dead_ends = dead_ends

    def __len__(self):
        return len(self.length_m)


def _haversine_np(a, b):
    """Vectorised great-circle distance in metres between [lon, lat] rows."""

    lon1, lat1, lon2, lat2 = map(np.radians, (a[:, 0], a[:, 1], b[:, 0], b[:, 1]))

    h = (
        np.sin((lat2 - lat1) / 2) ** 2
        + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    )

    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(h))


def build_network(ways):
    """
    ways: list of dicts with "coords" (n x 2 array of lon, lat) and the
    attributes from road_tags.way_attributes(). Returns a RoadNetwork,
    or None if there are no usable segments.

    Junctions and dead ends are found by counting "arms": a way's end
    is one arm, a point in the middle of a way is two. A point with
    three or more arms is a junction; one with a single arm on a real
    street is a dead end. (Counting arms rather than "shared points"
    avoids calling a way that was merely split at a tag change a
    junction.) Points are identified by their exact coordinates.
    """

    ways = [w for w in ways if len(w["coords"]) >= 2]

    if not ways:
        return None

    counts = np.array([len(w["coords"]) for w in ways])
    coords = np.concatenate([np.asarray(w["coords"], dtype=float) for w in ways])
    starts = np.cumsum(counts) - counts
    ends = starts + counts - 1

    # ---------- segments ----------

    is_last = np.zeros(len(coords), dtype=bool)
    is_last[ends] = True
    first_of_pair = np.flatnonzero(~is_last)

    a = coords[first_of_pair]
    b = coords[first_of_pair + 1]
    length = _haversine_np(a, b)

    def per_segment(name, dtype):
        values = np.array([w[name] for w in ways], dtype=dtype)
        return np.repeat(values, counts - 1)

    keep = length > 0

    # ---------- arms (junctions and dead ends) ----------

    ints = np.rint(coords * _COORD_SCALE).astype(np.int64)
    keys = ints[:, 0] * _KEY_MULTIPLIER + ints[:, 1]

    closed = (keys[starts] == keys[ends]) & (counts > 2)
    arm_inc = np.full(len(coords), 2.0)
    open_ways = ~closed
    arm_inc[starts[open_ways]] = 1.0
    arm_inc[ends[open_ways]] = 1.0

    street_end = np.zeros(len(coords), dtype=bool)
    eligible = np.array(
        [w["highway"] in DEAD_END_HIGHWAYS for w in ways], dtype=bool
    ) & open_ways
    street_end[starts[eligible]] = True
    street_end[ends[eligible]] = True

    unique_keys, first_index, inverse = np.unique(
        keys, return_index=True, return_inverse=True
    )
    arms = np.bincount(inverse, weights=arm_inc)
    ends_street = np.bincount(inverse, weights=street_end.astype(float)) > 0

    junction_points = coords[first_index[arms >= 3]]
    dead_end_points = coords[first_index[(arms == 1) & ends_street]]

    if not keep.any():
        return None

    return RoadNetwork(
        mid=((a + b) / 2)[keep],
        length_m=length[keep],
        road_class=per_segment("road_class", np.int8)[keep],
        sidewalk=per_segment("sidewalk", np.int8)[keep],
        speed=per_segment("speed", float)[keep],
        paved=per_segment("paved", np.int8)[keep],
        lit=per_segment("lit", np.int8)[keep],
        junctions=junction_points.reshape(-1, 2),
        dead_ends=dead_end_points.reshape(-1, 2),
    )


# ==================================================
# MEASURE ONE ROUTE
# ==================================================

def _project(points, origin_lat, origin_lon):
    """[lon, lat] rows -> local metres (east, north) around an origin."""

    points = np.asarray(points, dtype=float)

    return (
        np.radians(points[:, 0] - origin_lon) * math.cos(math.radians(origin_lat)) * EARTH_RADIUS_M,
        np.radians(points[:, 1] - origin_lat) * EARTH_RADIUS_M,
    )


def _near(points, samples, radius_m, chunk=2000):
    """
    Boolean mask: which [lon, lat] points lie within radius_m of any sample.

    A grid with cells of radius_m finds the few points that could be near
    the route (those in a cell next to a sample's cell); only those get an
    exact distance check. On a long route this avoids comparing thousands
    of far-away segments against every sample.
    """

    if len(points) == 0 or len(samples) == 0:
        return np.zeros(len(points), dtype=bool)

    samples = np.asarray(samples, dtype=float)
    origin_lat = float(samples[:, 1].mean())
    origin_lon = float(samples[:, 0].mean())

    sx, sy = _project(samples, origin_lat, origin_lon)
    px, py = _project(points, origin_lat, origin_lon)

    cell = max(radius_m, 1.0)

    def key(cx, cy):
        # Offsets keep the cell indices positive; 2**24 cells is far more
        # than any trip needs (16,000 km at 1 m cells).
        return (cx + (1 << 23)) * (1 << 24) + (cy + (1 << 23))

    sample_cx = np.floor(sx / cell).astype(np.int64)
    sample_cy = np.floor(sy / cell).astype(np.int64)

    occupied = np.unique(np.concatenate([
        key(sample_cx + dx, sample_cy + dy)
        for dx in (-1, 0, 1)
        for dy in (-1, 0, 1)
    ]))

    point_keys = key(np.floor(px / cell).astype(np.int64), np.floor(py / cell).astype(np.int64))

    mask = np.zeros(len(points), dtype=bool)
    candidates = np.flatnonzero(np.isin(point_keys, occupied))
    points = np.asarray(points, dtype=float)

    for start in range(0, len(candidates), chunk):
        part = candidates[start:start + chunk]
        mask[part] = distance_matrix_m(points[part], samples).min(axis=1) <= radius_m

    return mask


def _share(weights, condition):

    total = weights.sum()

    return round(float(weights[condition].sum() / total), 3) if total else None


def _tagged_share(length, flag, tagged_mask, min_tagged=MIN_TAGGED_SEGMENTS):
    """Length-weighted share of segments flagged 1 among those tagged, or None."""

    if tagged_mask.sum() < min_tagged:
        return None

    return _share(length[tagged_mask], flag[tagged_mask] == 1)


def _coverage(length, tagged_mask, applicable_mask=None):
    """
    Share of the route's length (among segments where the tag applies)
    that actually carries the tag. Tag-based ratios are only trusted
    when this is high: 5 lit streets out of 200 tells us nothing.
    """

    applicable = np.ones(len(length), dtype=bool) if applicable_mask is None else applicable_mask

    return _share(length[applicable], tagged_mask[applicable])


def unavailable():

    return {"available": False}


def road_network_features(route_coordinates, network):
    """
    Per-route road features from a RoadNetwork, or {"available": False}
    when there is not enough matched map data.
    """

    if network is None:
        return unavailable()

    samples = resample_line(
        route_coordinates,
        spacing_m=FEATURE_SPACING_M,
        max_points=FEATURE_MAX_POINTS,
    )

    if len(samples) < 2:
        return unavailable()

    route_km = line_length_m(route_coordinates) / 1000
    spacing = route_km * 1000 / (len(samples) - 1)
    radius = max(MATCH_RADIUS_M, spacing * 0.75)

    matched = _near(network.mid, samples, radius)

    if matched.sum() < MIN_MATCHED_SEGMENTS or route_km <= 0:
        return unavailable()

    length = network.length_m[matched]
    road_class = network.road_class[matched]
    sidewalk = network.sidewalk[matched]
    speed = network.speed[matched]
    paved = network.paved[matched]
    lit = network.lit[matched]

    features = {
        "available": True,
        "matched_segments": int(matched.sum()),
    }

    for index, name in enumerate(ROAD_CLASSES):
        features[f"{name}_road_share"] = _share(length, road_class == index)

    # ---- sidewalks (only streets where one could exist) ----

    sidewalk_known = sidewalk >= 0
    sidewalk_applicable = np.isin(road_class, SIDEWALK_CLASSES)
    features["sidewalk_tagged_segments"] = int(sidewalk_known.sum())
    features["sidewalk_coverage"] = _coverage(length, sidewalk_known, sidewalk_applicable)
    features["sidewalk_share"] = _tagged_share(length, sidewalk, sidewalk_known)

    # ---- street lighting ----

    lit_known = lit >= 0
    features["lit_tagged_segments"] = int(lit_known.sum())
    features["lit_coverage"] = _coverage(length, lit_known)
    features["lit_share"] = _tagged_share(length, lit, lit_known)

    # ---- speed limits ----

    speed_known = ~np.isnan(speed)
    features["maxspeed_tagged_segments"] = int(speed_known.sum())
    features["maxspeed_coverage"] = _coverage(length, speed_known)
    features["maxspeed_mean_kmh"] = (
        round(float(np.average(speed[speed_known], weights=length[speed_known])), 1)
        if speed_known.sum() >= MIN_TAGGED_SEGMENTS
        else None
    )

    # ---- surface ----

    paved_known = paved >= 0
    features["surface_tagged_segments"] = int(paved_known.sum())
    features["surface_coverage"] = _coverage(length, paved_known)
    features["paved_share"] = _tagged_share(length, paved, paved_known)

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
