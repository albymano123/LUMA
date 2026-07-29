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

function Routing({ sourceCoords, destinationCoords }) {
  const map = useMap();

  useEffect(() => {
    if (!sourceCoords || !destinationCoords) return;

    const routingControl = L.Routing.control({
      waypoints: [
        L.latLng(sourceCoords[0], sourceCoords[1]),
        L.latLng(destinationCoords[0], destinationCoords[1]),
      ],
      lineOptions: {
        styles: [{ color: "blue", weight: 5 }],
      },
      routeWhileDragging: false,
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: true,
      show: false,
    }).addTo(map);

    return () => {
      map.removeControl(routingControl);
    };
  }, [map, sourceCoords, destinationCoords]);

  return null;
}

function MapView({ sourceCoords, destinationCoords }) {
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
        />
      )}
    </MapContainer>
  );
}

export default MapView;