import { useState } from "react";
import { AlertTriangle, Flag, LocateFixed, MapPinOff, X } from "lucide-react";

import MapView from "../../map/MapView";
import { formatDistance, formatDuration } from "../../lib/format";
import { DEFAULT_INSTRUCTION_ICON, MODIFIER_ICON, TYPE_ICON, instructionText } from "../../lib/maneuvers";
import { riskInfo } from "../../lib/risk";
import { Button, IconButton, Notice } from "../../ui";

// Phones: the map fills most of the screen, top/bottom bars stay compact.
// Desktop: the same bars, a little roomier, over a full-size map.
const NAV_PADDING = { top: 140, right: 48, bottom: 180, left: 48 };

function LocationNotice({ status, error }) {
  if (status === "denied") {
    return (
      <Notice tone="danger" role="alert" icon={<MapPinOff />} title="Location access needed">
        {error} Your route and progress are shown below, but your live position can't be tracked without it.
      </Notice>
    );
  }

  if (status === "unsupported") {
    return (
      <Notice tone="danger" icon={<MapPinOff />} title="Location isn't available">
        {error}
      </Notice>
    );
  }

  if (status === "unavailable") {
    return (
      <Notice tone="warning" icon={<AlertTriangle />} title="Waiting for a GPS signal">
        {error}
      </Notice>
    );
  }

  return null;
}

function DeviationNotice({ deviation, rerouting, rerouteError, onDismiss }) {
  if (rerouting) {
    return (
      <Notice tone="info" icon={<span className="lp-btn__spinner" aria-hidden="true" />} title="Recalculating your route">
        You've moved off the route. Finding a new safety-aware route from your location.
      </Notice>
    );
  }

  if (rerouteError) {
    return (
      <Notice
        tone="warning"
        icon={<AlertTriangle />}
        title="Couldn't recalculate"
        action={<Button size="sm" variant="secondary" onClick={onDismiss}>Dismiss</Button>}
      >
        {rerouteError} Keeping your current route.
      </Notice>
    );
  }

  if (deviation === "deviating") {
    return (
      <Notice tone="warning" icon={<AlertTriangle />} title="You seem to be off the route">
        Keep moving - LumaPath will recalculate if this continues.
      </Notice>
    );
  }

  return null;
}

function ArrivalOverlay({ route, onEnd }) {
  const risk = riskInfo(route?.risk_level);

  return (
    <div className="nav__arrival" role="dialog" aria-modal="true" aria-label="Arrived at destination">
      <div className="nav__arrival-card lp-glass">
        <Flag size={28} aria-hidden="true" />
        <h2>You've arrived</h2>
        <p>
          {route?.safety_score != null
            ? `This trip's safety-aware route scored ${route.safety_score}/100 (${risk.short}).`
            : "Navigation has ended."}
        </p>
        <div className="nav__arrival-actions">
          <Button variant="secondary" onClick={onEnd}>View route summary</Button>
          <Button onClick={onEnd}>End navigation</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Live, turn-by-turn-style navigation over the existing planner: the same
 * route data, the same safety/AI-ML analysis, the same map - just a
 * focused layout for following it with real GPS tracking. Rendered by
 * MapPage instead of its normal panel/sheet while navigation is active;
 * ending it (End navigation / View route summary) returns to exactly
 * that existing view, unchanged.
 */
export default function NavigationView({ nav, destination, isPhone, onEnd }) {
  const [follow, setFollow] = useState(true);
  const [recenterSignal, setRecenterSignal] = useState(0);

  const { route, progress, instruction, position, heading, accuracy, locationStatus, locationError, deviation, rerouting, rerouteError, arrived } = nav;

  const risk = riskInfo(route?.risk_level);
  const RiskIcon = risk.Icon;

  const liveLocation = position ? { lat: position.lat, lon: position.lon, heading } : null;
  const step = instruction?.step;
  const InstructionIcon = (step && (TYPE_ICON[step.type] || MODIFIER_ICON[step.modifier])) || DEFAULT_INSTRUCTION_ICON;

  const recenter = () => {
    setFollow(true);
    setRecenterSignal((value) => value + 1);
  };

  return (
    <div className="nav" data-phone={isPhone}>
      {/* ---------- top: next instruction ---------- */}
      <div className="nav__top lp-glass">
        {arrived ? (
          <div className="nav__instruction">
            <Flag size={22} aria-hidden="true" />
            <span className="nav__instruction-text">You've arrived</span>
          </div>
        ) : step ? (
          <div className="nav__instruction">
            <InstructionIcon size={22} aria-hidden="true" />
            <span className="nav__instruction-text">{instructionText(step)}</span>
            {instruction.distanceToManeuverM > 0 && (
              <span className="nav__instruction-dist tabular">{formatDistance(instruction.distanceToManeuverM / 1000)}</span>
            )}
          </div>
        ) : (
          <div className="nav__instruction">
            <InstructionIcon size={22} aria-hidden="true" />
            <span className="nav__instruction-text">Follow the route</span>
          </div>
        )}
      </div>

      {/* ---------- centre: map ---------- */}
      <div className="nav__map">
        <MapView
          source={null}
          destination={destination}
          routes={route ? [route] : []}
          selectedRouteId={route?.id ?? null}
          recommendedRouteId={null}
          onSelectRoute={() => {}}
          focusService={null}
          layers={{ emergency: false, weather: false, factors: false }}
          loading={false}
          padding={NAV_PADDING}
          liveLocation={liveLocation}
          followLocation={follow}
          onUserPanned={() => setFollow(false)}
          recenterSignal={recenterSignal}
        />

        <div className="nav__banners">
          <LocationNotice status={locationStatus} error={locationError} />
          <DeviationNotice
            deviation={deviation}
            rerouting={rerouting}
            rerouteError={rerouteError}
            onDismiss={nav.dismissRerouteError}
          />
        </div>

        {!follow && !arrived && (
          <IconButton
            label="Re-centre on your location"
            className="nav__recenter"
            onClick={recenter}
          >
            <LocateFixed size={20} aria-hidden="true" />
          </IconButton>
        )}

        {arrived && <ArrivalOverlay route={route} onEnd={onEnd} />}
      </div>

      {/* ---------- bottom: trip stats ---------- */}
      <div className="nav__bottom lp-glass">
        <div className="nav__stats">
          <div className="nav__stat">
            <span className="nav__stat-value tabular">{formatDistance(progress.remainingKm)}</span>
            <span className="nav__stat-label">Remaining</span>
          </div>
          <div className="nav__stat">
            <span className="nav__stat-value tabular">{formatDuration(progress.etaMin)}</span>
            <span className="nav__stat-label">ETA</span>
          </div>
          <div className="nav__stat">
            <span className="nav__stat-value tabular">{Math.round(progress.percent)}%</span>
            <span className="nav__stat-label">Progress</span>
          </div>
        </div>

        <div className="nav__progress" role="progressbar" aria-valuenow={Math.round(progress.percent)} aria-valuemin={0} aria-valuemax={100} aria-label="Route progress">
          <div className="nav__progress-fill" style={{ width: `${Math.max(2, progress.percent)}%` }} />
        </div>

        <div className="nav__footer">
          <div className="nav__safety" data-tone={risk.tone}>
            <RiskIcon size={15} aria-hidden="true" />
            <span>Safety-aware route &middot; {risk.short}</span>
            {accuracy != null && <span className="nav__gps tabular">&middot; GPS &plusmn;{Math.round(accuracy)} m</span>}
          </div>

          <Button variant="danger" size="sm" icon={<X size={15} aria-hidden="true" />} onClick={onEnd}>
            End navigation
          </Button>
        </div>
      </div>
    </div>
  );
}
