import { Box, Stack, Typography } from "@mui/material";

// WMO weather codes (Open-Meteo) → readable condition.
const getWeatherCondition = (code) => {
  if (code === 0) return "☀️ Clear sky";

  if (code === 1 || code === 2) {
    return "🌤️ Partly cloudy";
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
    return "🌧️ Rain showers";
  }

  if (code >= 95) {
    return "⛈️ Thunderstorm";
  }

  return "Unknown";
};

function Stat({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}

function WeatherInfo({ weather }) {
  if (!weather) {
    return (
      <Typography variant="body2" color="text.secondary">
        Weather information is unavailable right now.
      </Typography>
    );
  }

  const show = (value, unit) => (value == null ? "–" : `${value}${unit}`);

  return (
    <Box>
      <Typography sx={{ fontWeight: 600, mb: 1.5 }}>
        {getWeatherCondition(weather.weather_code)}
        <Typography component="span" color="text.secondary" sx={{ ml: 1, fontSize: 14 }}>
          {weather.is_day ? "Daytime" : "After dark"}
        </Typography>
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
          gap: 1.5,
        }}
      >
        <Stat label="Temperature" value={show(weather.temperature, " °C")} />
        <Stat label="Feels like" value={show(weather.apparent_temperature, " °C")} />
        <Stat label="Precipitation" value={show(weather.precipitation, " mm")} />
        <Stat label="Wind" value={show(weather.wind_speed, " km/h")} />
        <Stat
          label="Visibility"
          value={
            weather.visibility == null
              ? "–"
              : `${(weather.visibility / 1000).toFixed(weather.visibility < 10000 ? 1 : 0)} km`
          }
        />
      </Box>

      <Stack sx={{ mt: 1.5 }}>
        <Typography variant="caption" color="text.secondary">
          Current conditions along the route, from Open-Meteo.
        </Typography>
      </Stack>
    </Box>
  );
}

export default WeatherInfo;
