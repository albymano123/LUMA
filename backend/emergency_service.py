import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


async def get_nearby_emergency_services(
    latitude: float,
    longitude: float,
    radius: int = 2000
):
    query = f"""
    [out:json][timeout:15];
    (
      node["amenity"="hospital"](around:{radius},{latitude},{longitude});
      way["amenity"="hospital"](around:{radius},{latitude},{longitude});

      node["amenity"="police"](around:{radius},{latitude},{longitude});
      way["amenity"="police"](around:{radius},{latitude},{longitude});
    );
    out center;
    """

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            OVERPASS_URL,
            content=query,
            headers={"Content-Type": "text/plain"}
        )

        response.raise_for_status()
        data = response.json()

    elements = data.get("elements", [])

    hospitals = 0
    police_stations = 0

    for element in elements:
        amenity = element.get("tags", {}).get("amenity")

        if amenity == "hospital":
            hospitals += 1

        elif amenity == "police":
            police_stations += 1

    return {
        "hospitals": hospitals,
        "police_stations": police_stations
    }