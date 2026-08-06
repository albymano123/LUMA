import httpx


WEATHER_URL = "https://api.open-meteo.com/v1/forecast"


async def get_weather(latitude: float, longitude: float):
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": (
            "temperature_2m,"
            "precipitation,"
            "wind_speed_10m"
        )
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            WEATHER_URL,
            params=params
        )

        response.raise_for_status()
        data = response.json()

    current = data.get("current", {})

    return {
        "temperature": current.get("temperature_2m", 0),
        "precipitation": current.get("precipitation", 0),
        "wind_speed": current.get("wind_speed_10m", 0)
    }