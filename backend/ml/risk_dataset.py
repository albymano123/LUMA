"""
Builds the real training table for the AI/ML risk model from real UK
DfT STATS19 road-collision and casualty data (data.dft.gov.uk, Open
Government Licence). No row is invented: every one is a real,
individually recorded pedestrian or cyclist casualty, joined to the
real conditions of the collision they were in.

    python -m ml.risk_dataset \
        --collisions ml/data/raw/collision_2023.csv ml/data/raw/collision_2024.csv \
        --casualties ml/data/raw/casualty_2023.csv ml/data/raw/casualty_2024.csv \
        --out ml/risk_training_table.csv

The label (`severe`) is whether that real casualty's police-recorded
severity was Fatal or Serious rather than Slight (see
ml/risk_features.py for why this, and not an invented "crash
probability", is the honest target, and why pedestrians/cyclists
specifically). Rows with missing/unknown values in a field this
project uses are dropped rather than guessed.
"""

import argparse
import sys

import pandas as pd

from ml.risk_features import (
    CYCLIST_CASUALTY_TYPE, FEATURE_COLUMNS, PEDESTRIAN_CASUALTY_TYPE,
    stats19_row_features,
)

COLLISION_COLUMNS = [
    "collision_index", "collision_year", "local_authority_ons_district",
    "first_road_class", "speed_limit", "junction_detail",
    "light_conditions", "weather_conditions", "urban_or_rural_area",
    "time", "day_of_week",
]
CASUALTY_COLUMNS = ["collision_index", "casualty_type", "casualty_severity"]


def _load(paths, columns):
    frames = [pd.read_csv(p, usecols=lambda c: c in columns, low_memory=False) for p in paths]
    return pd.concat(frames, ignore_index=True)


def build_dataset(collisions, casualties):
    """collisions, casualties: real STATS19 DataFrames (see _load).
    Returns (table, report)."""

    vru = casualties[casualties["casualty_type"].isin((PEDESTRIAN_CASUALTY_TYPE, CYCLIST_CASUALTY_TYPE))]

    joined = vru.merge(collisions, on="collision_index", how="inner", validate="many_to_one")

    rows = []
    dropped_missing = 0

    for record in joined.to_dict("records"):

        features = stats19_row_features(record, record["casualty_type"])

        if features is None:
            dropped_missing += 1
            continue

        severity = record["casualty_severity"]

        rows.append({
            "collision_index": record["collision_index"],
            "collision_year": record["collision_year"],
            "local_authority_ons_district": record["local_authority_ons_district"],
            "casualty_type": record["casualty_type"],
            "severe": 1 if severity in (1, 2) else 0,
            **features,
        })

    table = pd.DataFrame(rows)

    report = {
        "real_pedestrian_or_cyclist_casualties": int(len(vru)),
        "rows_used": int(len(table)),
        "rows_dropped_missing_fields": int(dropped_missing),
        "pedestrian_rows": int((table["casualty_type"] == PEDESTRIAN_CASUALTY_TYPE).sum()) if len(table) else 0,
        "cyclist_rows": int((table["casualty_type"] == CYCLIST_CASUALTY_TYPE).sum()) if len(table) else 0,
        "severe_rate": float(table["severe"].mean()) if len(table) else None,
        "years": sorted(int(y) for y in table["collision_year"].unique()) if len(table) else [],
        "districts": int(table["local_authority_ons_district"].nunique()) if len(table) else 0,
    }

    return table, report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--collisions", nargs="+", required=True, help="real STATS19 collision CSV file(s)")
    parser.add_argument("--casualties", nargs="+", required=True, help="real STATS19 casualty CSV file(s)")
    parser.add_argument("--out", default="ml/risk_training_table.csv")
    args = parser.parse_args(argv)

    collisions = _load(args.collisions, COLLISION_COLUMNS)
    casualties = _load(args.casualties, CASUALTY_COLUMNS)

    table, report = build_dataset(collisions, casualties)
    table.to_csv(args.out, index=False)

    print(f"Wrote {len(table):,} real pedestrian/cyclist casualty rows to {args.out}")
    print(report)

    return 0


if __name__ == "__main__":
    sys.exit(main())
