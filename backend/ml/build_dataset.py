"""
Builds a training table from REAL incident records.

    python -m ml.build_dataset --incidents incidents.csv --bbox 9.90,76.24,9.99,76.32 --area "Kochi centre"

incidents.csv needs the columns lat and lon and may have timestamp,
category, severity (see ml/README.md). Nothing is invented: every
training row is a real stretch of OpenStreetMap road from the local
geo-database, described by the same features the live API computes
and labelled with how many real incidents were recorded along it.

Only the labels come from incident data. The features are environment
features. Both halves are stored in the output so the model's inputs
and its ground truth stay separate.
"""

import argparse
import json
import sys

import numpy as np
import pandas as pd

from geo import distance_matrix_m, haversine_m, resample_line
from geodata.store import GeoStore
from ml.features import feature_row
from road_features import build_network, road_network_features, route_shape_features
from settings import BUILT_UP_MIN_BUILDINGS, GEO_DB_PATH


WINDOW_M = 500
MIN_WINDOW_M = 250
INCIDENT_RADIUS_M = 40


# ==================================================
# INCIDENTS
# ==================================================

def load_incidents(path):
    """Validated incident points as a DataFrame, plus a report of what was dropped."""

    frame = pd.read_csv(path)

    missing = {"lat", "lon"} - set(frame.columns)

    if missing:
        raise ValueError(f"incident file is missing columns: {sorted(missing)}")

    total = len(frame)

    frame["lat"] = pd.to_numeric(frame["lat"], errors="coerce")
    frame["lon"] = pd.to_numeric(frame["lon"], errors="coerce")

    frame = frame.dropna(subset=["lat", "lon"])
    frame = frame[frame["lat"].between(-90, 90) & frame["lon"].between(-180, 180)]

    years = None

    if "timestamp" in frame.columns:
        stamps = pd.to_datetime(frame["timestamp"], errors="coerce", utc=True).dropna()

        if len(stamps) >= 2:
            years = max((stamps.max() - stamps.min()).days / 365.25, 1 / 12)

    return frame.reset_index(drop=True), {
        "rows_in_file": total,
        "rows_used": len(frame),
        "years_covered": None if years is None else round(years, 2),
    }


# ==================================================
# WINDOWS: ~500 m stretches of real road
# ==================================================

def road_windows(ways, window_m=WINDOW_M, min_window_m=MIN_WINDOW_M):
    """
    Cuts every way (dict with "coords") into consecutive stretches of
    about window_m metres. Returns lists of [lon, lat] points.
    """

    windows = []

    for way in ways:

        current = []
        length = 0.0

        for point in way["coords"].tolist():

            if current:
                length += haversine_m(current[-1][1], current[-1][0], point[1], point[0])

            current.append(point)

            if length >= window_m:
                windows.append(current)
                current = [point]
                length = 0.0

        if length >= min_window_m and len(current) >= 2:
            windows.append(current)

    return windows


def count_incidents(window, incident_points, radius_m=INCIDENT_RADIUS_M):
    """Incidents within radius_m of a window's line (sampled every ~20 m)."""

    if len(incident_points) == 0:
        return 0

    samples = resample_line(window, spacing_m=20, max_points=100)

    lats = [p[1] for p in samples]
    lons = [p[0] for p in samples]
    pad = radius_m / 111_320 * 2

    near_box = incident_points[
        (incident_points[:, 1] >= min(lats) - pad)
        & (incident_points[:, 1] <= max(lats) + pad)
        & (incident_points[:, 0] >= min(lons) - pad * 1.2)
        & (incident_points[:, 0] <= max(lons) + pad * 1.2)
    ]

    if len(near_box) == 0:
        return 0

    return int((distance_matrix_m(near_box, samples).min(axis=1) <= radius_m).sum())


def median_nearest(window, points):
    """Median over the window of the distance to the nearest point, or None."""

    if len(points) == 0:
        return None

    samples = resample_line(window, spacing_m=100, max_points=20)

    return float(np.median(distance_matrix_m(samples, points).min(axis=1)))


# ==================================================
# BUILD
# ==================================================

def _surroundings(window, building_counts):

    samples = resample_line(window, spacing_m=50, max_points=100)

    if len(samples) < 2 or building_counts is None:
        return {}

    built = building_counts(samples) >= BUILT_UP_MIN_BUILDINGS
    run = longest = 0

    for value in ~built:
        run = run + 1 if value else 0
        longest = max(longest, run)

    return {
        "built_up_share": float(built.mean()),
        "longest_unbuilt_km": longest * 0.05,
    }


def build_dataset(ways, incidents, hospitals, police, building_counts=None, years=None):
    """One row per road window: features + real incident count + label."""

    network = build_network(ways)

    if network is None:
        raise ValueError("no roads found in the area")

    incident_points = incidents[["lon", "lat"]].to_numpy(dtype=float)
    rows = []

    for index, window in enumerate(road_windows(ways)):

        road = road_network_features(window, network)

        if not road.get("available"):
            continue

        shape = route_shape_features(window)
        emergency = {
            "hospital_median_m": median_nearest(window, hospitals),
            "police_median_m": median_nearest(window, police),
        }

        length_km = shape["route_km"]
        count = count_incidents(window, incident_points)
        mid = window[len(window) // 2]

        rows.append({
            "window_id": index,
            "mid_lon": round(mid[0], 6),
            "mid_lat": round(mid[1], 6),
            "length_km": length_km,
            "incident_count": count,
            # The label: real recorded incidents per km (per year if
            # the file has timestamps).
            "incidents_per_km": count / length_km / (years or 1),
            **feature_row(shape, road, _surroundings(window, building_counts), emergency),
        })

    return pd.DataFrame(rows)


def main(argv=None):

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--incidents", required=True, help="CSV of real incidents (lat, lon, ...)")
    parser.add_argument("--bbox", required=True, help="south,west,north,east of the area to cover")
    parser.add_argument("--area", default="", help="name of the area, stored with the model")
    parser.add_argument("--db", default=GEO_DB_PATH, help="local geo-database")
    parser.add_argument("--out", default="ml/training_windows.csv")
    args = parser.parse_args(argv)

    south, west, north, east = (float(v) for v in args.bbox.split(","))
    # Training and prediction both use walking-mode features.
    mode = "walking"

    incidents, report = load_incidents(args.incidents)
    print("Incidents:", report)

    inside = incidents[
        incidents["lat"].between(south, north) & incidents["lon"].between(west, east)
    ]
    print(f"{len(inside)} of {len(incidents)} incidents fall inside the area")

    store = GeoStore(args.db)
    corners = [[[west, south], [east, north]]]

    ways = store.ways_in_box(west, east, south, north)
    services = store.emergency_services(corners, 3000)

    hospitals = np.array([[s["lon"], s["lat"]] for s in services if s["kind"] in ("hospital", "clinic")]).reshape(-1, 2)
    police = np.array([[s["lon"], s["lat"]] for s in services if s["kind"] == "police"]).reshape(-1, 2)

    table = build_dataset(
        ways, inside, hospitals, police,
        building_counts=store.building_counts, years=report["years_covered"],
    )
    table.to_csv(args.out, index=False)

    with open(args.out + ".meta.json", "w", encoding="utf8") as file:
        json.dump(
            {
                **report,
                "area": args.area,
                "mode": mode,
                "bbox": args.bbox,
                "incidents_in_area": int(len(inside)),
                "geo_database": store.describe(),
            },
            file,
            indent=2,
        )

    print(f"Wrote {len(table)} road windows to {args.out}")


if __name__ == "__main__":
    sys.exit(main())
