import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function MapView({ sourceCoords, destinationCoords }) {

  console.log("Map Source:", sourceCoords);
  console.log("Map Destination:", destinationCoords);

  
  return (
    <MapContainer
      center={[10.8505, 76.2711]}
      zoom={8}
      style={{ height: "500px", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
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
    </MapContainer>
  );
}

export default MapView;