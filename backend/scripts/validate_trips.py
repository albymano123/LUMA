"""
Validates the whole pipeline on many real trips (real OSRM, Open-Meteo,
local map data) and checks every response for correctness, not just
success:

    cd backend
    venv/Scripts/python -m scripts.validate_trips [--include-outside-kerala]

For each trip it checks that routes are distinct, plausible in time and
distance, consistently scored, and that the recommendation and the data
sources are reported honestly.
"""

import argparse
import asyncio
import logging
import sys

import geo_context
from geo import haversine_m, resample_line, route_overlap
from route_analyzer import analyze_all_routes
from routing_service import RoutingError, get_alternative_routes


# name, mode, (lat, lon) source, (lat, lon) destination
KERALA_TRIPS = [
    ("Chalakudy -> Kodakara", "walking", (10.3042, 76.3371), (10.3717, 76.3042)),
    ("Chalakudy -> Kodakara", "driving", (10.3042, 76.3371), (10.3717, 76.3042)),
    ("Ernakulam South -> Fort Kochi", "driving", (9.9816, 76.2999), (9.9639, 76.2427)),
    ("Ernakulam South -> Marine Drive", "walking", (9.9689, 76.2900), (9.9784, 76.2757)),
    ("Kottayam -> Ettumanoor", "cycling", (9.5916, 76.5222), (9.6707, 76.5609)),
    ("Thrissur -> Guruvayur", "driving", (10.5276, 76.2144), (10.5940, 76.0390)),
    ("Thrissur Round -> Vadakkunnathan", "walking", (10.5276, 76.2144), (10.5232, 76.2138)),
    ("Kozhikode beach -> railway station", "walking", (11.2588, 75.7615), (11.2478, 75.7804)),
    ("Thiruvananthapuram -> Kovalam", "driving", (8.4875, 76.9525), (8.4004, 76.9787)),
    ("Alappuzha beach -> boat jetty", "cycling", (9.4881, 76.3220), (9.5010, 76.3388)),
    ("Kannur -> Payyambalam", "cycling", (11.8745, 75.3704), (11.8590, 75.3560)),
    ("Munnar town -> Eravikulam", "driving", (10.0889, 77.0595), (10.1500, 77.0500)),
]

OUTSIDE_TRIPS = [
    ("Bengaluru MG Road -> Indiranagar", "walking", (12.9756, 77.6068), (12.9784, 77.6408)),
]

problems = []


def check(condition, trip, message):
    if not condition:
        problems.append(f"{trip}: {message}")


async def validate(name, mode, source, destination):

    label = f"{name} [{mode}]"

    try:
        routes = await get_alternative_routes(*source, *destination, mode=mode)
    except RoutingError as error:
        print(f"{label:52} no route: {error}")
        return

    result = await analyze_all_routes(routes, mode)
    found = result["routes"]
    straight_km = haversine_m(*source, *destination) / 1000

    # ---- routes are real, distinct and plausible ----
    check(1 <= len(found) <= 5, label, f"{len(found)} routes")
    check(len({r["id"] for r in found}) == len(found), label, "duplicate route ids")

    shortest = min(r["distance_km"] for r in found)

    # Routing snaps the endpoints to the nearest road, so compare each
    # route with the straight line between its OWN endpoints.
    for r in found:
        first, last = r["geometry"]["coordinates"][0], r["geometry"]["coordinates"][-1]
        own_straight_km = haversine_m(first[1], first[0], last[1], last[0]) / 1000
        check(r["distance_km"] >= own_straight_km * 0.99, label, f"{r['name']} shorter than its own straight line")

    for r in found:
        check(r["distance_km"] <= shortest * 1.6 + 0.01, label, f"{r['name']} is an absurd detour")
        speed = r["distance_km"] / (r["duration_min"] / 60)
        limits = {"walking": (2, 7), "cycling": (5, 30), "driving": (5, 110)}[mode]
        check(limits[0] <= speed <= limits[1], label, f"{r['name']} implausible speed {speed:.1f} km/h")

    samples = [resample_line(r["geometry"]["coordinates"], 80, 300) for r in found]
    for i, a in enumerate(samples):
        for b in samples[i + 1:]:
            check(route_overlap(a, b) <= 0.8 or route_overlap(b, a) <= 0.8, label, "near-duplicate routes")

    # ---- scoring is consistent and honest ----
    for r in found:
        score = r["safety_score"]
        check(score is None or 0 <= score <= 100, label, f"score {score}")
        check((score is None) == (r["risk_level"] == "Insufficient data"), label, "score/risk mismatch")
        check(len(r["factors"]) == 6, label, "wrong number of factors")

    scored = [r for r in found if r["safety_score"] is not None]
    recommendation = result["recommendation"]

    if recommendation["route_id"]:
        winner = next(r for r in found if r["id"] == recommendation["route_id"])
        check("safest" in winner["categories"], label, "recommended route is not tagged safest")
        check(winner["safety_score"] >= max(r["safety_score"] for r in scored) - 2, label, "recommended is not (near) the top score")
        check(winner["data_confidence"] != "low", label, "recommended on low confidence")
    else:
        check(recommendation["state"] == "unavailable", label, "no recommended id but state is not 'unavailable'")

    check(sum("fastest" in r["categories"] for r in found) == 1, label, "fastest tag count")

    sources = result["data_sources"]
    check(result["geo_source"]["type"] in ("local", "live"), label, "no geo source")

    local = result["geo_source"]["type"] == "local"

    if local:
        check(all(sources.values()), label, f"a data source failed on local data: {sources}")
        check(all(r["emergency_services"] for r in found), label, "no emergency services found on local data")

    print(
        f"{label:52} {len(found)} routes, {shortest:5.1f} km, "
        f"scores {[r['safety_score'] for r in found]}, {recommendation['state']:11}"
        f" [{result['geo_source']['type']}]"
    )


async def main(include_outside):

    logging.disable(logging.CRITICAL)
    trips = KERALA_TRIPS + (OUTSIDE_TRIPS if include_outside else [])

    for trip in trips:
        try:
            await validate(*trip)
        except Exception as error:      # a crash is a failure, not a skip
            problems.append(f"{trip[0]} [{trip[1]}]: crashed: {error!r}")

    print()

    if problems:
        print(f"{len(problems)} PROBLEM(S):")
        for problem in problems:
            print("  -", problem)
        return 1

    print(f"All {len(trips)} trips validated.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--include-outside-kerala", action="store_true",
                        help="also test live-data fallback (slower, uses public Overpass servers)")
    args = parser.parse_args()

    geo_context.reset_store()
    sys.exit(asyncio.run(main(args.include_outside_kerala)))
