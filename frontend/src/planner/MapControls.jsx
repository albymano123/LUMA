import { CloudSun, Hospital, Layers } from "lucide-react";

import WeatherCard from "./WeatherCard";

const LAYERS = [
  { key: "emergency", label: "Emergency services", icon: <Hospital size={16} aria-hidden="true" /> },
  { key: "weather", label: "Weather", icon: <CloudSun size={16} aria-hidden="true" /> },
  { key: "factors", label: "Safety factors", icon: <Layers size={16} aria-hidden="true" /> },
];

/** Toggles for what the map shows. Each is a real toggle button (aria-pressed). */
export function LayerControl({ layers, onToggle }) {
  return (
    <div className="lc lp-glass" role="group" aria-label="Map layers">
      {LAYERS.map((layer) => (
        <button
          key={layer.key}
          type="button"
          className="lc__btn"
          aria-pressed={layers[layer.key]}
          onClick={() => onToggle(layer.key)}
        >
          {layer.icon}
          <span>{layer.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The weather layer: current conditions for the selected route, over the map. */
export function WeatherChip({ route }) {
  return (
    <div className="wchip lp-glass" role="region" aria-label="Weather on this route">
      <WeatherCard weather={route.weather} compact />
    </div>
  );
}

/** Explains what the "Safety factors" layer is showing (only what was measured). */
export function FactorsLegend({ route }) {
  const stretches = route.highlights ?? [];

  return (
    <div className="flegend lp-glass" role="region" aria-label="Safety factors layer">
      <span className="flegend__swatch" aria-hidden="true" />
      <span>
        {stretches.length === 0
          ? "No long stretches without mapped buildings on this route."
          : `${stretches.length} stretch${stretches.length === 1 ? "" : "es"} with no mapped buildings nearby`}
      </span>
    </div>
  );
}
