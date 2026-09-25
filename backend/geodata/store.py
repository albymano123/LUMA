"""
Read-only queries against the local geo-database.

All spatial lookups go through the R-Tree indexes (bounding boxes);
exact distances are computed afterwards with numpy by the callers.
Each thread gets its own SQLite connection.
"""

import json
import logging
import math
import os
import sqlite3
import threading

import numpy as np

from geo import resample_line
from geodata.codec import cell_key, decode_nodes
from geodata.coverage import inside_margin
from geodata.schema import (
    ACTIVITY_KIND,
    CELL_DEG,
    CELL_ROW_SHIFT,
    EMERGENCY_KINDS,
    SCHEMA_VERSION,
)


logger = logging.getLogger("lumapath.geostore")

# Spacing of the boxes we query along a route.
CHUNK_M = 400


def _degrees(metres, latitude):
    """(d_lat, d_lon) in degrees for a distance in metres at a latitude."""

    d_lat = metres / 111_320
    d_lon = d_lat / max(0.2, math.cos(math.radians(latitude)))

    return d_lat, d_lon


class GeoStore:

    def __init__(self, path):

        self.path = path
        self._local = threading.local()

        with self._connection() as connection:
            self.meta = dict(connection.execute("SELECT key, value FROM meta"))

        if int(self.meta.get("schema_version", 0)) != SCHEMA_VERSION:
            raise ValueError(
                f"geo-database schema {self.meta.get('schema_version')} "
                f"does not match code schema {SCHEMA_VERSION}; rebuild it"
            )

        self.polygon = np.array(json.loads(self.meta["coverage_polygon"]))

    # ------------------------------------------------
    # connection
    # ------------------------------------------------

    def _connection(self):

        connection = getattr(self._local, "connection", None)

        if connection is None:
            uri = f"file:{self.path.replace(os.sep, '/')}?mode=ro"
            connection = sqlite3.connect(uri, uri=True, check_same_thread=False)
            self._local.connection = connection

        return connection

    # ------------------------------------------------
    # description
    # ------------------------------------------------

    def describe(self):
        """Small, public description of the dataset for the API."""

        return {
            "source": self.meta.get("source"),
            "extract_date": (self.meta.get("extract_timestamp") or "")[:10] or None,
            "attribution": self.meta.get("attribution"),
        }

    def stats(self):

        return {
            "ways": int(self.meta.get("way_count", 0)),
            "places": json.loads(self.meta.get("poi_counts", "{}")),
        }

    # ------------------------------------------------
    # coverage
    # ------------------------------------------------

    def covers(self, route_geometries, margin_m):
        """True if every route lies inside the covered area, at least margin_m from its edge."""

        points = []

        for coordinates in route_geometries:
            points.extend(resample_line(coordinates, spacing_m=500, max_points=80))

        if not points:
            return False

        return bool(inside_margin(points, self.polygon, margin_m).all())

    # ------------------------------------------------
    # queries
    # ------------------------------------------------

    def _boxes_along(self, coordinates, buffer_m):
        """Bounding boxes (min_lon, max_lon, min_lat, max_lat) covering a route."""

        samples = resample_line(coordinates, spacing_m=CHUNK_M, max_points=400)

        if len(samples) == 1:
            samples = samples * 2

        boxes = []

        for a, b in zip(samples, samples[1:]):
            d_lat, d_lon = _degrees(buffer_m, (a[1] + b[1]) / 2)
            boxes.append((
                min(a[0], b[0]) - d_lon, max(a[0], b[0]) + d_lon,
                min(a[1], b[1]) - d_lat, max(a[1], b[1]) + d_lat,
            ))

        return boxes

    def emergency_services(self, route_geometries, radius_m):
        """
        Hospitals, clinics, police and fire stations within radius_m of
        the routes' overall bounding box (sparse, so one query is cheap;
        callers keep only those actually near each route).
        """

        lons = [lon for line in route_geometries for lon, _ in line]
        lats = [lat for line in route_geometries for _, lat in line]

        d_lat, d_lon = _degrees(radius_m, sum(lats) / len(lats))

        rows = self._connection().execute(
            """
            SELECT p.osm_ref, p.kind, p.name, p.phone, p.emergency_ward, p.lon, p.lat
            FROM pois_idx i JOIN pois p ON p.id = i.id
            WHERE i.max_lon >= ? AND i.min_lon <= ?
              AND i.max_lat >= ? AND i.min_lat <= ?
              AND p.kind IN ({})
            """.format(",".join("?" * len(EMERGENCY_KINDS))),
            (
                min(lons) - d_lon, max(lons) + d_lon,
                min(lats) - d_lat, max(lats) + d_lat,
                *EMERGENCY_KINDS,
            ),
        ).fetchall()

        return [
            {
                "id": reference,
                "kind": kind,
                "name": name,
                "phone": phone,
                "emergency_ward": bool(ward),
                "lon": lon,
                "lat": lat,
            }
            for reference, kind, name, phone, ward, lon, lat in rows
        ]

    def activity_places(self, route_geometries, radius_m):
        """[lon, lat] of shops, food places, bus stops etc. near the routes."""

        seen = {}

        for coordinates in route_geometries:
            for box in self._boxes_along(coordinates, radius_m):
                for poi_id, lon, lat in self._connection().execute(
                    """
                    SELECT p.id, p.lon, p.lat
                    FROM pois_idx i JOIN pois p ON p.id = i.id
                    WHERE i.max_lon >= ? AND i.min_lon <= ?
                      AND i.max_lat >= ? AND i.min_lat <= ?
                      AND p.kind = ?
                    """,
                    (box[0], box[1], box[2], box[3], ACTIVITY_KIND),
                ):
                    seen[poi_id] = (lon, lat)

        return list(seen.values())

    _WAY_COLUMNS = "w.id, w.highway, w.road_class, w.sidewalk, w.speed, w.paved, w.lit, w.nodes"

    @staticmethod
    def _way_dicts(rows):
        """Database rows -> dicts ready for road_features.build_network()."""

        return [
            {
                "highway": highway,
                "road_class": road_class,
                "sidewalk": sidewalk,
                "speed": math.nan if speed is None else speed,
                "paved": paved,
                "lit": lit,
                "coords": decode_nodes(blob),
            }
            for _, highway, road_class, sidewalk, speed, paved, lit, blob in rows
        ]

    def _ways_touching(self, box):
        return self._connection().execute(
            f"""
            SELECT {self._WAY_COLUMNS}
            FROM ways_idx i JOIN ways w ON w.id = i.id
            WHERE i.max_lon >= ? AND i.min_lon <= ?
              AND i.max_lat >= ? AND i.min_lat <= ?
            """,
            box,
        )

    def ways_near(self, route_geometries, radius_m):
        """
        Highway ways whose bounding box touches a box along any route,
        as dicts ready for road_features.build_network().
        """

        found = {}

        for coordinates in route_geometries:
            for box in self._boxes_along(coordinates, radius_m):
                for row in self._ways_touching(box):
                    found.setdefault(row[0], row)

        return self._way_dicts(found.values())

    def ways_in_box(self, min_lon, max_lon, min_lat, max_lat):
        """Every way whose bounding box touches the given area."""

        return self._way_dicts(self._ways_touching((min_lon, max_lon, min_lat, max_lat)))

    def building_counts(self, samples):
        """
        For each [lon, lat] sample, the number of mapped buildings in the
        3 x 3 block of ~50 m grid cells around it (about 150 m square).
        """

        samples = np.asarray(samples, dtype=float)

        if len(samples) == 0:
            return np.zeros(0, dtype=int)

        centre = cell_key(samples[:, 0], samples[:, 1])
        column_mask = (1 << CELL_ROW_SHIFT) - 1

        rows = centre >> CELL_ROW_SHIFT
        columns = centre & column_mask

        neighbours = np.stack([
            ((rows + dr) << CELL_ROW_SHIFT) | (columns + dc)
            for dr in (-1, 0, 1)
            for dc in (-1, 0, 1)
        ], axis=1)

        wanted = np.unique(neighbours).tolist()
        counts = {}

        for start in range(0, len(wanted), 500):
            batch = wanted[start:start + 500]
            placeholders = ",".join("?" * len(batch))

            for cell, n in self._connection().execute(
                f"SELECT cell, n FROM building_cells WHERE cell IN ({placeholders})",
                batch,
            ):
                counts[cell] = n

        return np.array([
            sum(counts.get(int(key), 0) for key in row)
            for row in neighbours
        ])
