import axios from "axios";

const BASE_URL = "https://nominatim.openstreetmap.org/search";

export async function searchLocation(place) {
  try {
    const response = await axios.get(BASE_URL, {
      params: {
        q: place,
        format: "json",
        limit: 1,
      },
      headers: {
        Accept: "application/json",
      },
    });

    return response.data;
  } catch (error) {
    console.error(error);
    return [];
  }
}