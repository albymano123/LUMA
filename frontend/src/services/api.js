import axios from "axios";

// VITE_API_URL points at the API when it is hosted separately. Set it to an
// empty string when the API also serves this app (same origin); when it is
// not set at all, the local development API is used.
const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

const client = axios.create({
  baseURL: API_URL,
  // Route analysis waits on several public services; the backend
  // caps each of them, so this only guards against a hung server.
  timeout: 90000,
});


// ==================================================
// ERRORS
// ==================================================

// Turns any request failure into a message a user can act on.
export function describeApiError(error) {
  if (axios.isCancel(error)) {
    return null;
  }

  const detail = error.response?.data?.detail;

  if (detail?.message) {
    return detail.message;
  }

  if (error.response?.status === 429) {
    return "Too many requests. Please wait a moment and try again.";
  }

  if (error.response?.status === 422) {
    return "Those locations could not be read. Please choose them again from the suggestions.";
  }

  if (error.code === "ECONNABORTED") {
    return "The analysis took too long. Please try again.";
  }

  if (!error.response) {
    return "Can't reach the LumaPath server. Check that the backend is running and try again.";
  }

  return "Something went wrong while analysing routes. Please try again.";
}


// ==================================================
// SAFE ROUTE
// ==================================================

export const getSafeRoute = async (
  source,
  destination,
  mode,
  signal
) => {
  const response = await client.post(
    "/safe-route",
    {
      source_lat: source.lat,
      source_lon: source.lon,
      destination_lat: destination.lat,
      destination_lon: destination.lon,
      mode,
    },
    { signal }
  );

  return response.data;
};


// ==================================================
// PLACE SEARCH
// ==================================================

export const searchPlaces = async (query, near, signal) => {
  const response = await client.get("/geocode/search", {
    params: {
      q: query,
      lat: near?.lat,
      lon: near?.lon,
    },
    signal,
  });

  return response.data.results;
};

export const reverseGeocode = async (lat, lon) => {
  const response = await client.get("/geocode/reverse", {
    params: { lat, lon },
  });

  return response.data;
};
