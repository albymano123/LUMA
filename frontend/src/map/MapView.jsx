import { Fragment, useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Polyline, Popup, Tooltip, useMap } from "react-leaflet";

import L, { clusterReady } from "./leaflet";
import BaseLayer from "./BaseLayer";
import { routeColors } from "./colors";
import { clusterIcon, endpointIcons, liveLocationIcon, serviceIcon, servicePopup } from "./markers";
import { formatDistance, formatDuration } from "../lib/format";
import { riskInfo } from "../lib/risk";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "./map.css";

// Default view (Kerala) until the user picks places.
const DEFAULT_CENTER = [10.3, 77.3];
const DEFAULT_ZOOM = 8;

// OSRM geometry is [longitude, latitude]; Leaflet wants [lat, lon].
const toLatLngs = (coordinates) => coordinates.map(([lon, lat]) => [lat, lon]);


// ==================================================
// FIT THE MAP TO WHAT MATTERS
// ==================================================

function FitView({ source, destination, routes, padding }) {
  const map = useMap();
  const paddingRef = useRef(padding);

  useEffect(() => {
    paddingRef.current = padding;
  });

  const options = () => ({
    paddingTopLeft: [paddingRef.current.left, paddingRef.current.top],
    paddingBottomRight: [paddingRef.current.right, paddingRef.current.bottom],
    animate: true,
    duration: 0.7,
  });

  // New results: fit every route.
  useEffect(() => {
    if (!routes?.length) return;

    const bounds = L.latLngBounds(routes.flatMap((route) => toLatLngs(route.geometry.coordinates)));

    if (bounds.isValid()) map.fitBounds(bounds, options());
  }, [map, routes]);

  // Places chosen but no results yet: show them.
  useEffect(() => {
    if (routes?.length) return;

    const points = [source, destination].filter(Boolean).map((place) => [place.lat, place.lon]);

    if (points.length === 1) {
      map.flyTo(points[0], 14, { duration: 0.6 });
    } else if (points.length === 2) {
      map.fitBounds(points, { ...options(), maxZoom: 15 });
    }
  }, [map, source, destination, routes]);

  // The container changes size with the layout.
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

// Adds the "draw" animation to a freshly selected route: the line is
// traced from start to end. pathLength normalises the dash maths.
function useDrawAnimation(ref, active) {
  useEffect(() => {
    const path = ref.current?.getElement?.();

    if (!path || !active) return undefined;

    path.setAttribute("pathLength", "1");
    path.classList.add("lp-route--draw");

    const done = () => path.classList.remove("lp-route--draw");
    path.addEventListener("animationend", done, { once: true });

    return () => {
      path.removeEventListener("animationend", done);
      path.classList.remove("lp-route--draw");
    };
  }, [ref, active]);
}

function RouteLine({ route, state, onSelect }) {
  const positions = useMemo(() => toLatLngs(route.geometry.coordinates), [route]);
  const selectedRef = useRef(null);
  const visibleRef = useRef(null);
  const risk = riskInfo(route.risk_level);

  useDrawAnimation(selectedRef, state === "selected");

  const summary = (
    <>
      <strong>{route.name}</strong>
      {" · "}
      {route.safety_score == null ? "No score" : `Score ${route.safety_score}`}
      {" · "}
      {risk.short}
      <br />
      {formatDuration(route.duration_min)} · {formatDistance(route.distance_km)}
    </>
  );

  if (state === "selected") {
    return (
      <>
        <Polyline positions={positions} className="lp-route lp-route--casing" pathOptions={{ color: routeColors.casing, weight: 11, opacity: 1 }} interactive={false} />
        <Polyline
          ref={selectedRef}
          positions={positions}
          className="lp-route lp-route--selected"
          pathOptions={{ color: routeColors.selected, weight: 6, opacity: 1 }}
        >
          <Tooltip sticky>{summary}</Tooltip>
        </Polyline>
      </>
    );
  }

  const recommended = state === "recommended";

  return (
    <>
      {/* A wide invisible line makes thin routes easy to tap. */}
      <Polyline
        positions={positions}
        className="lp-route lp-route--hit"
        pathOptions={{ color: "#000", weight: 20, opacity: 0 }}
        eventHandlers={{
          click: () => onSelect(route.id),
          mouseover: () => visibleRef.current?.setStyle({ weight: 8, opacity: 1 }),
          mouseout: () => visibleRef.current?.setStyle({ weight: 5, opacity: recommended ? 0.95 : 0.8 }),
        }}
      >
        <Tooltip sticky>
          {summary}
          <br />
          <em>Click to select</em>
        </Tooltip>
      </Polyline>

      <Polyline
        ref={visibleRef}
        positions={positions}
        interactive={false}
        className={`lp-route ${recommended ? "lp-route--recommended" : "lp-route--alt"}`}
        pathOptions={{
          color: recommended ? routeColors.recommended : routeColors.alternative,
          weight: 5,
          opacity: recommended ? 0.95 : 0.8,
          dashArray: recommended ? "10 8" : undefined,
        }}
      />
    </>
  );
}


// ==================================================
// SAFETY-FACTOR LAYER: stretches with no mapped buildings
// ==================================================

function HighlightLayer({ route }) {
  return route.highlights?.map((stretch) => (
    <Polyline
      key={`${route.id}-${stretch.from_km}`}
      positions={toLatLngs(stretch.coordinates)}
      className="lp-route lp-route--highlight"
      pathOptions={{ color: routeColors.highlight, weight: 9, opacity: 0.9, lineCap: "round" }}
    >
      <Tooltip sticky>
        <strong>{stretch.label}</strong>
        <br />
        About {stretch.length_km} km, {stretch.from_km}&ndash;{stretch.to_km} km along the route
      </Tooltip>
    </Polyline>
  ));
}


// ==================================================
// EMERGENCY SERVICES (clustered)
// ==================================================

function ServiceMarkers({ route, focus }) {
  const map = useMap();
  const state = useRef({ group: null, markers: new Map() });

  // Rebuild when the selected route (and so its services) changes.
  useEffect(() => {
    let cancelled = false;
    const holder = state.current;

    clusterReady.then(() => {
      if (cancelled) return;

      const group = L.markerClusterGroup({
        maxClusterRadius: 32,
        disableClusteringAtZoom: 15,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: clusterIcon,
      });

      holder.markers = new Map();

      route.emergency_services.forEach((service, index) => {
        const marker = L.marker([service.lat, service.lon], {
          icon: serviceIcon(service.kind, index),
          title: service.name || service.kind,
          keyboard: true,
        });
        marker.bindPopup(servicePopup(service, route.name), { className: "lp-popup-shell", maxWidth: 260 });
        group.addLayer(marker);
        holder.markers.set(service.id, marker);
      });

      map.addLayer(group);
      holder.group = group;
    });

    return () => {
      cancelled = true;
      holder.group?.clearLayers();
      holder.group?.remove();
      holder.group = null;
    };
  }, [map, route]);

  // A service picked from the list: zoom to it and open its popup.
  useEffect(() => {
    if (!focus) return;

    const { group, markers } = state.current;
    const marker = markers.get(focus.id);

    if (group && marker) {
      group.zoomToShowLayer(marker, () => marker.openPopup());
    } else {
      map.flyTo([focus.lat, focus.lon], Math.max(map.getZoom(), 16), { duration: 0.6 });
    }
  }, [map, focus]);

  return null;
}


// ==================================================
// LOADING: a line being "constructed" between the two places
// ==================================================

function ScanLine({ source, destination }) {
  return (
    <Polyline
      positions={[[source.lat, source.lon], [destination.lat, destination.lon]]}
      interactive={false}
      className="lp-route--scan"
      pathOptions={{ color: routeColors.scan, weight: 4, opacity: 0.9, dashArray: "2 10", lineCap: "round" }}
    />
  );
}


// ==================================================
// ZOOM BUTTONS
// ==================================================

function ZoomControl() {
  const map = useMap();

  useEffect(() => {
    const control = L.control.zoom({ position: "bottomright" });
    control.addTo(map);

    return () => control.remove();
  }, [map]);

  return null;
}


// ==================================================
// LIVE NAVIGATION: position puck + follow mode
// ==================================================

// Keeps the map centred on a live GPS fix while `follow` is true, without
// fighting the user: any real (non-programmatic) drag turns follow off
// via onUserPanned, and `recenterSignal` (a value that changes each time
// the "Re-center" button is pressed) forces one more pan even while
// follow is off, independent of whether it is then turned back on.
function FollowLocation({ liveLocation, follow, onUserPanned, recenterSignal }) {
  const map = useMap();
  const lastSignal = useRef(recenterSignal);

  useEffect(() => {
    const onDragStart = () => onUserPanned?.();
    map.on("dragstart", onDragStart);
    return () => map.off("dragstart", onDragStart);
  }, [map, onUserPanned]);

  useEffect(() => {
    if (!liveLocation) return;

    const recenterRequested = recenterSignal !== lastSignal.current;
    lastSignal.current = recenterSignal;

    if (!follow && !recenterRequested) return;

    map.flyTo([liveLocation.lat, liveLocation.lon], Math.max(map.getZoom(), 17), { duration: 0.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, liveLocation?.lat, liveLocation?.lon, follow, recenterSignal]);

  return null;
}

function LiveLocationMarker({ liveLocation }) {
  const icon = useMemo(() => liveLocationIcon(liveLocation?.heading), [liveLocation?.heading]);

  if (!liveLocation) return null;

  return (
    <Marker
      position={[liveLocation.lat, liveLocation.lon]}
      icon={icon}
      zIndexOffset={2000}
      interactive={false}
      keyboard={false}
    />
  );
}


// ==================================================
// MAIN MAP
// ==================================================

export default function MapView({
  source,
  destination,
  routes,
  selectedRouteId,
  recommendedRouteId,
  onSelectRoute,
  focusService,
  layers,
  loading,
  padding,
  // ---- live navigation (all optional; the planner view never sets these) ----
  liveLocation, // {lat, lon, heading} | null
  followLocation = false,
  onUserPanned,
  recenterSignal,
}) {
  const selected = routes?.find((route) => route.id === selectedRouteId);

  // Draw order: alternatives, then recommended, then the selected route on top.
  const ordered = useMemo(
    () =>
      [...(routes || [])].sort((a, b) => {
        const rank = (route) => (route.id === selectedRouteId ? 2 : route.id === recommendedRouteId ? 1 : 0);
        return rank(a) - rank(b);
      }),
    [routes, selectedRouteId, recommendedRouteId]
  );

  return (
    <MapContainer
      className="lp-map"
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      minZoom={3}
      maxZoom={19}
      zoomControl={false}
      attributionControl
      style={{ height: "100%", width: "100%" }}
    >
      <BaseLayer />

      <ZoomControl />
      <FitView source={source} destination={destination} routes={routes} padding={padding} />
      {liveLocation && (
        <FollowLocation
          liveLocation={liveLocation}
          follow={followLocation}
          onUserPanned={onUserPanned}
          recenterSignal={recenterSignal}
        />
      )}

      {loading && source && destination && <ScanLine source={source} destination={destination} />}

      {ordered.map((route) => (
        <Fragment key={route.id}>
          <RouteLine
            route={route}
            state={route.id === selectedRouteId ? "selected" : route.id === recommendedRouteId ? "recommended" : "alternative"}
            onSelect={onSelectRoute}
          />
        </Fragment>
      ))}

      {layers.factors && selected && <HighlightLayer route={selected} />}

      {layers.emergency && selected && <ServiceMarkers route={selected} focus={focusService} />}

      {source && (
        <Marker position={[source.lat, source.lon]} icon={endpointIcons.start} zIndexOffset={1000}>
          <Popup><strong>Start</strong><br />{source.name}</Popup>
        </Marker>
      )}

      {destination && (
        <Marker position={[destination.lat, destination.lon]} icon={endpointIcons.end} zIndexOffset={1000}>
          <Popup><strong>Destination</strong><br />{destination.name}</Popup>
        </Marker>
      )}

      <LiveLocationMarker liveLocation={liveLocation} />
    </MapContainer>
  );
}
