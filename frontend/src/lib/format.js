export function formatDuration(minutes) {
  if (minutes == null) {
    return "–";
  }

  const rounded = Math.max(1, Math.round(minutes));

  if (rounded < 60) {
    return `${rounded} min`;
  }

  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;

  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function formatDistance(km) {
  if (km == null) {
    return "–";
  }

  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }

  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function formatMetres(metres) {
  if (metres == null) {
    return "–";
  }

  if (metres < 1000) {
    return `${Math.round(metres / 10) * 10} m`;
  }

  return `${(metres / 1000).toFixed(1)} km`;
}

// Risk levels arrive worded by the backend ("Lower risk", "Insufficient
// data"); shown as-is so every screen uses the same words.
export function formatRiskLevel(level) {
  return level || "Insufficient data";
}

export const CATEGORY_LABELS = {
  safest: "Safest",
  balanced: "Balanced",
  fastest: "Time-efficient",
};

export const CONFIDENCE_LABELS = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export const CONFIDENCE_HELP = {
  high: "All the main safety data sources were available for this route.",
  medium: "Some safety data was unavailable, so the score is based on fewer factors.",
  low: "Much of the safety data was unavailable. Treat this score with caution.",
};

// What the backend's recommendation state means for the "Recommended" tag.
// "unavailable" has no entry on purpose: nothing is labelled recommended.
export const RECOMMENDATION_LABELS = {
  recommended: "Recommended",
  tie: "Recommended",
  close: "Recommended",
  single: "Only route found",
};

export const DATA_SOURCE_LABELS = {
  emergency_services: "emergency services",
  street_activity: "street activity",
  road_network: "road details and lighting",
  buildings: "building data",
  weather: "weather",
};

// Opening hours are shown exactly as mapped in OpenStreetMap. "24/7" reads
// better as words; anything else is left untouched (never reinterpreted).
export function formatHours(hours) {
  if (!hours) return null;
  return hours.trim() === "24/7" ? "Open 24 hours" : hours.trim();
}

export const SHORT_FACTOR_LABELS = {
  emergency: "Emergency",
  activity: "Activity",
  surroundings: "Built-up",
  lighting: "Lighting",
  road_safety: "Road",
  weather: "Weather",
};

export const PREFERENCE_HELP = {
  safest: "Highest safety score. Scores within 2 points count as equal, and the quicker route wins.",
  balanced: "Balances safety (50%), time (30%) and distance (20%).",
  fastest: "The quickest route. Its safety information is still shown.",
};
