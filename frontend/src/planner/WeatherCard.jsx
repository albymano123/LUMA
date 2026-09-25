import { Droplets, Eye, Thermometer, Wind } from "lucide-react";

import WeatherVisual from "../components/WeatherVisual";
import { describeWeather } from "../lib/weather";

function Fact({ icon, label, value }) {
  return (
    <div className="wc__fact">
      <span className="wc__fact-label">{icon}{label}</span>
      <span className="wc__fact-value tabular">{value}</span>
    </div>
  );
}

const rounded = (value, unit) => (value == null ? "–" : `${Math.round(value)}${unit}`);

/**
 * Current conditions along the route (the readings the backend used for the
 * score). Missing data is stated, never filled in.
 */
export default function WeatherCard({ weather, compact = false }) {
  if (!weather) {
    return (
      <p className="muted-text">
        Weather data is unavailable for this route right now, so it was not part of the score.
      </p>
    );
  }

  const condition = describeWeather(weather.weather_code, weather.is_day);
  const visibilityKm = weather.visibility == null ? null : weather.visibility / 1000;

  return (
    <div className={`wc ${compact ? "wc--compact" : ""}`}>
      <div className="wc__main">
        <WeatherVisual kind={condition.kind} night={!weather.is_day} size={compact ? 44 : 68} />

        <div>
          <div className="wc__temp tabular">{rounded(weather.temperature, "°")}</div>
          <div className="wc__label">{condition.label}</div>
        </div>
      </div>

      {!compact && (
        <div className="wc__facts">
          <Fact icon={<Thermometer size={14} aria-hidden="true" />} label="Feels like" value={rounded(weather.apparent_temperature, "°")} />
          <Fact icon={<Droplets size={14} aria-hidden="true" />} label="Rain" value={weather.precipitation == null ? "–" : `${weather.precipitation} mm`} />
          <Fact icon={<Wind size={14} aria-hidden="true" />} label="Wind" value={rounded(weather.wind_speed, " km/h")} />
          <Fact icon={<Eye size={14} aria-hidden="true" />} label="Visibility" value={visibilityKm == null ? "–" : `${visibilityKm >= 10 ? Math.round(visibilityKm) : visibilityKm.toFixed(1)} km`} />
        </div>
      )}
    </div>
  );
}
