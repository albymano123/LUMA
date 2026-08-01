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

import { searchNearbyEmergencyServices } from "../Services/overpassService";
import { getWeather } from "../Services/weatherService";

// Hospital Icon
const hospitalIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// Police Icon
const policeIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

function Routing({
  sourceCoords,
  destinationCoords,
  setDistance,
  setTime,
  setHospitals,
  setPoliceStations,
  setWeather,
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

    routingControl.on("routesfound", async (e) => {
      const route = e.routes[0];

      const distance = (
        route.summary.totalDistance / 1000
      ).toFixed(2);

      const time = Math.round(
        route.summary.totalTime / 60
      );

      setDistance(distance);
      setTime(time);

      try {
        // Hospitals + Police
        const services = await searchNearbyEmergencyServices(
          sourceCoords[0],
          sourceCoords[1]
        );

        if (services.success) {
          setHospitals(services.hospitals);
          setPoliceStations(services.policeStations);

          console.log("Hospitals:", services.hospitals);
          console.log("Police:", services.policeStations);
        } else {
          console.warn(
            "Overpass request failed. Keeping existing emergency markers."
          );
        }

        // Weather
        const weatherData = await getWeather(
          destinationCoords[0],
          destinationCoords[1]
        );

        console.log("Weather:", weatherData);

        if (weatherData) {
          setWeather(weatherData);
        }
      } catch (error) {
        console.error(error);
      }
    });

    return () => {
      try {
        if (routingControl) {
          map.removeControl(routingControl);
        }
      } catch (err) {
        console.log("Routing control already removed.");
      }
    };
  }, [
    map,
    sourceCoords,
    destinationCoords,
    setDistance,
    setTime,
    setHospitals,
    setPoliceStations,
    setWeather,
  ]);

  return null;
}
function MapView({
  sourceCoords,
  destinationCoords,
  hospitals = [],
  policeStations = [],
  setHospitals,
  setPoliceStations,
  setDistance,
  setTime,
  setWeather,
}) {
  return (
    <MapContainer
      center={[10.8505, 76.2711]}
      zoom={8}
      style={{
        height: "500px",
        width: "100%",
      }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* SOURCE */}
      {sourceCoords && (
        <Marker position={sourceCoords}>
          <Popup>📍 Source</Popup>
        </Marker>
      )}

      {/* DESTINATION */}
      {destinationCoords && (
        <Marker position={destinationCoords}>
          <Popup>📍 Destination</Popup>
        </Marker>
      )}

      {/* HOSPITALS */}
      {hospitals
        .filter((hospital) => {
          const lat =
            hospital.lat ?? hospital.center?.lat;

          const lon =
            hospital.lon ?? hospital.center?.lon;

          return lat != null && lon != null;
        })
        .map((hospital) => {
          const lat =
            hospital.lat ?? hospital.center?.lat;

          const lon =
            hospital.lon ?? hospital.center?.lon;

          return (
            <Marker
              key={`hospital-${hospital.type}-${hospital.id}`}
              position={[lat, lon]}
              icon={hospitalIcon}
            >
              <Popup>
                <strong>
                  🏥{" "}
                  {hospital.tags?.name ||
                    "Unnamed Hospital"}
                </strong>
              </Popup>
            </Marker>
          );
        })}

      {/* POLICE */}
      {policeStations
        .filter((station) => {
          const lat =
            station.lat ?? station.center?.lat;

          const lon =
            station.lon ?? station.center?.lon;

          return lat != null && lon != null;
        })
        .map((station) => {
          const lat =
            station.lat ?? station.center?.lat;

          const lon =
            station.lon ?? station.center?.lon;

          return (
            <Marker
              key={`police-${station.type}-${station.id}`}
              position={[lat, lon]}
              icon={policeIcon}
            >
              <Popup>
                <strong>
                  👮{" "}
                  {station.tags?.name ||
                    "Police Station"}
                </strong>
              </Popup>
            </Marker>
          );
        })}

      {/* ROUTE */}
      {sourceCoords && destinationCoords && (
        <Routing
          sourceCoords={sourceCoords}
          destinationCoords={destinationCoords}
          setDistance={setDistance}
          setTime={setTime}
          setHospitals={setHospitals}
          setPoliceStations={setPoliceStations}
          setWeather={setWeather}
        />
      )}
    </MapContainer>
  );
}

export default MapView;