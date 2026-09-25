"""
Builds a training table from REAL incident records.

    python -m ml.build_dataset --incidents incidents.csv --bbox 9.90,76.24,9.99,76.32 --area "Kochi centre" --mode walking

incidents.csv needs the columns lat and lon and may have timestamp,
category, severity (see ml/README.md). Nothing is invented: every
training row is a real stretch of OpenStreetMap road, described by the
same features the live API computes, labelled with how many real
incidents were recorded along it.

Only the labels come from incident data. The features are environment
features. Both halves are stored in the output so the model's inputs
and its ground truth stay separate.
"""

import argparse
import json
import sys

import httpx
import numpy as np
import pandas as pd

from emergency_service import EMERGENCY_AMENITIES
from geo import distance_matrix_m, haversine_m, resample_line
from ml.features import feature_row
from road_features import (
    build_bbox_road_query,
    parse_road_network,
    road_network_features,
    route_shape_features,
)


WINDOW_M = 500
MIN_WINDOW_M = 250
INCIDENT_RADIUS_M = 40

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


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

def road_windows(elements, window_m=WINDOW_M, min_window_m=MIN_WINDOW_M):
    """
    Cuts every OSM way into consecutive stretches of about window_m
    metres. Returns lists of [lon, lat] points.
    """

    coordinates = {
        e["id"]: [e["lon"], e["lat"]]
        for e in elements
        if e.get("type") == "node" and "lat" in e
    }

    windows = []

    for way in elements:

        if way.get("type") != "way" or "highway" not in way.get("tags", {}):
            continue

        points = [coordinates[n] for n in way.get("nodes", []) if n in coordinates]

        current = []
        length = 0.0

        for point in points:

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


# ==================================================
# EMERGENCY SERVICES
# ==================================================

def median_nearest(window, points):
    """Median over the window of the distance to the nearest point, or None."""

    if len(points) == 0:
        return None

    samples = resample_line(window, spacing_m=100, max_points=20)

    return float(np.median(distance_matrix_m(samples, points).min(axis=1)))


def _overpass(query):

    response = httpx.post(
        OVERPASS_URL,
        data={"data": query},
        timeout=180,
        headers={"User-Agent": "LumaPath/1.0 (dataset builder)"},
    )
    response.raise_for_status()

    return response.json()


def fetch_emergency_points(south, west, north, east):
    """Hospital/clinic and police points, searched ~3 km beyond the area (the walking radius the live API uses)."""

    pad = 0.03
    query = (
        "[out:json][timeout:90];"
        f'nwr["amenity"~"^({"|".join(EMERGENCY_AMENITIES)})$"]'
        f"({south - pad},{west - pad},{north + pad},{east + pad});"
        "out tags center qt;"
    )

    hospitals, police = [], []

    for element in _overpass(query).get("elements", []):

        if "lat" in element:
            position = (element["lon"], element["lat"])
        elif "center" in element:
            position = (element["center"]["lon"], element["center"]["lat"])
        else:
            continue

        amenity = element.get("tags", {}).get("amenity")

        if amenity in ("hospital", "clinic"):
            hospitals.append(position)
        elif amenity == "police":
            police.append(position)

    return (
        np.array(hospitals, dtype=float).reshape(-1, 2),
        np.array(police, dtype=float).reshape(-1, 2),
    )


# ==================================================
# BUILD
# ==================================================

def build_dataset(elements, incidents, hospitals, police, years=None):
    """One row per road window: features + real incident count + label."""

    network = parse_road_network(elements)

    if network is None:
        raise ValueError("no roads found in the area")

    incident_points = incidents[["lon", "lat"]].to_numpy(dtype=float)
    rows = []

    for index, window in enumerate(road_windows(elements)):

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
            **feature_row(shape, road, emergency),
        })

    return pd.DataFrame(rows)


def main(argv=None):

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--incidents", required=True, help="CSV of real incidents (lat, lon, ...)")
    parser.add_argument("--bbox", required=True, help="south,west,north,east of the area to cover")
    parser.add_argument("--area", default="", help="name of the area, stored with the model")
    parser.add_argument("--mode", default="walking", choices=["walking", "cycling", "driving"])
    parser.add_argument("--out", default="ml/training_windows.csv")
    args = parser.parse_args(argv)

    south, west, north, east = (float(v) for v in args.bbox.split(","))

    incidents, report = load_incidents(args.incidents)
    print("Incidents:", report)

    inside = incidents[
        incidents["lat"].between(south, north) & incidents["lon"].between(west, east)
    ]
    print(f"{len(inside)} of {len(incidents)} incidents fall inside the area")

    print("Fetching roads from Overpass (can take a minute)...")
    elements = _overpass(build_bbox_road_query(south, west, north, east))["elements"]

    hospitals, police = fetch_emergency_points(south, west, north, east)

    table = build_dataset(elements, inside, hospitals, police, years=report["years_covered"])
    table.to_csv(args.out, index=False)

    with open(args.out + ".meta.json", "w", encoding="utf8") as file:
        json.dump(
            {
                **report,
                "area": args.area,
                "mode": args.mode,
                "bbox": args.bbox,
                "incidents_in_area": int(len(inside)),
            },
            file,
            indent=2,
        )

    print(f"Wrote {len(table)} road windows to {args.out}")


if __name__ == "__main__":
    sys.exit(main())
