import { useEffect } from "react";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

import "leaflet-routing-machine";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

import { searchNearbyEmergencyServices } from "../Services/overpassService";
import { getWeather } from "../Services/weatherService";


// ==================================================
// HOSPITAL ICON
// ==================================================

const hospitalIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",

  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",

  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});


// ==================================================
// POLICE ICON
// ==================================================

const policeIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",

  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",

  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});


// ==================================================
// EXISTING FRONTEND ROUTING
//
// This is your original Leaflet Routing Machine
// functionality.
//
// We use this BEFORE backend analysis.
// ==================================================

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

    if (!sourceCoords || !destinationCoords) {
      return;
    }


    const routingControl = L.Routing.control({

      waypoints: [

        L.latLng(
          sourceCoords[0],
          sourceCoords[1]
        ),

        L.latLng(
          destinationCoords[0],
          destinationCoords[1]
        ),

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



    routingControl.on(
      "routesfound",

      async (e) => {

        const route = e.routes[0];


        // ------------------------------------------
        // DISTANCE
        // ------------------------------------------

        const distance = (
          route.summary.totalDistance / 1000
        ).toFixed(2);


        // ------------------------------------------
        // TIME
        // ------------------------------------------

        const time = Math.round(
          route.summary.totalTime / 60
        );


        setDistance(distance);

        setTime(time);



        try {

          // ========================================
          // HOSPITALS + POLICE
          // ========================================

          const services =
            await searchNearbyEmergencyServices(

              sourceCoords[0],

              sourceCoords[1]

            );


          if (services.success) {

            setHospitals(
              services.hospitals
            );

            setPoliceStations(
              services.policeStations
            );


            console.log(
              "Hospitals:",
              services.hospitals
            );


            console.log(
              "Police:",
              services.policeStations
            );

          } else {

            console.warn(
              "Overpass request failed."
            );

          }



          // ========================================
          // WEATHER
          // ========================================

          const weatherData =
            await getWeather(

              destinationCoords[0],

              destinationCoords[1]

            );


          console.log(
            "Weather:",
            weatherData
          );


          if (weatherData) {

            setWeather(
              weatherData
            );

          }


        } catch (error) {

          console.error(error);

        }

      }

    );


    // Remove routing control when component changes
    return () => {

      try {

        map.removeControl(
          routingControl
        );

      } catch {

        console.log(
          "Routing control already removed."
        );

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


// ==================================================
// BACKEND ROUTES
//
// Draw routes returned by FastAPI.
// ==================================================

function BackendRoutes({
  safeRouteData,
}) {

  const map = useMap();


  useEffect(() => {

    if (
      !safeRouteData ||
      !safeRouteData.routes ||
      safeRouteData.routes.length === 0
    ) {
      return;
    }


    // ----------------------------------------------
    // FIT MAP TO ALL BACKEND ROUTES
    // ----------------------------------------------

    const allPoints = [];


    safeRouteData.routes.forEach(
      (route) => {

        const coordinates =
          route.geometry?.coordinates;


        if (!coordinates) {
          return;
        }


        coordinates.forEach(
          ([longitude, latitude]) => {

            allPoints.push([
              latitude,
              longitude,
            ]);

          }
        );

      }
    );


    if (allPoints.length > 0) {

      map.fitBounds(
        allPoints,
        {
          padding: [30, 30],
        }
      );

    }


  }, [
    map,
    safeRouteData,
  ]);



  if (
    !safeRouteData ||
    !safeRouteData.routes
  ) {

    return null;

  }



  return (

    <>

      {safeRouteData.routes.map(
        (route, index) => {


          // ----------------------------------------
          // GET OSRM GEOMETRY
          // ----------------------------------------

          const coordinates =
            route.geometry?.coordinates;


          if (!coordinates) {

            return null;

          }



          // ----------------------------------------
          // OSRM:
          //
          // [longitude, latitude]
          //
          // Leaflet:
          //
          // [latitude, longitude]
          //
          // Therefore we reverse the order.
          // ----------------------------------------

          const positions =
            coordinates.map(

              ([longitude, latitude]) => [

                latitude,

                longitude,

              ]

            );



          // ----------------------------------------
          // CHECK IF THIS IS RECOMMENDED ROUTE
          // ----------------------------------------

          const isRecommended =

            safeRouteData
              .recommended_route
              ?.name === route.name;



          return (

            <Polyline

              key={`backend-route-${index}`}

              positions={positions}


              pathOptions={{

                // Recommended route = green
                // Other routes = gray

                color: isRecommended
                  ? "green"
                  : "gray",


                // Recommended route is thicker

                weight: isRecommended
                  ? 7
                  : 4,


                // Other routes slightly transparent

                opacity: isRecommended
                  ? 1
                  : 0.6,

              }}

            >

              <Popup>

                <div>

                  <strong>

                    {route.name}

                    {isRecommended &&
                      " ⭐ Recommended"}

                  </strong>


                  <br />


                  Safety Score:{" "}

                  {route.safety_score}


                  <br />


                  Risk Level:{" "}

                  {route.risk_level}


                  <br />


                  Distance:{" "}

                  {route.distance_km} km


                  <br />


                  Duration:{" "}

                  {route.duration_min} min

                </div>

              </Popup>

            </Polyline>

          );

        }

      )}

    </>

  );

}


// ==================================================
// MAIN MAP
// ==================================================

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

  // NEW
  safeRouteData,

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


      {/* ==========================================
          OPENSTREETMAP
      ========================================== */}

      <TileLayer

        attribution="&copy; OpenStreetMap contributors"

        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"

      />



      {/* ==========================================
          SOURCE
      ========================================== */}

      {sourceCoords && (

        <Marker
          position={sourceCoords}
        >

          <Popup>
            📍 Source
          </Popup>

        </Marker>

      )}



      {/* ==========================================
          DESTINATION
      ========================================== */}

      {destinationCoords && (

        <Marker
          position={destinationCoords}
        >

          <Popup>
            📍 Destination
          </Popup>

        </Marker>

      )}



      {/* ==========================================
          HOSPITALS
      ========================================== */}

      {hospitals

        .filter((hospital) => {

          const lat =
            hospital.lat ??
            hospital.center?.lat;


          const lon =
            hospital.lon ??
            hospital.center?.lon;


          return (
            lat != null &&
            lon != null
          );

        })


        .map((hospital) => {


          const lat =
            hospital.lat ??
            hospital.center?.lat;


          const lon =
            hospital.lon ??
            hospital.center?.lon;


          return (

            <Marker

              key={
                `hospital-${hospital.type}-${hospital.id}`
              }

              position={[
                lat,
                lon,
              ]}

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



      {/* ==========================================
          POLICE STATIONS
      ========================================== */}

      {policeStations

        .filter((station) => {

          const lat =
            station.lat ??
            station.center?.lat;


          const lon =
            station.lon ??
            station.center?.lon;


          return (
            lat != null &&
            lon != null
          );

        })


        .map((station) => {


          const lat =
            station.lat ??
            station.center?.lat;


          const lon =
            station.lon ??
            station.center?.lon;


          return (

            <Marker

              key={
                `police-${station.type}-${station.id}`
              }

              position={[
                lat,
                lon,
              ]}

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



      {/* ==========================================
          ORIGINAL FRONTEND ROUTE

          Only show this BEFORE backend analysis.
      ========================================== */}

      {sourceCoords &&
        destinationCoords &&
        !safeRouteData && (

          <Routing

            sourceCoords={
              sourceCoords
            }

            destinationCoords={
              destinationCoords
            }

            setDistance={
              setDistance
            }

            setTime={
              setTime
            }

            setHospitals={
              setHospitals
            }

            setPoliceStations={
              setPoliceStations
            }

            setWeather={
              setWeather
            }

          />

        )}



      {/* ==========================================
          FASTAPI ROUTES

          Once backend analysis finishes,
          these replace the old blue route.
      ========================================== */}

      {safeRouteData && (

        <BackendRoutes

          safeRouteData={
            safeRouteData
          }

        />

      )}


    </MapContainer>

  );

}


export default MapView;