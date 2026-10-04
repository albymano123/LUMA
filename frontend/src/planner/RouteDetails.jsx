import {
  AlertTriangle,
  BarChart3,
  Check,
  CloudSun,
  FlaskConical,
  Hospital,
  Info,
  Layers,
  ListChecks,
  Navigation,
  Star,
} from "lucide-react";

import { CATEGORY_LABELS, RECOMMENDATION_LABELS, formatDistance, formatDuration } from "../lib/format";
import { CONFIDENCE, riskInfo } from "../lib/risk";
import { Badge, Button, Disclosure, FactorBar, Notice, ScoreRing, StatCard, Tip } from "../ui";
import EmergencyList from "./EmergencyList";
import { EnvironmentPanel, MlStatus } from "./EnvironmentPanel";
import WeatherCard from "./WeatherCard";

const EMERGENCY_RADIUS_KM = { walking: 2, cycling: 3, driving: 5 };

const REASON_ICONS = {
  positive: <Check size={16} color="var(--green-600)" aria-label="Positive" />,
  negative: <AlertTriangle size={16} color="var(--amber-500)" aria-label="Caution" />,
  neutral: <Info size={16} color="var(--faint)" aria-label="Note" />,
};

// The plain-language reasons behind the score.
function WhyThisRoute({ route }) {
  if (!route.explanations?.length) {
    return <p className="muted-text">No detailed reasons are available for this route.</p>;
  }

  return (
    <ul className="why" role="list">
      {route.explanations.map((note) => (
        <li key={note.text} className="why__item" data-impact={note.impact}>
          {REASON_ICONS[note.impact]}
          <span>{note.text}</span>
        </li>
      ))}
    </ul>
  );
}

export default function RouteDetails({
  route,
  recommendation,
  preference,
  routes,
  dataSources,
  geoSource,
  disclaimer,
  onFocusService,
  onStartNavigation,
}) {
  if (!route) return null;

  const isRecommended = recommendation?.route_id === route.id;
  const recommendedRoute = routes?.find((item) => item.id === recommendation?.route_id);
  const risk = riskInfo(route.risk_level);
  const RiskIcon = risk.Icon;
  const confidence = CONFIDENCE[route.data_confidence];
  const emergencyAvailable = dataSources?.emergency_services !== false;

  const factors = [...route.factors].sort((a, b) => Number(b.applicable) - Number(a.applicable) || b.weight - a.weight);
  const reasonCount = route.explanations?.length ?? 0;

  return (
    <article className="rd" aria-label={`Details for ${route.name}`}>
      {/* ---------- header ---------- */}
      <header className="rd__head">
        <ScoreRing score={route.safety_score} level={route.risk_level} size={92} />

        <div className="rd__headtext">
          <div className="rd__badges">
            <h2 className="rd__name">{route.name}</h2>
            {isRecommended && (
              <Badge tone="positive" size="lg" icon={<Star size={13} aria-hidden="true" />}>
                {RECOMMENDATION_LABELS[recommendation.state]}
              </Badge>
            )}
            {route.categories.map((category) => (
              <Badge key={category} outline>{CATEGORY_LABELS[category]}</Badge>
            ))}
          </div>

          <div className="rd__risk" data-tone={risk.tone}>
            <RiskIcon size={16} aria-hidden="true" />
            <span>{risk.short}</span>
          </div>

          {route.safety_score != null && confidence && (
            <Tip text={confidence.help}>
              <Badge outline tabIndex={0}>{confidence.label}</Badge>
            </Tip>
          )}

          {route.via_roads?.length > 0 && <div className="rd__via">via {route.via_roads.join(", ")}</div>}
        </div>
      </header>

      {route.safety_score == null && (
        <Notice tone="neutral" icon={<Info />} title="No safety score for this route">
          There is not enough safety data available right now to score it honestly, so no number is shown.
        </Notice>
      )}

      {/* ---------- recommendation state ---------- */}
      {isRecommended && recommendation.reason && (
        <Notice tone="positive" icon={<Star />} title={recommendation.state === "single" ? "Only route found" : "Safest recommendation"}>
          {recommendation.reason}
        </Notice>
      )}

      {!isRecommended && recommendedRoute && (
        <Notice tone="info" icon={<Info />} data-testid="not-recommended-note">
          {preference ? `You chose ${CATEGORY_LABELS[preference]}. ` : ""}
          The route with the best safety score is {recommendedRoute.name}
          {recommendedRoute.safety_score != null && ` (${recommendedRoute.safety_score}/100)`}
          {route.safety_score != null && `; this route scores ${route.safety_score}/100`}.
        </Notice>
      )}

      {/* ---------- key numbers ---------- */}
      <div className="rd__stats">
        <StatCard label="Time" value={formatDuration(route.duration_min)} />
        <StatCard label="Distance" value={formatDistance(route.distance_km)} />
        <StatCard label="Hospitals & clinics" value={emergencyAvailable ? route.hospital_count : "No data"} hint="near the route" />
        <StatCard label="Police stations" value={emergencyAvailable ? route.police_station_count : "No data"} hint="near the route" />
      </div>

      {onStartNavigation && (
        <Button block icon={<Navigation size={17} aria-hidden="true" />} onClick={onStartNavigation}>
          Start navigation
        </Button>
      )}

      {/* ---------- explanations ---------- */}
      <Disclosure title="Why this route?" icon={<ListChecks size={18} aria-hidden="true" />} badge={<Badge outline>{reasonCount}</Badge>} defaultOpen>
        <WhyThisRoute route={route} />
      </Disclosure>

      <Disclosure title="Safety score breakdown" icon={<BarChart3 size={18} aria-hidden="true" />} defaultOpen>
        <div className="rd__factors">
          {factors.map((factor) => <FactorBar key={factor.key} factor={factor} />)}
        </div>
        <p className="muted-text" style={{ marginTop: "var(--s-3)" }}>
          Factors without data are left out and lower the confidence; they are never counted as zero.
        </p>
      </Disclosure>

      <Disclosure title="Nearby emergency services" icon={<Hospital size={18} aria-hidden="true" />} defaultOpen>
        <EmergencyList
          services={route.emergency_services}
          available={emergencyAvailable}
          radiusKm={EMERGENCY_RADIUS_KM[route.mode] ?? 2}
          onFocus={onFocusService}
        />
      </Disclosure>

      <Disclosure title="Weather" icon={<CloudSun size={18} aria-hidden="true" />} defaultOpen>
        <WeatherCard weather={route.weather} />
      </Disclosure>

      <Disclosure title="Route environment" icon={<Layers size={18} aria-hidden="true" />}>
        <EnvironmentPanel route={route} />
      </Disclosure>

      <Disclosure title="Experimental ML estimate" icon={<FlaskConical size={18} aria-hidden="true" />}>
        <MlStatus estimate={route.ml_estimate} />
      </Disclosure>

      <footer className="rd__foot">
        {geoSource && (
          <p>
            Map data: {geoSource.label}
            {geoSource.date ? `, extract dated ${geoSource.date}` : ""} (&copy; OpenStreetMap contributors).
          </p>
        )}
        {disclaimer && <p>{disclaimer}</p>}
      </footer>
    </article>
  );
}
