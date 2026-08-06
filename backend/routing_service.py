import httpx


# ==================================================
# OSRM ROUTING SERVER
# ==================================================

OSRM_URL = "https://router.project-osrm.org/route/v1/driving"


# ==================================================
# GET ALTERNATIVE ROUTES
# ==================================================

async def get_alternative_routes(
    source_lat,
    source_lon,
    destination_lat,
    destination_lon
):

    # ------------------------------------------------
    # OSRM expects coordinates in this order:
    #
    # longitude,latitude
    #
    # NOT latitude,longitude
    # ------------------------------------------------

    coordinates = (
        f"{source_lon},{source_lat};"
        f"{destination_lon},{destination_lat}"
    )


    # Example:
    #
    # https://router.project-osrm.org/route/v1/driving/
    # 76.2,10.5;76.3,10.6

    url = f"{OSRM_URL}/{coordinates}"


    # ------------------------------------------------
    # OSRM OPTIONS
    # ------------------------------------------------

    params = {

        # Ask OSRM for alternative routes
        "alternatives": "true",

        # Return complete route geometry
        "overview": "full",

        # Return geometry as GeoJSON
        "geometries": "geojson",

        # We don't currently need turn-by-turn steps
        "steps": "false"
    }


    # ------------------------------------------------
    # SEND REQUEST TO OSRM
    # ------------------------------------------------

    async with httpx.AsyncClient(
        timeout=30.0
    ) as client:

        response = await client.get(
            url,
            params=params
        )

        # Raise error if OSRM request failed
        response.raise_for_status()

        data = response.json()


    # ==================================================
    # DEBUG INFORMATION
    #
    # This allows us to see EXACTLY how many routes
    # OSRM itself returned.
    # ==================================================

    osrm_routes = data.get(
        "routes",
        []
    )


    print("\n")
    print("=" * 50)
    print("LUMAPATH - OSRM ROUTING DEBUG")
    print("=" * 50)

    print(
        "OSRM Status:",
        data.get("code")
    )

    print(
        "Routes returned by OSRM:",
        len(osrm_routes)
    )


    # Print basic information about every route
    for index, route in enumerate(
        osrm_routes
    ):

        distance_km = round(
            route["distance"] / 1000,
            2
        )

        duration_min = round(
            route["duration"] / 60,
            1
        )

        print(
            f"Route {index + 1}: "
            f"{distance_km} km | "
            f"{duration_min} min"
        )


    print("=" * 50)
    print("\n")


    # ==================================================
    # CONVERT OSRM DATA INTO OUR LUMAPATH FORMAT
    # ==================================================

    routes = []


    for index, route in enumerate(
        osrm_routes
    ):

        routes.append({

            # Route name
            "name": f"Route {index + 1}",


            # OSRM distance is in meters.
            # Convert meters → kilometers.
            "distance_km": round(
                route["distance"] / 1000,
                2
            ),


            # OSRM duration is in seconds.
            # Convert seconds → minutes.
            "duration_min": round(
                route["duration"] / 60,
                1
            ),


            # Full road geometry used by Leaflet
            "geometry": route["geometry"]

        })


    # ==================================================
    # RETURN ALL ROUTES
    # ==================================================

    return routes