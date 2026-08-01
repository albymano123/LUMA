import axios from "axios";

// Multiple Overpass servers.
// If one server fails, LumaPath tries the next one.
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export const searchNearbyEmergencyServices = async (
  latitude,
  longitude
) => {
  const query = `
    [out:json][timeout:20];
    (
      node["amenity"="hospital"](around:5000,${latitude},${longitude});
      way["amenity"="hospital"](around:5000,${latitude},${longitude});
      relation["amenity"="hospital"](around:5000,${latitude},${longitude});

      node["amenity"="police"](around:5000,${latitude},${longitude});
      way["amenity"="police"](around:5000,${latitude},${longitude});
      relation["amenity"="police"](around:5000,${latitude},${longitude});
    );
    out center;
  `;

  for (const url of OVERPASS_URLS) {
    try {
      console.log("Trying Overpass server:", url);

      const response = await axios.post(
        url,
        query,
        {
          headers: {
            "Content-Type": "text/plain",
          },

          timeout: 25000,
        }
      );

      const elements =
        response.data.elements || [];

      const hospitals = elements.filter(
        (item) =>
          item.tags?.amenity === "hospital"
      );

      const policeStations =
        elements.filter(
          (item) =>
            item.tags?.amenity === "police"
        );

      console.log(
        "Emergency services loaded successfully."
      );

      return {
        success: true,
        hospitals,
        policeStations,
      };
    } catch (error) {
      console.warn(
        "Overpass server failed:",
        url
      );
    }
  }

  console.error(
    "All Overpass servers failed."
  );

  return {
    success: false,
    hospitals: null,
    policeStations: null,
  };
};