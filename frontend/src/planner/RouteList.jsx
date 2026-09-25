import { memo } from "react";
import { Clock, Route as RouteIcon, Scale, Shield, Star, Zap } from "lucide-react";

import {
  CATEGORY_LABELS,
  PREFERENCE_HELP,
  RECOMMENDATION_LABELS,
  SHORT_FACTOR_LABELS,
  formatDistance,
  formatDuration,
} from "../lib/format";
import { CONFIDENCE, riskInfo, scoreTone } from "../lib/risk";
import { Badge, ScoreRing, SegmentedControl } from "../ui";

const PREFERENCES = [
  { value: "safest", label: "Safest", icon: <Shield size={16} aria-hidden="true" /> },
  { value: "balanced", label: "Balanced", icon: <Scale size={16} aria-hidden="true" /> },
  { value: "fastest", label: "Time-efficient", icon: <Zap size={16} aria-hidden="true" /> },
];

const CATEGORY_ICONS = {
  safest: <Shield size={12} aria-hidden="true" />,
  balanced: <Scale size={12} aria-hidden="true" />,
  fastest: <Zap size={12} aria-hidden="true" />,
};

// The three factors that weigh most for this route, as compact chips.
function keyFactors(route) {
  return route.factors
    .filter((factor) => factor.applicable && factor.available)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
}

const RouteCard = memo(function RouteCard({ route, selected, recommendationLabel, onSelect }) {
  const risk = riskInfo(route.risk_level);
  const RiskIcon = risk.Icon;
  const confidence = CONFIDENCE[route.data_confidence];

  return (
    <button
      type="button"
      className="rc"
      aria-pressed={selected}
      data-selected={selected}
      data-tone={risk.tone}
      onClick={() => onSelect(route.id)}
    >
      <ScoreRing score={route.safety_score} level={route.risk_level} size={54} label={false} decorative />

      <span className="rc__main">
        <span className="rc__title">
          <span className="rc__name">{route.name}</span>

          {recommendationLabel && (
            <Badge tone="positive" icon={<Star size={11} aria-hidden="true" />}>{recommendationLabel}</Badge>
          )}

          {selected && <Badge tone="info">Selected</Badge>}

        </span>

        {route.categories.some((category) => !(recommendationLabel && category === "safest")) && (
          <span className="rc__tags">
            {route.categories
              .filter((category) => !(recommendationLabel && category === "safest"))
              .map((category) => (
                <span key={category}>{CATEGORY_ICONS[category]}{CATEGORY_LABELS[category]}</span>
              ))}
          </span>
        )}

        <span className="rc__meta">
          <span className="rc__time"><Clock size={13} aria-hidden="true" /><strong>{formatDuration(route.duration_min)}</strong></span>
          <span className="rc__dot" aria-hidden="true">·</span>
          <span className="rc__dist"><RouteIcon size={13} aria-hidden="true" />{formatDistance(route.distance_km)}</span>
          <span className="rc__dot" aria-hidden="true">·</span>
          <span className="rc__risk"><RiskIcon size={13} aria-hidden="true" />{risk.short}</span>
        </span>

        <span className="rc__factors">
          {keyFactors(route).slice(0, selected ? 3 : 2).map((factor) => (
            <span key={factor.key} className="rc__chip" data-tone={scoreTone(factor.score)}>
              <span className="rc__chip-dot" aria-hidden="true" />
              {SHORT_FACTOR_LABELS[factor.key]} <b className="tabular">{factor.score}</b>
            </span>
          ))}
          {selected && route.safety_score != null && (
            <span className="rc__conf" title={confidence?.help}>{confidence?.label}</span>
          )}
        </span>

        {selected && route.via_roads?.length > 0 && <span className="rc__via">via {route.via_roads.join(", ")}</span>}
      </span>

      <span className="sr-only">
        {route.safety_score == null ? "No safety score" : `Safety score ${route.safety_score} out of 100`}
      </span>
    </button>
  );
});

/** The Safest / Balanced / Time-efficient switch. */
export function PreferenceSwitch({ routes, preference, onSelectPreference }) {
  const options = PREFERENCES.map((option) => ({
    ...option,
    disabled: !routes.some((route) => route.categories.includes(option.value)),
  }));

  return <SegmentedControl label="Route preference" options={options} value={preference} onChange={onSelectPreference} cards />;
}

/**
 * A card for every route (and, unless the page shows it elsewhere, the
 * preference switch). Picking a preference selects the route the backend
 * tagged with it. "Selected" (what the map and details show) and
 * "Recommended" (the backend's safest pick, when it can defend one) are
 * separate ideas and are shown separately.
 */
export default function RouteList({ data, selectedId, preference, onSelectRoute, onSelectPreference, showPreference = true }) {
  const { routes, recommendation } = data;

  const labelFor = (route) =>
    route.id === recommendation?.route_id ? RECOMMENDATION_LABELS[recommendation.state] ?? null : null;

  return (
    <div className="rl">
      {showPreference && (
        <PreferenceSwitch routes={routes} preference={preference} onSelectPreference={onSelectPreference} />
      )}

      {preference && <p className="rl__help">{PREFERENCE_HELP[preference]}</p>}

      <div className="rl__cards">
        {routes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            selected={route.id === selectedId}
            recommendationLabel={labelFor(route)}
            onSelect={onSelectRoute}
          />
        ))}
      </div>
    </div>
  );
}
