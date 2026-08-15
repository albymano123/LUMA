import {
  useState,
  useEffect,
} from "react";


import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import RouteForm from "../components/RouteForm";
import MapView from "../components/MapView";
import Features from "../components/Features";
import RouteInfo from "../components/RouteInfo";
import WeatherInfo from "../components/WeatherInfo";
import SafetyScore from "../components/SafetyScore";
import EmergencySOS from "../components/EmergencySOS";
import MapLegend from "../components/MapLegend";
import RouteStatus from "../components/RouteStatus";
import Footer from "../components/Footer";
import RouteComparison from "../components/RouteComparison";


import { getSafeRoute } from "../Services/api";


function Home() {


  // ==================================================
  // SOURCE / DESTINATION
  // ==================================================

  const [source, setSource] =
    useState("");

  const [destination, setDestination] =
    useState("");


  // ==================================================
  // COORDINATES
  // ==================================================

  const [sourceCoords, setSourceCoords] =
    useState(null);

  const [destinationCoords, setDestinationCoords] =
    useState(null);


  // ==================================================
  // SELECTED ROUTE
  // ==================================================

  const [selectedRoute, setSelectedRoute] =
    useState(null);


  // ==================================================
  // ROUTE INFORMATION
  // ==================================================

  const [distance, setDistance] =
    useState("");

  const [time, setTime] =
    useState("");


  // ==================================================
  // WEATHER
  // ==================================================

  const [weather, setWeather] =
    useState(null);


  // ==================================================
  // EMERGENCY SERVICES
  // ==================================================

  const [hospitals, setHospitals] =
    useState([]);

  const [policeStations, setPoliceStations] =
    useState([]);


  // ==================================================
  // BACKEND RESULT
  // ==================================================

  const [safeRouteData, setSafeRouteData] =
    useState(null);


  // ==================================================
  // BACKEND LOADING / ERROR
  // ==================================================

  const [backendLoading, setBackendLoading] =
    useState(false);

  const [backendError, setBackendError] =
    useState("");


  // ==================================================
  // GET SAFE ROUTE
  // ==================================================

  const handleSafeRoute = async () => {


    if (
      !sourceCoords ||
      !destinationCoords
    ) {

      alert(
        "Please find a route first."
      );

      return;

    }


    try {

      setBackendLoading(true);

      setBackendError("");

      // Reset old backend data
      setSafeRouteData(null);

      // Reset old emergency markers
      setHospitals([]);

      setPoliceStations([]);


      console.log(
        "Sending route to FastAPI..."
      );


      console.log(
        "Source:",
        sourceCoords
      );


      console.log(
        "Destination:",
        destinationCoords
      );


      const result =
        await getSafeRoute(

          sourceCoords[0],

          sourceCoords[1],

          destinationCoords[0],

          destinationCoords[1]

        );


      console.log(
        "FastAPI response:",
        result
      );


      setSafeRouteData(
        result
      );


    } catch (error) {


      console.error(
        "Backend error:",
        error
      );


      // Show actual backend error
      if (
        error.response?.data
      ) {

        console.error(
          "Backend response:",
          error.response.data
        );

      }


      setBackendError(
        "Unable to analyze the route using the backend."
      );


    } finally {

      setBackendLoading(false);

    }

  };


  // ==================================================
  // GET EMERGENCY SERVICES FROM BACKEND ROUTES
  // ==================================================

  useEffect(() => {


    if (
      !safeRouteData?.routes
    ) {

      return;

    }


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
          Array.isArray(
            route.hospitals
          )
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
                  hospital
                );

              }

            }

          );

        }


        // --------------------------------------------
        // POLICE
        // --------------------------------------------

        if (
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
                  station
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


    const routePolice =
      Array.from(
        policeMap.values()
      );


    console.log(
      "Hospitals along routes:",
      routeHospitals.length
    );


    console.log(
      "Police stations along routes:",
      routePolice.length
    );


    setHospitals(
      routeHospitals
    );


    setPoliceStations(
      routePolice
    );


  }, [
    safeRouteData
  ]);


  // ==================================================
  // PAGE
  // ==================================================

  return (

    <>


      <Navbar />

      <Hero />


      {/* ==========================================
          ROUTE FORM
      ========================================== */}

      <RouteForm

        source={source}

        setSource={setSource}

        destination={destination}

        setDestination={setDestination}

        setSourceCoords={setSourceCoords}

        setDestinationCoords={
          setDestinationCoords
        }

      />


      {/* ==========================================
          ROUTE STATUS
      ========================================== */}

      <RouteStatus

        sourceCoords={
          sourceCoords
        }

        destinationCoords={
          destinationCoords
        }

        distance={
          distance
        }

      />


      {/* ==========================================
          MAP
      ========================================== */}

      <MapView

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

        safeRouteData={
          safeRouteData
        }

        selectedRoute={
          selectedRoute
        }

      />


      <MapLegend />


      {/* ==========================================
          ROUTE INFORMATION
      ========================================== */}

      <RouteInfo

        distance={
          distance
        }

        time={
          time
        }

      />


      {/* ==========================================
          WEATHER
      ========================================== */}

      <WeatherInfo

        weather={
          weather
        }

      />


      {/* ==========================================
          SAFETY
      ========================================== */}

      <SafetyScore

        weather={
          weather
        }

        hospitals={
          hospitals
        }

        policeStations={
          policeStations
        }

      />


      {/* ==========================================
          BACKEND BUTTON
      ========================================== */}

      {
        sourceCoords &&
        destinationCoords && (

          <div
            style={{
              textAlign:
                "center",

              margin:
                "25px",
            }}
          >

            <button

              onClick={
                handleSafeRoute
              }

              disabled={
                backendLoading
              }

            >

              {
                backendLoading

                  ? "Analyzing Route..."

                  : "Analyze Route with Backend"

              }

            </button>

          </div>

        )
      }


      {/* ==========================================
          ERROR
      ========================================== */}

      {
        backendError && (

          <div
            style={{
              textAlign:
                "center",

              margin:
                "20px",

              color:
                "red",
            }}
          >

            <p>
              {backendError}
            </p>

          </div>

        )
      }


      {/* ==========================================
          BACKEND ANALYSIS
      ========================================== */}

      {
        safeRouteData && (

          <div
            style={{
              textAlign:
                "center",

              margin:
                "25px",
            }}
          >

            <h2>
              Backend Route Analysis
            </h2>


            <p>
              Routes Found:{" "}

              {
                safeRouteData.total_routes
              }

            </p>


            {
              safeRouteData
                .recommended_route && (

                <>

                  <h3>
                    Recommended Route
                  </h3>


                  <p>

                    {
                      safeRouteData
                        .recommended_route
                        .name
                    }

                  </p>


                  <p>

                    Safety Score:{" "}

                    {
                      safeRouteData
                        .recommended_route
                        .safety_score
                    }

                  </p>


                  <p>

                    Risk Level:{" "}

                    {
                      safeRouteData
                        .recommended_route
                        .risk_level
                    }

                  </p>


                  <p>

                    Distance:{" "}

                    {
                      safeRouteData
                        .recommended_route
                        .distance_km
                    }{" "}
                    km

                  </p>


                  <p>

                    Duration:{" "}

                    {
                      safeRouteData
                        .recommended_route
                        .duration_min
                    }{" "}
                    minutes

                  </p>

                </>

              )
            }

          </div>

        )
      }


      {/* ==========================================
          ROUTE COMPARISON
      ========================================== */}

      <RouteComparison

        safeRouteData={
          safeRouteData
        }

        selectedRoute={
          selectedRoute
        }

        setSelectedRoute={
          setSelectedRoute
        }

      />


      <EmergencySOS />

      <Features />

      <Footer />


    </>

  );

}


export default Home;