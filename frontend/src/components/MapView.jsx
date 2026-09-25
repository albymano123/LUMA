import { Fragment, useEffect, useMemo } from "react";

import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

import L from "leaflet";

import { routeColors } from "../theme";
import { formatDistance, formatDuration, formatMetres, formatRiskLevel } from "../lib/format";


// ==================================================
// MARKER ICONS
//
// Plain divIcons styled in index.css, so no marker images are
// loaded from third-party hosts.
// ==================================================

function pinIcon(kind, label = "", size = 26) {
  return L.divIcon({
    className: `lp-pin lp-pin--${kind}`,
    html: `<div class="lp-pin__body">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

const ICONS = {
  start: pinIcon("start", "A", 28),
  end: pinIcon("end", "B", 28),
  hospital: pinIcon("hospital", "H", 22),
  clinic: pinIcon("clinic", "+", 22),
  police: pinIcon("police", "P", 22),
  fire_station: pinIcon("fire_station", "F", 22),
};

const SERVICE_LABELS = {
  hospital: "Hospital",
  clinic: "Clinic",
  police: "Police station",
  fire_station: "Fire station",
};

// Default view (Kerala) until the user picks places.
const DEFAULT_CENTER = [10.0, 76.3];
const DEFAULT_ZOOM = 9;

// OSRM geometry is [longitude, latitude]; Leaflet wants [lat, lon].
const toLatLngs = (route) =>
  (route.geometry?.coordinates || []).map(([lon, lat]) => [lat, lon]);


// ==================================================
// FIT THE MAP TO WHAT MATTERS
// ==================================================

function FitView({ source, destination, routes, focus, padding }) {
  const map = useMap();

  // New results: fit every route.
  useEffect(() => {
    if (!routes?.length) return;

    const bounds = L.latLngBounds(routes.flatMap(toLatLngs));

    if (bounds.isValid()) {
      map.fitBounds(bounds, { paddingTopLeft: padding, paddingBottomRight: [40, 40] });
    }
  }, [map, routes, padding]);

  // Places chosen but no results yet: show them.
  useEffect(() => {
    if (routes?.length) return;

    const points = [source, destination]
      .filter(Boolean)
      .map((place) => [place.lat, place.lon]);

    if (points.length === 1) {
      map.flyTo(points[0], 14, { duration: 0.6 });
    } else if (points.length === 2) {
      map.fitBounds(points, { paddingTopLeft: padding, paddingBottomRight: [60, 60] });
    }
  }, [map, source, destination, routes, padding]);

  // A service picked from the list.
  useEffect(() => {
    if (focus) {
      map.flyTo([focus.lat, focus.lon], Math.max(map.getZoom(), 16), { duration: 0.6 });
    }
  }, [map, focus]);

  // The map container changes size with the layout.
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  return null;
}


// ==================================================
// ROUTE LINES
// ==================================================

function RouteLine({ route, state, onSelect }) {
  const positions = useMemo(() => toLatLngs(route), [route]);

  const summary = (
    <>
      <strong>{route.name}</strong>
      {" · "}
      {route.safety_score == null ? "No score" : `Score ${route.safety_score}`}
      {" · "}
      {formatRiskLevel(route.risk_level)}
      <br />
      {formatDuration(route.duration_min)} · {formatDistance(route.distance_km)}
    </>
  );

  if (state === "selected") {
    return (
      <>
        <Polyline
          positions={positions}
          pathOptions={{ color: routeColors.casing, weight: 11, opacity: 1 }}
          interactive={false}
        />
        <Polyline
          positions={positions}
          pathOptions={{ color: routeColors.selected, weight: 6, opacity: 1 }}
        >
          <Tooltip sticky>{summary}</Tooltip>
        </Polyline>
      </>
    );
  }

  const isRecommended = state === "recommended";

  return (
    <>
      {/* Wide invisible line so thin routes are easy to tap. */}
      <Polyline
        positions={positions}
        pathOptions={{ color: "#000", weight: 18, opacity: 0 }}
        eventHandlers={{ click: () => onSelect(route.id) }}
      >
        <Tooltip sticky>
          {summary}
          <br />
          <em>Click to select</em>
        </Tooltip>
      </Polyline>

      <Polyline
        positions={positions}
        interactive={false}
        pathOptions={{
          color: isRecommended ? routeColors.recommended : routeColors.alternative,
          weight: isRecommended ? 5 : 5,
          opacity: isRecommended ? 0.95 : 0.85,
          dashArray: isRecommended ? "10 8" : undefined,
        }}
      />
    </>
  );
}


// ==================================================
// MAIN MAP
// ==================================================

function MapView({
  source,
  destination,
  routes,
  selectedRouteId,
  recommendedRouteId,
  onSelectRoute,
  focusService,
  fitPadding = [40, 40],
}) {
  const selected = routes?.find((route) => route.id === selectedRouteId);

  // Draw order: alternatives, then recommended, then the selected
  // route on top.
  const ordered = [...(routes || [])].sort((a, b) => {
    const rank = (route) =>
      route.id === selectedRouteId ? 2 : route.id === recommendedRouteId ? 1 : 0;
    return rank(a) - rank(b);
  });

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      zoomControl={false}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <ZoomControlRight />

      <FitView
        source={source}
        destination={destination}
        routes={routes}
        focus={focusService}
        padding={fitPadding}
      />

      {ordered.map((route) => (
        <Fragment key={route.id}>
          <RouteLine
            route={route}
            state={
              route.id === selectedRouteId
                ? "selected"
                : route.id === recommendedRouteId
                  ? "recommended"
                  : "alternative"
            }
            onSelect={onSelectRoute}
          />
        </Fragment>
      ))}

      {/* Emergency services near the selected route only, to keep
          the map readable. */}
      {selected?.emergency_services.map((service) => (
        <Marker
          key={service.id}
          position={[service.lat, service.lon]}
          icon={ICONS[service.kind] || ICONS.hospital}
        >
          <Popup>
            <strong>{service.name || `Unnamed ${SERVICE_LABELS[service.kind].toLowerCase()}`}</strong>
            <br />
            {SERVICE_LABELS[service.kind]}
            {service.emergency_ward ? " · Emergency department" : ""}
            <br />
            {formatMetres(service.distance_m)} from {selected.name}
            {service.phone && (
              <>
                <br />
                <a href={`tel:${service.phone.split(/[;,]/)[0].trim()}`}>{service.phone}</a>
              </>
            )}
          </Popup>
        </Marker>
      ))}

      {source && (
        <Marker position={[source.lat, source.lon]} icon={ICONS.start} zIndexOffset={1000}>
          <Popup>
            <strong>Start</strong>
            <br />
            {source.name}
          </Popup>
        </Marker>
      )}

      {destination && (
        <Marker position={[destination.lat, destination.lon]} icon={ICONS.end} zIndexOffset={1000}>
          <Popup>
            <strong>Destination</strong>
            <br />
            {destination.name}
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}

// Zoom buttons on the right, away from the route panel.
function ZoomControlRight() {
  const map = useMap();

  useEffect(() => {
    const control = L.control.zoom({ position: "topright" });
    control.addTo(map);
    return () => control.remove();
  }, [map]);

  return null;
}

export default MapView;
