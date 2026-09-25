"""
Which area the local database covers.

The extract is clipped to a polygon (Kerala). A route only counts as
covered if every sample point is inside the polygon AND at least
`margin_m` away from its edge: near the border, hospitals and police
stations just across it are missing from the data, and pretending
otherwise would understate emergency access.
"""

import math

import numpy as np

from geo import EARTH_RADIUS_M


def parse_poly(text):
    """Outer ring of an osmosis .poly file as a list of [lon, lat]."""

    ring = None

    for raw in text.splitlines()[1:]:
        line = raw.strip()

        if not line:
            continue

        if line == "END":
            if ring is not None:
                return ring
            continue

        if ring is None and not line.startswith("!") and " " not in line and "\t" not in raw:
            ring = []
            continue

        if ring is not None:
            lon, lat = line.split()[:2]
            ring.append([float(lon), float(lat)])

    raise ValueError("no polygon found in poly file")


def _project(points, origin_lat, origin_lon):
    """[lon, lat] -> local metres (x east, y north)."""

    points = np.asarray(points, dtype=float)
    x = np.radians(points[:, 0] - origin_lon) * math.cos(math.radians(origin_lat)) * EARTH_RADIUS_M
    y = np.radians(points[:, 1] - origin_lat) * EARTH_RADIUS_M

    return np.column_stack([x, y])


def inside_margin(points, polygon, margin_m):
    """Boolean per point: inside the polygon and >= margin_m from its edge."""

    points = np.asarray(points, dtype=float)
    polygon = np.asarray(polygon, dtype=float)

    origin_lat = float(polygon[:, 1].mean())
    origin_lon = float(polygon[:, 0].mean())

    p = _project(points, origin_lat, origin_lon)
    poly = _project(polygon, origin_lat, origin_lon)

    # Ray casting: is the point inside?
    x, y = p[:, 0][:, None], p[:, 1][:, None]
    x1, y1 = poly[:, 0][None, :], poly[:, 1][None, :]
    x2, y2 = np.roll(poly[:, 0], -1)[None, :], np.roll(poly[:, 1], -1)[None, :]

    crosses = (y1 > y) != (y2 > y)
    with np.errstate(divide="ignore", invalid="ignore"):
        x_at_y = (x2 - x1) * (y - y1) / (y2 - y1) + x1

    inside = (crosses & (x < x_at_y)).sum(axis=1) % 2 == 1

    # Distance to the nearest polygon edge.
    dx, dy = x2 - x1, y2 - y1
    length_sq = dx * dx + dy * dy
    with np.errstate(divide="ignore", invalid="ignore"):
        t = np.clip(((x - x1) * dx + (y - y1) * dy) / np.where(length_sq == 0, 1, length_sq), 0, 1)

    nearest_x = x1 + t * dx
    nearest_y = y1 + t * dy
    edge_distance = np.sqrt((x - nearest_x) ** 2 + (y - nearest_y) ** 2).min(axis=1)

    return inside & (edge_distance >= margin_m)
