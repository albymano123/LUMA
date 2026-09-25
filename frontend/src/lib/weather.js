// WMO weather codes (as returned by Open-Meteo) -> a label and the kind of
// small animation to show. Nothing is invented: unknown codes are reported
// as such.
export function describeWeather(code, isDay = true) {
  if (code == null) return { label: "Conditions unavailable", kind: "unknown" };

  if (code === 0) return { label: isDay ? "Clear sky" : "Clear night", kind: "clear" };
  if (code <= 2) return { label: "Partly cloudy", kind: "partly" };
  if (code === 3) return { label: "Overcast", kind: "cloudy" };
  if (code === 45 || code === 48) return { label: "Fog", kind: "fog" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", kind: "drizzle" };
  if (code >= 61 && code <= 67) return { label: "Rain", kind: "rain" };
  if (code >= 71 && code <= 77) return { label: "Snow", kind: "snow" };
  if (code >= 80 && code <= 82) return { label: "Rain showers", kind: "rain" };
  if (code >= 85 && code <= 86) return { label: "Snow showers", kind: "snow" };
  if (code >= 95) return { label: "Thunderstorm", kind: "storm" };

  return { label: "Mixed conditions", kind: "cloudy" };
}
