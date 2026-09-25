// Sample /safe-route responses shared by the unit tests and the browser
// tests. They mimic the backend's shape; the values are test data only.

const FACTORS = [
  { key: "emergency", label: "Emergency access", score: 80, weight: 0.25, available: true, applicable: true },
  { key: "activity", label: "Street activity", score: 70, weight: 0.15, available: true, applicable: true },
  { key: "surroundings", label: "Built-up surroundings", score: 75, weight: 0.2, available: true, applicable: true },
  { key: "lighting", label: "Street lighting", score: null, weight: 0.05, available: false, applicable: true },
  { key: "road_safety", label: "Road and traffic exposure", score: 60, weight: 0.1, available: true, applicable: true },
  { key: "weather", label: "Weather", score: 100, weight: 0.25, available: true, applicable: true },
];

export function makeRoute(overrides = {}) {
  const id = overrides.id ?? "route-1";
  const offset = Number(id.split("-")[1]) * 0.002;

  return {
    id,
    name: `Route ${String.fromCharCode(64 + Number(id.split("-")[1]))}`,
    mode: "walking",
    distance_km: 4.2,
    duration_min: 50,
    geometry: {
      type: "LineString",
      coordinates: [
        [76.3371, 10.3042 + offset],
        [76.32, 10.33 + offset],
        [76.3042, 10.3717],
      ],
    },
    via_roads: ["Main Road"],
    generated_via_point: false,
    safety_score: 78,
    risk_level: "Lower risk",
    data_confidence: "high",
    factors: FACTORS,
    explanations: [
      { impact: "positive", text: "Good mapped availability of hospitals or clinics along this route (typically 450 m away)" },
      { impact: "neutral", text: "Street lighting is not mapped for most of this route, so it was not scored (unmapped does not mean unlit)" },
      { impact: "negative", text: "Longest stretch with no mapped buildings nearby is about 0.7 km" },
    ],
    categories: [],
    metrics: {},
    weather: {
      temperature: 29, apparent_temperature: 33, precipitation: 0,
      wind_speed: 8, visibility: 20000, weather_code: 1, is_day: true,
    },
    emergency_services: [
      { id: "node-1", kind: "hospital", name: "Test Hospital", phone: "+91 480 2700001", emergency_ward: true, opening_hours: "24/7", lat: 10.31, lon: 76.33, distance_m: 300, along_route_km: 1.2 },
      { id: "node-2", kind: "police", name: "Test Police Station", phone: null, emergency_ward: false, opening_hours: null, lat: 10.32, lon: 76.32, distance_m: 500, along_route_km: 2.4 },
    ],
    hospital_count: 1,
    police_station_count: 1,
    fire_station_count: 0,
    highlights: [],
    route_features: {
      route_shape: { route_km: 4.2, directness: 0.8, sharp_turns: 6, turns_per_km: 1.4 },
      road_network: {
        available: true, matched_segments: 120,
        major_road_share: 0.3, local_road_share: 0.6, pedestrian_cycle_road_share: 0.05, other_road_share: 0.05,
        sidewalk_share: 0.1, sidewalk_coverage: 0.05, sidewalk_tagged_segments: 3,
        maxspeed_mean_kmh: null, maxspeed_coverage: 0.0,
        lit_share: null, lit_coverage: 0.0, lit_tagged_segments: 0,
        paved_share: 0.9, surface_coverage: 0.5,
        junctions: 30, junctions_per_km: 7.1, dead_ends: 5, dead_ends_per_km: 1.2,
      },
      surroundings: { built_up_share: 0.7, longest_unbuilt_km: 0.7 },
      emergency: { hospital_median_m: 450, police_median_m: 600 },
      sources: {},
    },
    ml_estimate: {
      status: "not_trained",
      message: "No model has been trained. This needs a real incident or crime dataset, which has not been provided yet.",
      expected_incidents_per_km: null,
      relative_to_area_average: null,
    },
    ...overrides,
  };
}

// Route A: quickest and least safe. B: the safest. C: balanced middle.
export function makeResponse({ state = "recommended", routes } = {}) {
  const list = routes ?? [
    makeRoute({ id: "route-1", duration_min: 45, distance_km: 3.9, safety_score: 61, risk_level: "Moderate risk", categories: ["fastest"] }),
    makeRoute({ id: "route-2", duration_min: 58, distance_km: 4.6, safety_score: 84, categories: ["safest"] }),
    makeRoute({ id: "route-3", duration_min: 50, distance_km: 4.2, safety_score: 72, risk_level: "Moderate risk", categories: ["balanced"] }),
  ];

  const recommended = state === "unavailable" ? null : "route-2";

  return {
    success: true,
    mode: "walking",
    total_routes: list.length,
    routes: list,
    recommendation: {
      state,
      route_id: recommended,
      reason:
        state === "unavailable"
          ? "Safety data is currently unavailable, so no route can be recommended as safest. The quickest route is selected."
          : "Highest safety score of the 3 routes (12 points ahead of the next best).",
      default_route_id: recommended ?? "route-1",
    },
    recommended_route_id: recommended,
    recommendation_reason: null,
    default_route_id: recommended ?? "route-1",
    data_sources: { emergency_services: true, street_activity: true, road_network: true, weather: true, buildings: true },
    geo_source: { type: "local", label: "OpenStreetMap extract (Kerala, India)", date: "2026-09-23" },
    disclaimer: "Safety scores are estimates based on available open data. They are not a guarantee of safety.",
    generated_at: "2026-09-25T00:00:00Z",
  };
}
