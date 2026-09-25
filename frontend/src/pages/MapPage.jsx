import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, Compass, Info, Pencil, RefreshCw, ShieldCheck } from "lucide-react";

import Navbar from "../layout/Navbar";
import MapView from "../map/MapView";
import { DATA_SOURCE_LABELS } from "../lib/format";
import { useIsPhone } from "../lib/hooks";
import { riskInfo } from "../lib/risk";
import AnalysisProgress from "../planner/AnalysisProgress";
import BottomSheet from "../planner/BottomSheet";
import { FactorsLegend, LayerControl, WeatherChip } from "../planner/MapControls";
import RouteDetails from "../planner/RouteDetails";
import RouteForm from "../planner/RouteForm";
import RouteList, { PreferenceSwitch } from "../planner/RouteList";
import { describeApiError, getSafeRoute } from "../services/api";
import { Button, EmptyState, Notice } from "../ui";
import "../planner/planner.css";

const PANEL_WIDTH = 408;

const EMPTY_PROGRESS = {};

function MissingDataNotice({ dataSources }) {
  const missing = Object.entries(dataSources || {})
    .filter(([, available]) => !available)
    .map(([key]) => DATA_SOURCE_LABELS[key] || key);

  if (!missing.length) return null;

  return (
    <Notice tone="warning" icon={<AlertTriangle />} title="Some safety data is temporarily unavailable">
      Couldn't load: {missing.join(", ")}. Scores use the data that was available and show lower confidence.
    </Notice>
  );
}

// Shown when no route can honestly be called the safest.
function NoRecommendationNotice({ recommendation }) {
  if (!recommendation || recommendation.state !== "unavailable") return null;

  return (
    <Notice tone="info" icon={<Info />} title="No route is recommended" data-testid="no-recommendation">
      {recommendation.reason}
    </Notice>
  );
}

function IdleState() {
  return (
    <EmptyState icon={<Compass size={26} aria-hidden="true" />} title="Plan a safer journey">
      Enter a start and destination. LumaPath compares up to five routes and explains how each one scores on
      emergency access, street activity, buildings, lighting, road exposure and weather.
    </EmptyState>
  );
}

function ErrorState({ error, onRetry }) {
  return (
    <Notice
      tone="danger"
      role="alert"
      icon={<AlertTriangle />}
      title={error.title}
      action={onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry} icon={<RefreshCw size={14} aria-hidden="true" />}>
          Retry
        </Button>
      )}
    >
      {error.message}
    </Notice>
  );
}

// The navigation app: search, compare routes, inspect one.
export default function MapPage() {
  const isPhone = useIsPhone();

  const [source, setSource] = useState(null);
  const [destination, setDestination] = useState(null);
  const [mode, setMode] = useState("walking");

  // idle | loading | success | error
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  // What the user asked for (safest / balanced / fastest), kept separately
  // from the route because one route can hold several tags.
  const [preference, setPreference] = useState(null);
  const [focusService, setFocusService] = useState(null);
  const [layers, setLayers] = useState({ emergency: true, weather: false, factors: false });
  const [sheetSnap, setSheetSnap] = useState("half");
  const [editing, setEditing] = useState(false);

  const requestRef = useRef(null);


  // ==================================================
  // ANALYSE ROUTES
  // ==================================================

  const analyse = useCallback(async (from, to, travelMode) => {
    // A newer request replaces any in flight, and old results never stay on
    // screen for a different trip.
    requestRef.current?.abort();
    setData(null);
    setSelectedId(null);
    setPreference(null);
    setFocusService(null);
    setProgress(EMPTY_PROGRESS);
    setEditing(false);

    if (!from || !to) {
      requestRef.current = null;
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;

    setStatus("loading");
    setError(null);
    setSheetSnap("half");

    try {
      const result = await getSafeRoute(from, to, travelMode, {
        signal: controller.signal,
        onProgress: (event) => {
          if (!controller.signal.aborted) setProgress((current) => ({ ...current, [event.event]: event }));
        },
      });

      if (controller.signal.aborted) return;

      if (!result.routes?.length) {
        setError({ title: "No route found", message: "No route could be found between these places for this travel mode. Try another mode, or pick a point on a nearby road." });
        setStatus("error");
        return;
      }

      setData(result);
      setSelectedId(result.default_route_id ?? result.routes[0].id);
      // The first selection is the recommended (safest) route, or the
      // quickest when nothing can be recommended; show that as the choice.
      setPreference(result.recommended_route_id ? "safest" : "fastest");
      setStatus("success");
    } catch (failure) {
      if (controller.signal.aborted) return;

      const described = describeApiError(failure);

      if (described) {
        setError(described);
        setStatus("error");
      }
    }
  }, []);

  const changeSource = (place) => { setSource(place); analyse(place, destination, mode); };
  const changeDestination = (place) => { setDestination(place); analyse(source, place, mode); };
  const changeMode = (value) => { setMode(value); analyse(source, destination, value); };
  const swap = () => { setSource(destination); setDestination(source); analyse(destination, source, mode); };
  const retry = () => analyse(source, destination, mode);

  const routes = data?.routes;
  const selected = routes?.find((route) => route.id === selectedId);
  const recommendedId = data?.recommended_route_id ?? null;

  const chooseRoute = useCallback((routeId) => {
    setSelectedId(routeId);

    // Tapping a route keeps the preference only if it still fits.
    setPreference((current) => {
      const route = routes?.find((item) => item.id === routeId);
      return route?.categories.includes(current) ? current : null;
    });
  }, [routes]);

  const choosePreference = (category) => {
    const route = routes?.find((item) => item.categories.includes(category));

    if (route) {
      setSelectedId(route.id);
      setPreference(category);
    }
  };

  const toggleLayer = (key) => setLayers((current) => ({ ...current, [key]: !current[key] }));


  // ==================================================
  // LAYOUT
  // ==================================================

  // Keep the routes clear of the floating UI when the map fits them.
  const padding = useMemo(
    () => (isPhone ? { top: 210, right: 28, bottom: 200, left: 28 } : { top: 60, right: 72, bottom: 60, left: PANEL_WIDTH + 56 }),
    [isPhone]
  );

  const showTripSummary = isPhone && status === "success" && !editing;

  const form = (
    <RouteForm
      source={source}
      setSource={changeSource}
      destination={destination}
      setDestination={changeDestination}
      onSwap={swap}
      mode={mode}
      setMode={changeMode}
      onSubmit={retry}
      loading={status === "loading"}
    />
  );

  const results = (
    <>
      {status === "idle" && <IdleState />}
      {status === "loading" && <AnalysisProgress progress={progress} />}
      {status === "error" && error && <ErrorState error={error} onRetry={retry} />}

      {status === "success" && data && (
        <div className="res">
          {/* On phones the sheet header already says this. */}
          <div className="res__summary" data-phone={isPhone}>
            <strong>{routes.length} {routes.length === 1 ? "route" : "routes"} compared</strong>
            <span>Scores from open map data</span>
          </div>

          <MissingDataNotice dataSources={data.data_sources} />
          <NoRecommendationNotice recommendation={data.recommendation} />

          <RouteList
            data={data}
            selectedId={selectedId}
            preference={preference}
            onSelectRoute={chooseRoute}
            onSelectPreference={choosePreference}
            showPreference={!isPhone}
          />

          <RouteDetails
            route={selected}
            recommendation={data.recommendation}
            preference={preference}
            routes={routes}
            dataSources={data.data_sources}
            geoSource={data.geo_source}
            disclaimer={data.disclaimer}
            onFocusService={setFocusService}
          />
        </div>
      )}
    </>
  );

  const risk = selected && riskInfo(selected.risk_level);

  return (
    <div className="lp-page planner" data-phone={isPhone}>
      <Navbar solid />

      <main id="main" className="planner__stage">
        <div className="planner__map">
          <MapView
            source={source}
            destination={destination}
            routes={routes}
            selectedRouteId={selectedId}
            recommendedRouteId={recommendedId}
            onSelectRoute={chooseRoute}
            focusService={focusService}
            layers={layers}
            loading={status === "loading"}
            padding={padding}
          />
        </div>

        {/* ---------- map overlays (on phones the trip card sits on top of them) ---------- */}
        <div className="planner__overlay">
          {isPhone && (
            <div className="trip lp-glass">
              {showTripSummary ? (
                <button type="button" className="trip__summary" onClick={() => setEditing(true)} aria-label="Edit trip">
                  <span className="trip__route">
                    <strong>{source?.name}</strong>
                    <span aria-hidden="true">→</span>
                    <strong>{destination?.name}</strong>
                  </span>
                  <Pencil size={16} aria-hidden="true" />
                </button>
              ) : (
                form
              )}
            </div>
          )}

          <LayerControl layers={layers} onToggle={toggleLayer} />
          {layers.weather && selected && <WeatherChip route={selected} />}
          {layers.factors && selected && <FactorsLegend route={selected} />}
        </div>

        {/* ---------- desktop: floating side panel ---------- */}
        {!isPhone && (
          <aside className="panel lp-glass" aria-label="Route planner" style={{ width: PANEL_WIDTH }}>
            <div className="panel__top">
              <h1 className="panel__title">Plan your route</h1>
              {form}
            </div>
            <div className="panel__scroll">{results}</div>
          </aside>
        )}

        {/* ---------- phone: floating trip card + bottom sheet ---------- */}
        {isPhone && (
          <>
            <BottomSheet
              snap={sheetSnap}
              onSnapChange={setSheetSnap}
              label="Route results"
              header={
                status === "success" && data ? (
                  <div className="sheet__header">
                    <div className="sheet__line">
                      <span><strong>{routes.length} {routes.length === 1 ? "route" : "routes"}</strong> compared</span>
                      {selected && (
                        <span className="sheet__sel" data-tone={risk.tone}>
                          <ShieldCheck size={14} aria-hidden="true" />
                          {selected.name}: {selected.safety_score ?? "–"} · {risk.short}
                        </span>
                      )}
                    </div>
                    <PreferenceSwitch routes={routes} preference={preference} onSelectPreference={choosePreference} />
                  </div>
                ) : (
                  <div className="sheet__header sheet__header--plain">
                    <strong>{status === "loading" ? "Analysing your trip" : "Your route options"}</strong>
                  </div>
                )
              }
            >
              {results}
            </BottomSheet>
          </>
        )}
      </main>
    </div>
  );
}
