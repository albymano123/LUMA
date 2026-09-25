"""
Times each stage of a route analysis on real trips (real OSRM, real
Open-Meteo, the local map database), cold and then warm (cached).

    cd backend
    venv/Scripts/python -m scripts.benchmark

Use it to see where time goes before optimising anything.
"""

import asyncio
import logging
import statistics
import time

import geo_context
import routing_service
import weather_service
from route_analyzer import analyze_all_routes
from routing_service import get_alternative_routes


TRIPS = [
    ("Chalakudy -> Kodakara", "walking", (10.3042, 76.3371), (10.3717, 76.3042)),
    ("Ernakulam -> Fort Kochi", "driving", (9.9816, 76.2999), (9.9639, 76.2427)),
    ("Kottayam -> Ettumanoor", "cycling", (9.5916, 76.5222), (9.6707, 76.5609)),
    ("Thrissur -> Guruvayur", "driving", (10.5276, 76.2144), (10.5940, 76.0390)),
    ("Kozhikode beach -> railway station", "walking", (11.2588, 75.7615), (11.2478, 75.7804)),
]


async def time_trip(mode, source, destination):

    t0 = time.perf_counter()
    routes = await get_alternative_routes(*source, *destination, mode=mode)
    t1 = time.perf_counter()

    result = await analyze_all_routes(routes, mode)
    t2 = time.perf_counter()

    return {
        "routes": len(routes),
        "routing_s": t1 - t0,
        "analysis_s": t2 - t1,
        "total_s": t2 - t0,
        "scored": sum(r["safety_score"] is not None for r in result["routes"]),
    }


async def main():

    logging.disable(logging.CRITICAL)
    print(f"{'trip':38} {'mode':8} {'routes':>6} {'routing':>8} {'analysis':>9} {'total':>7}  scored")

    cold_totals, warm_totals = [], []

    for name, mode, source, destination in TRIPS:
        cold = await time_trip(mode, source, destination)
        warm = await time_trip(mode, source, destination)

        cold_totals.append(cold["total_s"])
        warm_totals.append(warm["total_s"])

        print(
            f"{name:38} {mode:8} {cold['routes']:>6} {cold['routing_s']:>7.2f}s "
            f"{cold['analysis_s']:>8.2f}s {cold['total_s']:>6.2f}s  "
            f"{cold['scored']}/{cold['routes']}   (warm {warm['total_s']:.2f}s)"
        )

    print(
        f"\ncold: median {statistics.median(cold_totals):.2f}s, worst {max(cold_totals):.2f}s"
        f" | warm (cached): median {statistics.median(warm_totals):.2f}s"
    )


if __name__ == "__main__":
    geo_context.reset_store()
    routing_service._route_cache = routing_service.TTLCache(ttl_seconds=600)
    weather_service._weather_cache = weather_service.TTLCache(ttl_seconds=600)
    asyncio.run(main())
