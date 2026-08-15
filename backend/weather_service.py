import httpx


# ==================================================
# OPEN-METEO WEATHER API
# ==================================================

WEATHER_URL = (
    "https://api.open-meteo.com/v1/forecast"
)


# ==================================================
# GET WEATHER
# ==================================================

async def get_weather(
    latitude,
    longitude
):

    try:

        params = {

            "latitude": latitude,

            "longitude": longitude,

            "current": (
                "temperature_2m,"
                "weather_code,"
                "wind_speed_10m,"
                "precipitation"
            )

        }


        async with httpx.AsyncClient(
            timeout=15.0
        ) as client:

            response = await client.get(
                WEATHER_URL,
                params=params
            )

            response.raise_for_status()

            data = response.json()


        current = data.get(
            "current",
            {}
        )


        return {

            "temperature":
            current.get(
                "temperature_2m",
                0
            ),

            "weather_code":
            current.get(
                "weather_code",
                0
            ),

            "precipitation":
            current.get(
                "precipitation",
                0
            ),

            "wind_speed":
            current.get(
                "wind_speed_10m",
                0
            )

        }


    except Exception as error:

        print(
            "Weather API error:",
            error
        )

        return {

            "temperature": 0,

            "weather_code": 0,

            "precipitation": 0,

            "wind_speed": 0

        }