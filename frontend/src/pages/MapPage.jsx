import { useRef, useState } from "react";

import {
  Alert,
  Box,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";

import "leaflet/dist/leaflet.css";

import Navbar from "../components/Navbar";
import RouteForm from "../components/RouteForm";
import RouteStatus from "../components/RouteStatus";
import RouteComparison from "../components/RouteComparison";
import RouteDetails from "../components/RouteDetails";
import MapView from "../components/MapView";
import MapLegend from "../components/MapLegend";

import { describeApiError, getSafeRoute } from "../services/api";
import { DATA_SOURCE_LABELS } from "../lib/format";

const NAVBAR_HEIGHT = 56;
const PANEL_WIDTH = 440;

function MissingDataNotice({ dataSources }) {
  const missing = Object.entries(dataSources || {})
    .filter(([, available]) => !available)
    .map(([key]) => DATA_SOURCE_LABELS[key] || key);

  if (!missing.length) {
    return null;
  }

  return (
    <Alert severity="warning" sx={{ mb: 1.5 }}>
      Some safety data couldn't be loaded right now ({missing.join(", ")}).
      Scores use the data that was available and show lower confidence.
    </Alert>
  );
}

// Shown when no route can honestly be called the safest.
function NoRecommendationNotice({ recommendation }) {
  if (!recommendation || recommendation.state !== "unavailable") {
    return null;
  }

  return (
    <Alert severity="info" sx={{ mb: 1.5 }} data-testid="no-recommendation">
      {recommendation.reason}
    </Alert>
  );
}

// The navigation app: search, compare routes, inspect one.
function MapPage() {
  const [source, setSource] = useState(null);
  const [destination, setDestination] = useState(null);
  const [mode, setMode] = useState("walking");

  // idle | loading | success | empty | error
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [safeRouteData, setSafeRouteData] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  // What the user asked for (safest / balanced / fastest), if anything.
  // Kept separately from the route because one route can hold several tags.
  const [preference, setPreference] = useState(null);
  const [focusService, setFocusService] = useState(null);
  const [notice, setNotice] = useState("");

  const requestRef = useRef(null);


  // ==================================================
  // ANALYSE ROUTES
  // ==================================================

  const analyse = async (from, to, travelMode) => {
    // A newer request replaces any in flight, and old results never
    // stay on screen for a different trip.
    requestRef.current?.abort();
    setSafeRouteData(null);
    setSelectedRoute(null);
    setPreference(null);
    setFocusService(null);

    if (!from || !to) {
      requestRef.current = null;
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;

    setStatus("loading");
    setError("");

    try {
      const result = await getSafeRoute(from, to, travelMode, controller.signal);

      if (controller.signal.aborted) return;

      if (!result.routes?.length) {
        setStatus("empty");
        return;
      }

      setSafeRouteData(result);
      setSelectedRoute(result.default_route_id ?? result.routes[0].id);
      setStatus("success");
    } catch (requestError) {
      if (controller.signal.aborted) return;

      const message = describeApiError(requestError);

      if (message) {
        setError(message);
        setStatus("error");
      }
    }
  };

  const changeSource = (place) => {
    setSource(place);
    analyse(place, destination, mode);
  };

  const changeDestination = (place) => {
    setDestination(place);
    analyse(source, place, mode);
  };

  const changeMode = (value) => {
    setMode(value);
    analyse(source, destination, value);
  };

  const swap = () => {
    setSource(destination);
    setDestination(source);
    analyse(destination, source, mode);
  };

  const retry = () => analyse(source, destination, mode);

  const routes = safeRouteData?.routes;
  const selected = routes?.find((route) => route.id === selectedRoute);
  const recommendedId = safeRouteData?.recommended_route_id ?? null;

  const chooseRoute = (routeId) => {
    setSelectedRoute(routeId);

    // Tapping a route card keeps the preference only if it still fits.
    const route = routes?.find((item) => item.id === routeId);

    if (!route?.categories.includes(preference)) {
      setPreference(null);
    }
  };

  const choosePreference = (category) => {
    const route = routes?.find((item) => item.categories.includes(category));

    if (route) {
      setSelectedRoute(route.id);
      setPreference(category);
    }
  };


  // ==================================================
  // PAGE
  // ==================================================

  return (
    <Box sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
      <Navbar dense />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", md: `${PANEL_WIDTH}px minmax(0, 1fr)` },
          gridTemplateRows: { xs: "auto 46vh auto", md: "auto minmax(0, 1fr)" },
          gridTemplateAreas: {
            xs: '"form" "map" "results"',
            md: '"form map" "results map"',
          },
          height: { md: `calc(100vh - ${NAVBAR_HEIGHT}px)` },
        }}
      >
        {/* ---------------- SEARCH ---------------- */}
        <Box
          sx={{
            gridArea: "form",
            p: 2,
            bgcolor: "background.paper",
            borderRight: { md: 1 },
            borderBottom: 1,
            borderColor: "divider",
            zIndex: 1,
          }}
        >
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
            onError={setNotice}
          />
        </Box>

        {/* ---------------- MAP ---------------- */}
        <Box sx={{ gridArea: "map", position: "relative", minHeight: 0 }}>
          <MapView
            source={source}
            destination={destination}
            routes={routes}
            selectedRouteId={selectedRoute}
            recommendedRouteId={recommendedId}
            onSelectRoute={chooseRoute}
            focusService={focusService}
          />

          {routes && <MapLegend hideRecommended={!recommendedId || selectedRoute === recommendedId} />}
        </Box>

        {/* ---------------- RESULTS ---------------- */}
        <Box
          sx={{
            gridArea: "results",
            overflowY: { md: "auto" },
            p: 2,
            bgcolor: "background.paper",
            borderRight: { md: 1 },
            borderColor: "divider",
            minHeight: 0,
          }}
        >
          {status !== "success" && (
            <RouteStatus status={status} error={error} onRetry={retry} />
          )}

          {status === "success" && (
            <Stack spacing={2}>
              <Box>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline", mb: 1.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {routes.length} {routes.length === 1 ? "route" : "routes"} compared
                  </Typography>

                  <Typography variant="caption" color="text.secondary">
                    Scores from open map data
                  </Typography>
                </Stack>

                <MissingDataNotice dataSources={safeRouteData.data_sources} />
                <NoRecommendationNotice recommendation={safeRouteData.recommendation} />

                <RouteComparison
                  safeRouteData={safeRouteData}
                  selectedRoute={selectedRoute}
                  preference={preference}
                  onSelectRoute={chooseRoute}
                  onSelectPreference={choosePreference}
                />
              </Box>

              <RouteDetails
                route={selected}
                recommendation={safeRouteData.recommendation}
                preference={preference}
                routes={routes}
                dataSources={safeRouteData.data_sources}
                geoSource={safeRouteData.geo_source}
                disclaimer={safeRouteData.disclaimer}
                onFocusService={setFocusService}
              />
            </Stack>
          )}
        </Box>
      </Box>

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={6000}
        onClose={() => setNotice("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="warning" onClose={() => setNotice("")} variant="filled">
          {notice}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default MapPage;
