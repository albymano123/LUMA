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
// GET LATITUDE / LONGITUDE FROM OSM OBJECT
// ==================================================

function getElementPosition(element) {

  // ----------------------------------------------
  // NODE
  // ----------------------------------------------

  if (
    element?.lat != null &&
    element?.lon != null
  ) {

    return [
      Number(element.lat),
      Number(element.lon),
    ];

  }


  // ----------------------------------------------
  // WAY
  //
  // Overpass returns the center for ways because
  // our backend uses:
  //
  // out center;
  // ----------------------------------------------

  if (
    element?.center?.lat != null &&
    element?.center?.lon != null
  ) {

    return [
      Number(element.center.lat),
      Number(element.center.lon),
    ];

  }


  return null;
}


// ==================================================
// ORIGINAL FRONTEND ROUTING
//
// This route is shown before backend analysis.
//
// IMPORTANT:
// Emergency services are NO LONGER searched here.
// The backend now searches along the actual route.
// ==================================================

function Routing({

  sourceCoords,

  destinationCoords,

  setDistance,

  setTime,

  setWeather,

}) {

  const map = useMap();


  useEffect(() => {

    if (
      !sourceCoords ||
      !destinationCoords
    ) {

      return;

    }


    // ----------------------------------------------
    // CREATE ROUTING CONTROL
    // ----------------------------------------------

    const routingControl =
      L.Routing.control({

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


    // ----------------------------------------------
    // ROUTE FOUND
    // ----------------------------------------------

    routingControl.on(
      "routesfound",

      async (e) => {

        const route =
          e.routes[0];


        // ------------------------------------------
        // DISTANCE
        // ------------------------------------------

        const distance = (

          route.summary.totalDistance
          / 1000

        ).toFixed(2);


        // ------------------------------------------
        // TIME
        // ------------------------------------------

        const time = Math.round(

          route.summary.totalTime
          / 60

        );


        setDistance(
          distance
        );

        setTime(
          time
        );


        // ------------------------------------------
        // WEATHER
        //
        // We keep the existing weather behaviour.
        // Emergency services are handled by backend.
        // ------------------------------------------

        try {

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

          console.error(
            "Weather error:",
            error
          );

        }

      }

    );


    // ----------------------------------------------
    // CLEANUP
    // ----------------------------------------------

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

    setWeather,

  ]);


  return null;
}


// ==================================================
// BACKEND ROUTES + ROUTE-BASED EMERGENCY SERVICES
// ==================================================

function BackendRoutes({

  safeRouteData,

  selectedRoute,

}) {

  const map = useMap();


  // ==================================================
  // FIT MAP TO ALL ROUTES
  // ==================================================

  useEffect(() => {

    if (
      !safeRouteData ||
      !safeRouteData.routes ||
      safeRouteData.routes.length === 0
    ) {

      return;

    }


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


  // ==================================================
  // NO BACKEND DATA
  // ==================================================

  if (
    !safeRouteData ||
    !safeRouteData.routes
  ) {

    return null;

  }


  // ==================================================
  // DETERMINE WHICH ROUTE SHOULD BE HIGHLIGHTED
  // ==================================================

  const highlightedRoute =
    selectedRoute ||

    safeRouteData
      .recommended_route
      ?.name;


  // ==================================================
  // COLLECT EMERGENCY SERVICES FROM ALL ROUTES
  // ==================================================

  const hospitalMap =
    new Map();

  const policeMap =
    new Map();


  safeRouteData.routes.forEach(
    (route) => {

      // --------------------------------------------
      // HOSPITALS
      // --------------------------------------------

      if (
        route.hospitals &&
        Array.isArray(route.hospitals)
      ) {

        route.hospitals.forEach(
          (hospital) => {

            const key =
              `${hospital.type}-${hospital.id}`;


            if (
              !hospitalMap.has(key)
            ) {

              hospitalMap.set(
                key,
                {
                  ...hospital,

                  routeName:
                    route.name,
                }
              );

            }

          }
        );

      }


      // --------------------------------------------
      // POLICE
      // --------------------------------------------

      if (
        route.police_stations &&
        Array.isArray(
          route.police_stations
        )
      ) {

        route.police_stations.forEach(
          (station) => {

            const key =
              `${station.type}-${station.id}`;


            if (
              !policeMap.has(key)
            ) {

              policeMap.set(
                key,
                {
                  ...station,

                  routeName:
                    route.name,
                }
              );

            }

          }
        );

      }

    }
  );


  const routeHospitals =
    Array.from(
      hospitalMap.values()
    );


  const routePoliceStations =
    Array.from(
      policeMap.values()
    );


  return (

    <>

      {/* ==========================================
          ROUTES
      ========================================== */}

      {safeRouteData.routes.map(
        (route, index) => {

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
          // ----------------------------------------

          const positions =
            coordinates.map(

              ([longitude, latitude]) => [

                latitude,

                longitude,

              ]

            );


          // ----------------------------------------
          // CHECK HIGHLIGHT
          // ----------------------------------------

          const isHighlighted =
            highlightedRoute ===
            route.name;


          // ----------------------------------------
          // CHECK RECOMMENDED
          // ----------------------------------------

          const isRecommended =

            safeRouteData
              .recommended_route
              ?.name ===
            route.name;


          return (

            <Polyline

              key={
                `backend-route-${index}`
              }

              positions={
                positions
              }


              pathOptions={{

                color:
                  isHighlighted
                    ? "green"
                    : "gray",


                weight:
                  isHighlighted
                    ? 7
                    : 4,


                opacity:
                  isHighlighted
                    ? 1
                    : 0.55,

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

                  {route.safety_score ??
                    "N/A"}


                  <br />


                  Risk Level:{" "}

                  {route.risk_level ??
                    "N/A"}


                  <br />


                  Distance:{" "}

                  {route.distance_km ??
                    "N/A"}{" "}

                  km


                  <br />


                  Duration:{" "}

                  {route.duration_min ??
                    "N/A"}{" "}

                  min


                  <br />


                  🏥 Hospitals:{" "}

                  {route.hospital_count ??
                    route.hospitals?.length ??
                    0}


                  <br />


                  👮 Police Stations:{" "}

                  {route.police_station_count ??
                    route.police_stations?.length ??
                    0}

                </div>

              </Popup>

            </Polyline>

          );

        }

      )}


      {/* ==========================================
          HOSPITAL MARKERS
      ========================================== */}

      {routeHospitals

        .map(
          (hospital) => {

            const position =
              getElementPosition(
                hospital
              );


            if (!position) {

              return null;

            }


            return (

              <Marker

                key={
                  `route-hospital-${hospital.type}-${hospital.id}`
                }

                position={
                  position
                }

                icon={
                  hospitalIcon
                }

              >

                <Popup>

                  <strong>

                    🏥{" "}

                    {
                      hospital
                        .tags
                        ?.name ||
                      "Unnamed Hospital"
                    }

                  </strong>


                  <br />


                  Near:{" "}

                  {
                    hospital.routeName
                  }

                  <br />


                  <small>
                    Hospital along analyzed route
                  </small>

                </Popup>

              </Marker>

            );

          }

        )}


      {/* ==========================================
          POLICE MARKERS
      ========================================== */}

      {routePoliceStations

        .map(
          (station) => {

            const position =
              getElementPosition(
                station
              );


            if (!position) {

              return null;

            }


            return (

              <Marker

                key={
                  `route-police-${station.type}-${station.id}`
                }

                position={
                  position
                }

                icon={
                  policeIcon
                }

              >

                <Popup>

                  <strong>

                    👮{" "}

                    {
                      station
                        .tags
                        ?.name ||
                      "Police Station"
                    }

                  </strong>


                  <br />


                  Near:{" "}

                  {
                    station.routeName
                  }

                  <br />


                  <small>
                    Police station along analyzed route
                  </small>

                </Popup>

              </Marker>

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

  setDistance,

  setTime,

  setWeather,

  safeRouteData,

  selectedRoute,

}) {


  return (

    <MapContainer

      center={[
        10.8505,
        76.2711,
      ]}

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
          position={
            sourceCoords
          }
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
          position={
            destinationCoords
          }
        >

          <Popup>

            🏁 Destination

          </Popup>

        </Marker>

      )}


      {/* ==========================================
          OLD FRONTEND ROUTE
          
          This appears only BEFORE backend analysis.
          
          Once safeRouteData exists, backend routes
          replace it.
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

            setWeather={
              setWeather
            }

          />

        )}


      {/* ==========================================
          BACKEND ROUTES

          Includes:

          • Alternative routes
          • Recommended route
          • Hospitals along routes
          • Police stations along routes
      ========================================== */}

      {safeRouteData && (

        <BackendRoutes

          safeRouteData={
            safeRouteData
          }

          selectedRoute={
            selectedRoute
          }

        />

      )}

    </MapContainer>

  );

}


export default MapView;