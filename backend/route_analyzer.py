from emergency_service import (
    get_emergency_services_along_route
)

from weather_service import (
    get_weather
)

from safety import (
    calculate_safety_score
)


# ==================================================
# SAMPLE ROUTE POINTS
# ==================================================

def sample_route_points(

    coordinates,

    max_points=5

):

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
# ANALYZE ONE ROUTE
# ==================================================

async def analyze_route(route):

    print()
    print(
        "======================================"
    )

    print(
        "ANALYZING:",
        route["name"]
    )

    print(
        "======================================"
    )


    # ------------------------------------------------
    # GET OSRM GEOMETRY
    # ------------------------------------------------

    coordinates = (

        route

        .get(
            "geometry",
            {}
        )

        .get(
            "coordinates",
            []
        )

    )


    # ------------------------------------------------
    # FIND HOSPITALS + POLICE ALONG THIS ROUTE
    # ------------------------------------------------

    emergency = (

        await get_emergency_services_along_route(

            coordinates,

            radius=1500,

            max_points=12

        )

    )


    hospitals = emergency.get(

        "hospitals",

        []

    )


    police_stations = emergency.get(

        "police_stations",

        []

    )


    hospital_count = len(
        hospitals
    )


    police_station_count = len(
        police_stations
    )


    print(

        f"{route['name']} → "

        f"{hospital_count} hospitals | "

        f"{police_station_count} police stations"

    )


    # ------------------------------------------------
    # WEATHER ALONG ROUTE
    # ------------------------------------------------

    weather_points = (

        sample_route_points(

            coordinates,

            max_points=5

        )

    )


    precipitation_values = []

    wind_values = []


    for point in weather_points:

        longitude = point[0]

        latitude = point[1]


        weather = await get_weather(

            latitude,

            longitude

        )


        precipitation_values.append(

            float(

                weather.get(

                    "precipitation",

                    0

                )

            )

        )


        wind_values.append(

            float(

                weather.get(

                    "wind_speed",

                    0

                )

            )

        )


    # ------------------------------------------------
    # AVERAGE WEATHER
    # ------------------------------------------------

    if precipitation_values:

        average_precipitation = (

            sum(
                precipitation_values
            )

            /

            len(
                precipitation_values
            )

        )

    else:

        average_precipitation = 0


    if wind_values:

        average_wind = (

            sum(
                wind_values
            )

            /

            len(
                wind_values
            )

        )

    else:

        average_wind = 0


    # ------------------------------------------------
    # SAFETY SCORE
    # ------------------------------------------------

    safety = calculate_safety_score(

        hospitals=
        hospital_count,

        police_stations=
        police_station_count,

        precipitation=
        average_precipitation,

        wind_speed=
        average_wind

    )


    # ------------------------------------------------
    # RETURN ROUTE DATA
    # ------------------------------------------------

    return {

        # OSRM data
        **route,


        # Emergency services
        "hospitals":
        hospitals,

        "police_stations":
        police_stations,


        # Counts
        "hospital_count":
        hospital_count,

        "police_station_count":
        police_station_count,


        # Weather
        "precipitation":
        round(
            average_precipitation,
            2
        ),

        "wind_speed":
        round(
            average_wind,
            2
        ),


        # Safety
        "safety_score":
        safety["safety_score"],

        "risk_level":
        safety["risk_level"]

    }


# ==================================================
# ANALYZE ALL ROUTES
# ==================================================

async def analyze_all_routes(

    routes

):

    analyzed_routes = []


    for route in routes:

        analyzed_route = (

            await analyze_route(

                route

            )

        )


        analyzed_routes.append(

            analyzed_route

        )


    print()

    print(
        "Total routes analyzed:",
        len(analyzed_routes)
    )


    return analyzed_routes