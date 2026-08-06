from emergency_service import get_nearby_emergency_services
from weather_service import get_weather
from safety import calculate_safety_score


# Select a small number of representative points
# from the complete route geometry.
def sample_route_points(coordinates, max_points=10):
    if not coordinates:
        return []

    if len(coordinates) <= max_points:
        return coordinates

    step = max(1, len(coordinates) // max_points)

    sampled_points = coordinates[::step]

    return sampled_points[:max_points]


# Analyze ONE real route.
async def analyze_route(route):
    coordinates = route["geometry"]["coordinates"]

    # Use only 5 points for now to avoid too many
    # requests to public APIs such as Overpass.
    sampled_points = sample_route_points(
        coordinates,
        max_points=5
    )

    total_hospitals = 0
    total_police = 0

    precipitation_values = []
    wind_values = []

    # Analyze each sampled location along the route.
    for point in sampled_points:

        # GeoJSON/OSRM coordinate order:
        # [longitude, latitude]
        longitude = point[0]
        latitude = point[1]

        # -----------------------------
        # Emergency services
        # -----------------------------
        try:
            emergency = await get_nearby_emergency_services(
                latitude,
                longitude
            )

            total_hospitals += emergency["hospitals"]
            total_police += emergency["police_stations"]

        except Exception as error:
            print(
                "Emergency service error:",
                error
            )

        # -----------------------------
        # Weather
        # -----------------------------
        try:
            weather = await get_weather(
                latitude,
                longitude
            )

            precipitation_values.append(
                weather["precipitation"]
            )

            wind_values.append(
                weather["wind_speed"]
            )

        except Exception as error:
            print(
                "Weather error:",
                error
            )

    # -----------------------------
    # Calculate average weather
    # -----------------------------
    average_precipitation = (
        sum(precipitation_values)
        / len(precipitation_values)
        if precipitation_values
        else 0
    )

    average_wind = (
        sum(wind_values)
        / len(wind_values)
        if wind_values
        else 0
    )

    # -----------------------------
    # Calculate route safety
    # -----------------------------
    safety = calculate_safety_score(
        hospitals=total_hospitals,
        police_stations=total_police,
        precipitation=average_precipitation,
        wind_speed=average_wind
    )

    return {
        "hospitals": total_hospitals,
        "police_stations": total_police,
        "precipitation": round(
            average_precipitation,
            2
        ),
        "wind_speed": round(
            average_wind,
            2
        ),
        "safety_score": safety["safety_score"],
        "risk_level": safety["risk_level"]
    }


# Analyze ALL alternative routes.
async def analyze_all_routes(routes):
    analyzed_routes = []

    for route in routes:

        safety_data = await analyze_route(route)

        # Combine OSRM route information
        # with calculated safety information.
        analyzed_routes.append({
            **route,
            **safety_data
        })

    return analyzed_routes