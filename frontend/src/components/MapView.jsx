import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

function Routing({
  sourceCoords,
  destinationCoords,
  setDistance,
  setTime,
}) {
  const map = useMap();

  useEffect(() => {
    if (!sourceCoords || !destinationCoords) return;

    const routingControl = L.Routing.control({
      waypoints: [
        L.latLng(sourceCoords[0], sourceCoords[1]),
        L.latLng(destinationCoords[0], destinationCoords[1]),
      ],

      lineOptions: {
        styles: [
          {
            color: "blue",
            weight: 5,
          },
        ],
      },

      routeWhileDragging: false,
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: true,
      show: false,
      createMarker: () => null,
    }).addTo(map);

    routingControl.on("routesfound", (e) => {
      const route = e.routes[0];

      const distance = (
        route.summary.totalDistance / 1000
      ).toFixed(2);

      const time = Math.round(
        route.summary.totalTime / 60
      );

      setDistance(distance);
      setTime(time);
    });

    return () => {
      map.removeControl(routingControl);
    };
  }, [
    map,
    sourceCoords,
    destinationCoords,
    setDistance,
    setTime,
  ]);

  return null;
}

function MapView({
  sourceCoords,
  destinationCoords,
  setDistance,
  setTime,
}) {
  return (
    <MapContainer
      center={[10.8505, 76.2711]}
      zoom={8}
      style={{ height: "500px", width: "100%" }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {sourceCoords && (
        <Marker position={sourceCoords}>
          <Popup>Source</Popup>
        </Marker>
      )}

      {destinationCoords && (
        <Marker position={destinationCoords}>
          <Popup>Destination</Popup>
        </Marker>
      )}

      {sourceCoords && destinationCoords && (
        <Routing
          sourceCoords={sourceCoords}
          destinationCoords={destinationCoords}
          setDistance={setDistance}
          setTime={setTime}
        />
      )}
    </MapContainer>
  );
}

export default MapView;