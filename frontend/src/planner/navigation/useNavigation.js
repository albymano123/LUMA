import { useCallback, useEffect, useRef, useState } from "react";

import {
  cumulativeDistances, currentStep, haversineMeters, projectOntoRoute,
  routeProgress, stepStartDistances,
} from "../../lib/geo";
import { useGeolocation } from "../../lib/useGeolocation";
import { getSafeRoute } from "../../services/api";

// How far off the route line counts as "deviated", before GPS accuracy is
// added in. Driving routes get more room: lanes are wider and a GPS fix
// legitimately lands further from the road's centreline at speed.
const BASE_THRESHOLD_M = { walking: 30, cycling: 35, driving: 50 };
// A single bad reading never triggers a reroute: the device must report a
// position outside the threshold continuously for this long.
const SUSTAINED_DEVIATION_MS = 8000;
// After a reroute attempt (success or failure), ignore further deviation
// for this long - otherwise a route that is itself imperfectly matched to
// the road could trigger a reroute loop.
const REROUTE_COOLDOWN_MS = 15000;
// Close enough to the destination to call it arrival, rather than
// requiring an exact coordinate match.
const ARRIVAL_THRESHOLD_M = 25;
// A GPS accuracy reading above this is capped, so one very poor fix does
// not blow the deviation threshold open indefinitely.
const MAX_ACCURACY_ALLOWANCE_M = 60;

const IDLE_PROGRESS = { distanceAlongM: 0, remainingM: 0, remainingKm: 0, percent: 0, etaMin: 0 };

function routeGeometry(route) {
  const coordinates = route.geometry.coordinates;
  const cumulative = cumulativeDistances(coordinates);
  const stepStarts = stepStartDistances(route.steps || []);

  return {
    coordinates,
    cumulative,
    stepStarts,
    totalDistanceM: cumulative[cumulative.length - 1] || 0,
    // The only honest pace estimate for "time remaining" without a live
    // speed reading for the whole rest of the trip: the pace the chosen
    // route was computed at.
    paceMinPerKm: route.distance_km > 0 ? route.duration_min / route.distance_km : 0,
  };
}

/**
 * Drives LumaPath's live navigation mode on top of the existing route
 * data: real GPS tracking (useGeolocation), progress along the real
 * route geometry, off-route detection, and rerouting through the exact
 * same getSafeRoute() the planner itself uses (so a recalculated route
 * gets the same rule-based + AI/ML safety analysis and ranking as any
 * other search - nothing here computes its own routes or scores).
 *
 * Reacts to each real GPS fix from inside useGeolocation's own native
 * watchPosition callback (its onPosition option), not via a separate
 * effect re-deriving from its returned state - one hop closer to the
 * real event, and it avoids the cascading render a derived effect would
 * cause for something that updates this often.
 *
 *   onRerouted(result, routeId): called after a successful reroute, so
 *   the caller can keep its own route-list state (MapPage's `data`/
 *   `selectedId`) in sync, so ending navigation lands on the current data.
 */
export function useNavigation({ onRerouted } = {}) {
  const [active, setActive] = useState(false);
  const [route, setRoute] = useState(null);
  const [destination, setDestination] = useState(null);
  const [mode, setMode] = useState(null);
  const [deviation, setDeviation] = useState("on-route"); // on-route | deviating | off-route
  const [rerouting, setRerouting] = useState(false);
  const [rerouteError, setRerouteError] = useState(null);
  const [arrived, setArrived] = useState(false);
  const [progress, setProgress] = useState(IDLE_PROGRESS);
  const [instruction, setInstruction] = useState(null);

  const geometryRef = useRef(null);
  const deviatingSinceRef = useRef(null);
  const cooldownUntilRef = useRef(0);
  const reroutingRef = useRef(false);
  const abortRef = useRef(null);
  // Mirrors state that handleFix (an async, non-render callback) needs to
  // read without depending on a render that may be behind the real event.
  const liveRef = useRef({ route: null, destination: null, mode: null, arrived: false });

  useEffect(() => {
    liveRef.current = { route, destination, mode, arrived };
  });

  const start = useCallback((initialRoute, destinationPlace, travelMode) => {
    geometryRef.current = routeGeometry(initialRoute);
    deviatingSinceRef.current = null;
    cooldownUntilRef.current = 0;

    setRoute(initialRoute);
    setDestination(destinationPlace);
    setMode(travelMode);
    setDeviation("on-route");
    setRerouting(false);
    setRerouteError(null);
    setArrived(false);
    setProgress(IDLE_PROGRESS);
    setInstruction(null);
    setActive(true);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setActive(false);
    setRoute(null);
    setDestination(null);
    setMode(null);
    geometryRef.current = null;
  }, []);

  const reroute = useCallback(async (fromLat, fromLon) => {
    const { destination: dest, mode: travelMode, route: currentRoute } = liveRef.current;

    if (reroutingRef.current || !dest || !travelMode) return;

    reroutingRef.current = true;
    setRerouting(true);
    setRerouteError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await getSafeRoute(
        { lat: fromLat, lon: fromLon, name: "Your location" },
        dest,
        travelMode,
        { signal: controller.signal },
      );

      if (controller.signal.aborted) return;

      if (!result.routes?.length) {
        throw new Error("No route could be found from your current location.");
      }

      // Keep following the same kind of route (safest/balanced/fastest)
      // this trip was using, when the recalculated alternatives still
      // offer one; otherwise fall back to whichever the backend's own
      // rule-based + AI/ML-aware ranking recommends.
      const preferredCategory = currentRoute?.categories?.find((category) => ["safest", "balanced", "fastest"].includes(category));
      const next =
        result.routes.find((candidate) => preferredCategory && candidate.categories.includes(preferredCategory)) ||
        result.routes.find((candidate) => candidate.id === result.default_route_id) ||
        result.routes[0];

      geometryRef.current = routeGeometry(next);
      deviatingSinceRef.current = null;
      setRoute(next);
      onRerouted?.(result, next.id);
    } catch (error) {
      if (controller.signal.aborted) return;
      setRerouteError(error?.message || "Couldn't recalculate the route. Keeping your current route.");
    } finally {
      if (!controller.signal.aborted) {
        reroutingRef.current = false;
        setRerouting(false);
        cooldownUntilRef.current = Date.now() + REROUTE_COOLDOWN_MS;
      }
    }
  }, [onRerouted]);

  // ---------- fires from useGeolocation's own native watchPosition callback ----------

  const handleFix = useCallback((fix) => {
    const geometry = geometryRef.current;
    const { destination: dest, mode: travelMode, arrived: alreadyArrived } = liveRef.current;

    if (!geometry || alreadyArrived || !fix.position) return;

    const { lat, lon } = fix.position;

    if (dest) {
      const toDestinationM = haversineMeters(lat, lon, dest.lat, dest.lon);

      if (toDestinationM <= ARRIVAL_THRESHOLD_M) {
        setArrived(true);
        setDeviation("on-route");
        return;
      }
    }

    const projection = projectOntoRoute(geometry.coordinates, geometry.cumulative, lat, lon);

    if (!projection) return;

    setProgress(routeProgress(projection, geometry.totalDistanceM, geometry.paceMinPerKm));
    setInstruction(currentStep(liveRef.current.route?.steps, geometry.stepStarts, projection.distanceAlongM));

    const threshold = (BASE_THRESHOLD_M[travelMode] ?? BASE_THRESHOLD_M.walking)
      + Math.min(fix.accuracy ?? 0, MAX_ACCURACY_ALLOWANCE_M);

    const now = Date.now();

    if (projection.distanceFromRouteM <= threshold) {
      deviatingSinceRef.current = null;
      setDeviation("on-route");
      return;
    }

    if (deviatingSinceRef.current == null) {
      deviatingSinceRef.current = now;
    }

    if (now - deviatingSinceRef.current < SUSTAINED_DEVIATION_MS) {
      setDeviation("deviating");
      return;
    }

    setDeviation("off-route");

    if (now >= cooldownUntilRef.current) {
      reroute(lat, lon);
    }
  }, [reroute]);

  // A route chosen from the results list while already navigating (the
  // planner UI stays reachable; this just swaps the tracked geometry).
  const setActiveRoute = useCallback((nextRoute) => {
    geometryRef.current = routeGeometry(nextRoute);
    deviatingSinceRef.current = null;
    setRoute(nextRoute);
  }, []);

  const location = useGeolocation(active && !arrived, { onPosition: handleFix });

  return {
    // navigation lifecycle
    active,
    route,
    start,
    stop,
    setActiveRoute,

    // live location (real GPS only; see useGeolocation)
    position: location.position,
    accuracy: location.accuracy,
    heading: location.heading,
    locationStatus: location.status,
    locationError: location.error,

    // progress along the route
    progress,
    instruction,

    // deviation / rerouting
    deviation,
    rerouting,
    rerouteError,
    dismissRerouteError: () => setRerouteError(null),

    // arrival
    arrived,
  };
}
