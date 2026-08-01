const getWeatherCondition = (code) => {
  if (code === 0) return "☀️ Clear Sky";

  if (code === 1 || code === 2) {
    return "🌤️ Partly Cloudy";
  }

  if (code === 3) {
    return "☁️ Cloudy";
  }

  if (code === 45 || code === 48) {
    return "🌫️ Fog";
  }

  if (code >= 51 && code <= 57) {
    return "🌦️ Drizzle";
  }

  if (code >= 61 && code <= 67) {
    return "🌧️ Rain";
  }

  if (code >= 71 && code <= 77) {
    return "❄️ Snow";
  }

  if (code >= 80 && code <= 82) {
    return "🌧️ Rain Showers";
  }

  if (code >= 95) {
    return "⛈️ Thunderstorm";
  }

  return "Unknown";
};

function WeatherInfo({ weather }) {
  if (!weather) {
    return null;
  }

  return (
    <div
      style={{
        maxWidth: "600px",
        margin: "20px auto",
        padding: "20px",
        borderRadius: "10px",
        backgroundColor: "#f5f5f5",
        textAlign: "center",
      }}
    >
      <h2>🌦️ Weather Conditions</h2>

      <p>
        🌡️ <strong>Temperature:</strong>{" "}
        {weather.temperature_2m} °C
      </p>

      <p>
        <strong>Condition:</strong>{" "}
        {getWeatherCondition(weather.weather_code)}
      </p>

      <p>
        🌧️ <strong>Precipitation:</strong>{" "}
        {weather.precipitation} mm
      </p>

      <p>
        💨 <strong>Wind Speed:</strong>{" "}
        {weather.wind_speed_10m} km/h
      </p>
    </div>
  );
}

export default WeatherInfo;