// Client-side route geometry for navigation mode: how far along a route a
// live GPS fix is, how far it strays from the route line, and the
// resulting progress numbers. Pure functions, no map library involved, so
// they are cheap to run on every GPS update and easy to unit test.

const EARTH_RADIUS_M = 6371000;
const toRad = (degrees) => (degrees * Math.PI) / 180;

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, a)));
}

/**
 * Cumulative distance (metres) from the route's start to each of its
 * [lon, lat] points, plus the total as the last entry. Computed once
 * when a route becomes active, not on every GPS update.
 */
export function cumulativeDistances(coordinates) {
  const cumulative = [0];

  for (let i = 1; i < coordinates.length; i++) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    cumulative.push(cumulative[i - 1] + haversineMeters(lat1, lon1, lat2, lon2));
  }

  return cumulative;
}

// Local equirectangular projection around (originLon, originLat), accurate
// to well under a metre over the few-hundred-metre span a single route
// segment covers - the same approximation the backend uses for its own
// local route measurements (backend/road_features.py).
function toLocalMetres(lon, lat, originLon, originLat) {
  return [
    toRad(lon - originLon) * Math.cos(toRad(originLat)) * EARTH_RADIUS_M,
    toRad(lat - originLat) * EARTH_RADIUS_M,
  ];
}

/**
 * The closest point on a [lon, lat] route polyline to (lat, lon), by
 * projecting onto every segment (not just the nearest vertex).
 *
 *   coordinates: route.geometry.coordinates
 *   cumulative:  cumulativeDistances(coordinates) - pass the same one in
 *                every call for a given route; do not recompute per tick.
 *
 * Returns null only when the route has no points.
 */
export function projectOntoRoute(coordinates, cumulative, lat, lon) {
  if (!coordinates?.length) return null;

  if (coordinates.length === 1) {
    const [only_lon, only_lat] = coordinates[0];

    return {
      point: [only_lon, only_lat],
      distanceAlongM: 0,
      distanceFromRouteM: haversineMeters(lat, lon, only_lat, only_lon),
      segmentIndex: 0,
    };
  }

  let best = null;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lon1, lat1] = coordinates[i];
    const [lon2, lat2] = coordinates[i + 1];

    const originLon = (lon1 + lon2) / 2;
    const originLat = (lat1 + lat2) / 2;

    const [ax, ay] = toLocalMetres(lon1, lat1, originLon, originLat);
    const [bx, by] = toLocalMetres(lon2, lat2, originLon, originLat);
    const [px, py] = toLocalMetres(lon, lat, originLon, originLat);

    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    let t = lengthSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lengthSq : 0;
    t = Math.max(0, Math.min(1, t));

    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const distanceM = Math.hypot(px - cx, py - cy);

    if (!best || distanceM < best.distanceFromRouteM) {
      best = {
        point: [lon1 + t * (lon2 - lon1), lat1 + t * (lat2 - lat1)],
        distanceAlongM: cumulative[i] + t * (cumulative[i + 1] - cumulative[i]),
        distanceFromRouteM: distanceM,
        segmentIndex: i,
      };
    }
  }

  return best;
}

/**
 * Remaining distance/time/percent from a projectOntoRoute() result.
 *
 *   totalDistanceM:       cumulative[cumulative.length - 1]
 *   impliedPaceMinPerKm:  route.duration_min / route.distance_km - the
 *                         only honest pace estimate available without a
 *                         live speed reading for the whole remaining leg.
 */
export function routeProgress(projection, totalDistanceM, impliedPaceMinPerKm) {
  const remainingM = Math.max(0, totalDistanceM - projection.distanceAlongM);
  const remainingKm = remainingM / 1000;

  return {
    distanceAlongM: projection.distanceAlongM,
    remainingM,
    remainingKm,
    percent: totalDistanceM > 0 ? Math.min(100, (projection.distanceAlongM / totalDistanceM) * 100) : 0,
    etaMin: remainingKm * impliedPaceMinPerKm,
  };
}

/**
 * Cumulative distance (metres) at the START of each real OSRM step
 * (route.steps), so a live distanceAlongM can find "the next maneuver".
 */
export function stepStartDistances(steps) {
  const starts = [0];

  for (let i = 0; i < steps.length - 1; i++) {
    starts.push(starts[i] + (steps[i].distance_m || 0));
  }

  return starts;
}

/**
 * The step the traveller is currently working towards, and how far away
 * its maneuver is. Returns null when the route has no step data (an
 * older cached response, or a provider that returned none) - navigation
 * still works from geometry alone in that case, just without instructions.
 */
export function currentStep(steps, stepStarts, distanceAlongM) {
  if (!steps?.length) return null;

  let index = steps.length - 1;

  for (let i = 0; i < steps.length; i++) {
    if (stepStarts[i] > distanceAlongM + 1e-6) {
      index = i;
      break;
    }
  }

  return {
    step: steps[index],
    index,
    distanceToManeuverM: Math.max(0, stepStarts[index] - distanceAlongM),
    isLast: index === steps.length - 1,
  };
}
