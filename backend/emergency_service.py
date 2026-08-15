import httpx


# ==================================================
# OVERPASS SERVERS
# ==================================================

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]


# ==================================================
# GET ROUTE POINTS
# ==================================================

def get_route_points(coordinates, max_points=12):

    if not coordinates:
        return []

    if len(coordinates) <= max_points:
        return coordinates

    indexes = [
        round(
            i * (len(coordinates) - 1)
            / (max_points - 1)
        )
        for i in range(max_points)
    ]

    return [
        coordinates[index]
        for index in indexes
    ]


# ==================================================
# SEARCH EMERGENCY SERVICES ALONG ROUTE
# ==================================================

async def get_emergency_services_along_route(
    coordinates,
    radius=1500,
    max_points=12
):

    if not coordinates:
        return {
            "hospitals": [],
            "police_stations": []
        }


    # ------------------------------------------------
    # SELECT POINTS FROM THE ACTUAL ROUTE
    # ------------------------------------------------

    sampled_points = get_route_points(
        coordinates,
        max_points
    )


    print(
        f"Searching emergency services around "
        f"{len(sampled_points)} points along route..."
    )


    # ------------------------------------------------
    # BUILD OVERPASS QUERY
    # ------------------------------------------------

    query_parts = []


    for point in sampled_points:

        longitude = point[0]
        latitude = point[1]


        query_parts.append(
            f"""
            node["amenity"="hospital"]
            (around:{radius},{latitude},{longitude});

            way["amenity"="hospital"]
            (around:{radius},{latitude},{longitude});

            relation["amenity"="hospital"]
            (around:{radius},{latitude},{longitude});

            node["amenity"="police"]
            (around:{radius},{latitude},{longitude});

            way["amenity"="police"]
            (around:{radius},{latitude},{longitude});

            relation["amenity"="police"]
            (around:{radius},{latitude},{longitude});
            """
        )


    query = f"""
    [out:json][timeout:60];

    (
        {"".join(query_parts)}
    );

    out center;
    """


    # ------------------------------------------------
    # TRY OVERPASS SERVERS
    # ------------------------------------------------

    data = None


    for url in OVERPASS_URLS:

        try:

            print(
                "Trying Overpass:",
                url
            )


            async with httpx.AsyncClient(
                timeout=75.0
            ) as client:

                # IMPORTANT:
                # Overpass expects the query as
                # the "data" POST parameter.

                response = await client.post(
                    url,
                    data={
                        "data": query
                    },
                    headers={
                        "User-Agent":
                        "LumaPath/1.0"
                    }
                )


                response.raise_for_status()


                data = response.json()


                print(
                    "Overpass request successful."
                )


                break


        except Exception as error:

            print(
                "Overpass server failed:",
                url
            )

            print(
                "Error:",
                error
            )


    # ------------------------------------------------
    # ALL SERVERS FAILED
    # ------------------------------------------------

    if data is None:

        print(
            "All Overpass servers failed."
        )


        return {
            "hospitals": [],
            "police_stations": []
        }


    # ------------------------------------------------
    # GET ELEMENTS
    # ------------------------------------------------

    elements = data.get(
        "elements",
        []
    )


    # ------------------------------------------------
    # REMOVE DUPLICATES
    # ------------------------------------------------

    unique_elements = {}


    for element in elements:

        element_type = element.get(
            "type"
        )

        element_id = element.get(
            "id"
        )


        if (
            element_type is None
            or element_id is None
        ):
            continue


        key = (
            element_type,
            element_id
        )


        unique_elements[key] = element


    # ------------------------------------------------
    # SEPARATE HOSPITALS / POLICE
    # ------------------------------------------------

    hospitals = []

    police_stations = []


    for element in unique_elements.values():

        tags = element.get(
            "tags",
            {}
        )


        amenity = tags.get(
            "amenity"
        )


        if amenity == "hospital":

            hospitals.append(
                element
            )


        elif amenity == "police":

            police_stations.append(
                element
            )


    # ------------------------------------------------
    # RESULT
    # ------------------------------------------------

    print(
        "======================================"
    )

    print(
        "ROUTE EMERGENCY SERVICE RESULT"
    )

    print(
        "Hospitals:",
        len(hospitals)
    )

    print(
        "Police stations:",
        len(police_stations)
    )

    print(
        "======================================"
    )


    return {
        "hospitals": hospitals,
        "police_stations": police_stations
    }