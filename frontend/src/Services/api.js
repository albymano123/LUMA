import axios from "axios";

const API_URL = "http://127.0.0.1:8000";

export const getSafeRoute = async (
  sourceLat,
  sourceLon,
  destinationLat,
  destinationLon
) => {
  const response = await axios.post(
    `${API_URL}/safe-route`,
    {
      source_lat: sourceLat,
      source_lon: sourceLon,
      destination_lat: destinationLat,
      destination_lon: destinationLon,
    }
  );

  return response.data;
};