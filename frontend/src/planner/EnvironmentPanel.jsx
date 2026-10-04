import { formatMetres } from "../lib/format";

const percent = (share) => (share == null ? null : `${Math.round(share * 100)}%`);

// Missing map data is shown as "Not mapped", never as zero.
const NOT_MAPPED = "Not mapped";

// Tag-based values are only shown when enough of the route carries the
// tag (mirrors the backend rule); otherwise the map is simply silent.
const MIN_COVERAGE = 0.3;

const tagged = (value, coverage, format) =>
  value == null || coverage == null || coverage < MIN_COVERAGE ? NOT_MAPPED : format(value);

function rowsFor(features) {
  const shape = features.route_shape ?? {};
  const road = features.road_network ?? {};
  const surroundings = features.surroundings ?? {};
  const emergency = features.emergency ?? {};
  const rows = [];

  if (surroundings.built_up_share != null) {
    rows.push(
      ["Buildings close to the route", percent(surroundings.built_up_share)],
      ["Longest stretch without buildings", surroundings.longest_unbuilt_km >= 0.1 ? `${surroundings.longest_unbuilt_km} km` : "None over 100 m"],
    );
  }

  if (road.available) {
    rows.push(
      ["Main roads", percent(road.major_road_share) ?? NOT_MAPPED],
      ["Local streets", percent(road.local_road_share) ?? NOT_MAPPED],
      ["Footpaths and cycle paths", percent(road.pedestrian_cycle_road_share) ?? NOT_MAPPED],
      ["Streets with sidewalks", tagged(road.sidewalk_share, road.sidewalk_coverage, percent)],
      ["Speed limit (average)", tagged(road.maxspeed_mean_kmh, road.maxspeed_coverage, (v) => `${Math.round(v)} km/h`)],
      ["Street lighting mapped as lit", tagged(road.lit_share, road.lit_coverage, percent)],
      ["Paved surface", tagged(road.paved_share, road.surface_coverage, percent)],
      ["Junctions", `${road.junctions} (${road.junctions_per_km} per km)`],
      ["Dead-end streets nearby", `${road.dead_ends} (${road.dead_ends_per_km} per km)`],
    );
  }

  if (shape.turns_per_km != null) {
    rows.push(
      ["Sharp turns", `${shape.sharp_turns} (${shape.turns_per_km} per km)`],
      ["Directness", `${Math.round(shape.directness * 100)}% of a straight line`],
    );
  }

  if (emergency.hospital_median_m != null) {
    rows.push(["Typical distance to a hospital or clinic", formatMetres(emergency.hospital_median_m)]);
  }

  if (emergency.police_median_m != null) {
    rows.push(["Typical distance to a police station", formatMetres(emergency.police_median_m)]);
  }

  return rows;
}

/** Plain OpenStreetMap facts about the route: what the map says, not crime data. */
export function EnvironmentPanel({ route }) {
  const features = route.route_features;

  if (!features) return null;

  const rows = rowsFor(features);
  const roadAvailable = Boolean(features.road_network?.available);

  return (
    <div>
      <p className="muted-text" style={{ marginBottom: "var(--s-3)" }}>
        What OpenStreetMap says about this route. These are map facts, not crime or incident data, and
        &ldquo;Not mapped&rdquo; means nobody has added that detail to the map, not that it is absent.
      </p>

      {!roadAvailable && (
        <p className="muted-text" style={{ marginBottom: "var(--s-2)" }}>
          Road details could not be loaded for this route right now.
        </p>
      )}

      <dl className="env">
        {rows.map(([label, value]) => (
          <div key={label} className="env__row">
            <dt>{label}</dt>
            <dd data-missing={value === NOT_MAPPED}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Legacy, separate incident-rate experiment (ml/predict_model.py). Kept for
 * anyone who still renders it directly; the main route panel now shows
 * MlRiskStatus instead (see below) - this one stays "not_trained" until a
 * real India/Kerala incident dataset exists, which it still does not. */
export function MlStatus({ estimate }) {
  return (
    <div>
      {estimate?.status === "ready" ? (
        <p>
          About {estimate.expected_incidents_per_km} recorded incidents per km
          {estimate.relative_to_area_average != null &&
            ` (${estimate.relative_to_area_average}× the ${estimate.trained_on?.area || "training area"} average)`}
          .
        </p>
      ) : (
        <p>Not available: {estimate?.message ?? "no model is trained."}</p>
      )}

      <p className="muted-text" style={{ marginTop: "var(--s-2)" }}>
        An experiment, shown for comparison only. It never ranks or recommends routes; the safety
        assessment is the rule-based score. It can only be trained on real historical incident records.
      </p>
    </div>
  );
}

// Real features the AI/ML risk model actually uses (ml/risk_features.py),
// in plain language, for "what influenced this estimate" explanations.
const ML_FEATURE_LABELS = {
  major_road: "being on a major road",
  speed_limit_kmh: "the speed limit",
  at_junction: "being near a junction",
  daylight: "daylight",
  dark_lit: "lit darkness",
  dark_unlit: "unlit darkness",
  raining: "rain",
  snowing: "snow",
  high_wind: "high wind",
  fog_or_poor_visibility: "fog or poor visibility",
  urban: "being in a built-up area",
  is_cyclist: "travelling by bicycle",
  hour_sin: "time of day",
  hour_cos: "time of day",
  is_weekend: "being a weekend",
};

const ML_STATUS_REASON = {
  not_trained: "No AI/ML risk model is available yet.",
  not_validated: "A model exists but did not pass validation, so its output is not used.",
  unsupported_mode: "This model is trained on real pedestrian and cyclist records, so it only applies to walking and cycling routes.",
  unavailable: "Not enough road data was available to assess this route.",
};

/**
 * The CURRENT AI/ML system (ml/risk_model.py): a model trained on real UK
 * DfT STATS19 pedestrian/cyclist collision records (no India/Kerala-
 * specific collision dataset is publicly available) estimates how severe
 * collisions tend to be in conditions like this route's, and contributes,
 * boundedly, to which route is tagged safest/balanced alongside the
 * rule-based score above - never instead of it.
 */
export function MlRiskStatus({ route }) {
  const risk = route.ml_risk_assessment;
  const ready = risk?.status === "ready";
  const rankingScore = route.ranking_score;
  const safetyScore = route.safety_score;
  const nudged = ready && rankingScore != null && safetyScore != null && Math.round(rankingScore) !== safetyScore;

  return (
    <div>
      {ready ? (
        <>
          <p>
            <strong>{risk.risk_label}.</strong> An estimated {Math.round(risk.predicted_severe_share * 100)}%
            share of severe outcomes in real-world conditions like this route&rsquo;s (road type, speed
            limit, junctions, lighting, weather, time of day).
          </p>

          {risk.top_factors?.length > 0 && (
            <p className="muted-text" style={{ marginTop: "var(--s-2)" }}>
              Most influenced by {risk.top_factors.map((factor) => ML_FEATURE_LABELS[factor.feature] ?? factor.feature).join(", ")}.
            </p>
          )}

          <p style={{ marginTop: "var(--s-2)" }}>
            {nudged
              ? `This contributed to route ranking: the rule-based score of ${safetyScore} became a ranking score of ${Math.round(rankingScore)} for this route.`
              : "This route's ranking score matched its rule-based score; the model's view did not move it."}
          </p>
        </>
      ) : (
        <p>{ML_STATUS_REASON[risk?.status] ?? "Not available."}</p>
      )}

      <p className="muted-text" style={{ marginTop: "var(--s-2)" }}>
        A contextual risk signal, not a prediction that a collision will occur at any specific place,
        and not a promise that this route is safe. The rule-based score above remains the primary,
        explainable safety assessment; this model only ever nudges which route is tagged safest/
        balanced, by at most 25%, and never on its own.
      </p>
    </div>
  );
}
