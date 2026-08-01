import axios from "axios";

export const getWeather = async (latitude, longitude) => {
  try {
    const response = await axios.get(
      "https://api.open-meteo.com/v1/forecast",
      {
        params: {
          latitude,
          longitude,
          current:
            "temperature_2m,weather_code,wind_speed_10m,precipitation",
        },
      }
    );

    return response.data.current;
  } catch (error) {
    console.error("Weather API Error:", error);
    return null;
  }
};