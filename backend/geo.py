"""
Small geometry helpers shared by the routing and analysis code.

Coordinates coming from OSRM are GeoJSON order: [longitude, latitude].
"""

import math

import numpy as np


EARTH_RADIUS_M = 6_371_000


def haversine_m(lat1, lon1, lat2, lon2):
    """Great-circle distance in metres between two points."""

    lat1, lon1, lat2, lon2 = map(
        math.radians,
        (lat1, lon1, lat2, lon2)
    )

    a = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2)
        * math.sin((lon2 - lon1) / 2) ** 2
    )

    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def resample_line(coordinates, spacing_m, max_points):
    """
    Return points spaced roughly `spacing_m` apart along a
    [lon, lat] polyline, always including the first and last point.

    Sampling by distance (instead of by vertex index) keeps every
    part of the route equally represented, whatever the density of
    the OSRM geometry.
    """

    if not coordinates:
        return []

    if len(coordinates) == 1:
        return [coordinates[0]]

    total = line_length_m(coordinates)

    if total == 0:
        return [coordinates[0]]

    # Widen the spacing on long routes so we stay under max_points.
    spacing_m = max(
        spacing_m,
        total / max(1, max_points - 1)
    )

    samples = [coordinates[0]]
    next_mark = spacing_m
    travelled = 0.0

    for start, end in zip(coordinates, coordinates[1:]):

        segment = haversine_m(start[1], start[0], end[1], end[0])

        while segment > 0 and travelled + segment >= next_mark:
            ratio = (next_mark - travelled) / segment
            samples.append([
                start[0] + (end[0] - start[0]) * ratio,
                start[1] + (end[1] - start[1]) * ratio,
            ])
            next_mark += spacing_m

        travelled += segment

    if samples[-1] != coordinates[-1]:
        samples.append(coordinates[-1])

    return samples


def line_length_m(coordinates):

    return sum(
        haversine_m(a[1], a[0], b[1], b[0])
        for a, b in zip(coordinates, coordinates[1:])
    )


def distance_matrix_m(points_a, points_b):
    """
    Approximate distances (metres) between every [lon, lat] in
    points_a and every [lon, lat] in points_b.

    Uses an equirectangular projection, which is accurate to well
    under 1% at the few-kilometre scale we care about, and is fast
    enough to vectorise with numpy.
    """

    a = np.radians(np.asarray(points_a, dtype=float))
    b = np.radians(np.asarray(points_b, dtype=float))

    if a.size == 0 or b.size == 0:
        return np.zeros((len(points_a), len(points_b)))

    mean_lat = (a[:, 1].mean() + b[:, 1].mean()) / 2

    dx = (
        (a[:, None, 0] - b[None, :, 0])
        * math.cos(mean_lat)
    )
    dy = a[:, None, 1] - b[None, :, 1]

    return EARTH_RADIUS_M * np.sqrt(dx ** 2 + dy ** 2)


def route_overlap(samples_a, samples_b, tolerance_m=60):
    """
    Share of route A's sample points lying within `tolerance_m`
    of route B. Used to drop near-duplicate alternatives.
    """

    if not samples_a or not samples_b:
        return 0.0

    distances = distance_matrix_m(samples_a, samples_b)

    return float(
        (distances.min(axis=1) <= tolerance_m).mean()
    )


def offset_point(lat, lon, bearing_rad, distance_m):
    """Point `distance_m` away from (lat, lon) along a bearing."""

    d_lat = distance_m * math.cos(bearing_rad) / EARTH_RADIUS_M
    d_lon = (
        distance_m * math.sin(bearing_rad)
        / (EARTH_RADIUS_M * math.cos(math.radians(lat)))
    )

    return (
        lat + math.degrees(d_lat),
        lon + math.degrees(d_lon),
    )


def bearing_rad(lat1, lon1, lat2, lon2):

    lat1, lon1, lat2, lon2 = map(
        math.radians,
        (lat1, lon1, lat2, lon2)
    )

    y = math.sin(lon2 - lon1) * math.cos(lat2)
    x = (
        math.cos(lat1) * math.sin(lat2)
        - math.sin(lat1) * math.cos(lat2) * math.cos(lon2 - lon1)
    )

    return math.atan2(y, x)
