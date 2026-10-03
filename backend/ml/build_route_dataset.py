"""
Builds a REAL training table for the experimental AI/ML safety-analysis
model (ml.surrogate), by running the exact production pipeline
(routing_service + route_analyzer, which in turn uses geo_context and
weather_service) over many real origin/destination pairs within the
local Kerala database.

    python -m ml.build_route_dataset --count 300 --out ml/route_training_table.csv

Nothing is invented: every row is a real route OSRM returned between
two real mapped places, measured by the same code the live API uses,
labelled with the real rule-based score safety.py computed for it.
Routes with "Insufficient data" (safety_score is None) are dropped --
there is nothing valid to train on for those.

This makes real network calls to the public OSRM and Open-Meteo
services used in production, so it is deliberately paced (a small
concurrency limit, consistent with routing_service's own politeness
limit) and is meant to be run occasionally, not on every build.
"""

import argparse
import asyncio
import json
import random
import sqlite3
import sys
from datetime import datetime, timezone

import pandas as pd

from geo import haversine_m
from ml.route_features import surrogate_feature_row
from route_analyzer import analyze_all_routes
from routing_service import RoutingError, get_alternative_routes
from settings import GEO_DB_PATH

MIN_PAIR_KM = 0.3
MAX_PAIR_KM = 10.0

MAX_ATTEMPTS_FACTOR = 3  # try up to this many candidate pairs per target count


def _real_points(db_path, limit):
    """Real mapped point-of-interest coordinates spread across the database."""

    connection = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)

    try:
        rows = connection.execute(
            "SELECT lon, lat FROM pois ORDER BY RANDOM() LIMIT ?", (limit,)
        ).fetchall()
    finally:
        connection.close()

    return rows


def _candidate_pairs(points, count, seed):
    """Shuffled (origin, destination) pairs within a realistic walking distance."""

    rng = random.Random(seed)
    shuffled = points[:]
    rng.shuffle(shuffled)

    pairs = []

    for i in range(len(shuffled)):
        for j in range(i + 1, len(shuffled)):

            lon1, lat1 = shuffled[i]
            lon2, lat2 = shuffled[j]
            distance_km = haversine_m(lat1, lon1, lat2, lon2) / 1000

            if MIN_PAIR_KM <= distance_km <= MAX_PAIR_KM:
                pairs.append(((lat1, lon1), (lat2, lon2)))

            if len(pairs) >= count:
                return pairs

    return pairs


async def _one_pair(origin, destination, mode, semaphore, pause_s):

    async with semaphore:
        try:
            routes = await get_alternative_routes(
                origin[0], origin[1], destination[0], destination[1], mode=mode,
            )
        except RoutingError:
            return []
        finally:
            # However this pair turns out, give the free public OSRM
            # server a short rest before the next request starts.
            await asyncio.sleep(pause_s)

        analyzed = await analyze_all_routes(routes, mode=mode)

    rows = []

    for route in analyzed["routes"]:

        score = route.get("safety_score")

        if score is None:
            continue

        features = route["route_features"]
        coordinates = route["geometry"]["coordinates"]
        mid = coordinates[len(coordinates) // 2]

        rows.append({
            "mid_lon": round(mid[0], 6),
            "mid_lat": round(mid[1], 6),
            "distance_km": route["distance_km"],
            "safety_score": score,
            "risk_level": route.get("risk_level"),
            "data_confidence": route.get("data_confidence"),
            **surrogate_feature_row(
                features["route_shape"], features["road_network"],
                features["surroundings"], features["emergency"], route.get("weather"),
            ),
        })

    return rows


async def build(db_path, target_pairs, mode, concurrency, seed, pause_s=1.0, out_path=None):

    points = _real_points(db_path, limit=max(200, target_pairs * 2))

    if len(points) < 20:
        raise ValueError(f"only {len(points)} real points in the database; cannot build pairs")

    pairs = _candidate_pairs(points, target_pairs * MAX_ATTEMPTS_FACTOR, seed)
    print(f"Trying {len(pairs)} candidate origin/destination pairs (target {target_pairs})...", flush=True)

    semaphore = asyncio.Semaphore(concurrency)
    rows = []
    attempted = 0
    used_pairs = 0

    for origin, destination in pairs:

        if used_pairs >= target_pairs:
            break

        attempted += 1
        pair_rows = await _one_pair(origin, destination, mode, semaphore, pause_s)

        if pair_rows:
            rows.extend(pair_rows)
            used_pairs += 1

        if attempted % 10 == 0:
            print(f"  {attempted} pairs attempted, {used_pairs} usable, {len(rows)} scored routes so far", flush=True)

            # Saved incrementally: a network hiccup partway through loses
            # time, not the routes already collected.
            if out_path and rows:
                pd.DataFrame(rows).to_csv(out_path, index=False)

    return pd.DataFrame(rows), {
        "mode": mode,
        "od_pairs": used_pairs,
        "pairs_attempted": attempted,
        "scored_routes": len(rows),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "geo_database": db_path,
    }


def main(argv=None):

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--count", type=int, default=300, help="target number of real origin/destination pairs")
    parser.add_argument("--mode", default="walking", choices=["walking", "cycling", "driving"])
    parser.add_argument("--db", default=GEO_DB_PATH)
    parser.add_argument("--out", default="ml/route_training_table.csv")
    parser.add_argument("--concurrency", type=int, default=1, help="parallel OD pairs in flight")
    parser.add_argument("--pause", type=float, default=1.5, help="seconds to rest between OSRM requests")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(argv)

    table, report = asyncio.run(
        build(args.db, args.count, args.mode, args.concurrency, args.seed, args.pause, out_path=args.out)
    )

    table.to_csv(args.out, index=False)

    with open(args.out + ".meta.json", "w", encoding="utf8") as file:
        json.dump(report, file, indent=2)

    print(f"Wrote {len(table)} real scored routes ({report['od_pairs']} origin/destination pairs) to {args.out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
