import { useState } from "react";

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

// FastAPI connection
import { getSafeRoute } from "../Services/api";


function Home() {

  // ==================================================
  // SOURCE AND DESTINATION TEXT
  // ==================================================

  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");


  // ==================================================
  // SOURCE AND DESTINATION COORDINATES
  //
  // Format used by RouteForm:
  // [latitude, longitude]
  // ==================================================

  const [sourceCoords, setSourceCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);


  // ==================================================
  // ROUTE INFORMATION
  // ==================================================

  const [distance, setDistance] = useState("");
  const [time, setTime] = useState("");


  // ==================================================
  // WEATHER
  // ==================================================

  const [weather, setWeather] = useState(null);


  // ==================================================
  // EMERGENCY SERVICES
  // ==================================================

  const [hospitals, setHospitals] = useState([]);
  const [policeStations, setPoliceStations] = useState([]);


  // ==================================================
  // BACKEND SAFE ROUTE RESULT
  // ==================================================

  const [safeRouteData, setSafeRouteData] = useState(null);

  // Used to show loading state
  const [backendLoading, setBackendLoading] = useState(false);

  // Used to display backend errors
  const [backendError, setBackendError] = useState("");


  // ==================================================
  // GET SAFE ROUTE FROM FASTAPI
  // ==================================================

  const handleSafeRoute = async () => {

    // Make sure coordinates exist first
    if (!sourceCoords || !destinationCoords) {
      alert("Please find a route first.");
      return;
    }

    try {

      setBackendLoading(true);
      setBackendError("");

      console.log("Sending route to FastAPI...");
      console.log("Source:", sourceCoords);
      console.log("Destination:", destinationCoords);


      // IMPORTANT:
      //
      // RouteForm stores coordinates like:
      //
      // [latitude, longitude]
      //
      // Therefore:
      //
      // [0] = latitude
      // [1] = longitude

      const result = await getSafeRoute(
        sourceCoords[0],
        sourceCoords[1],
        destinationCoords[0],
        destinationCoords[1]
      );


      console.log(
        "Safe route result from FastAPI:",
        result
      );


      // Store FastAPI result in React
      setSafeRouteData(result);

    } catch (error) {

      console.error(
        "Failed to get safe route:",
        error
      );

      setBackendError(
        "Unable to analyze the route using the backend."
      );

    } finally {

      setBackendLoading(false);

    }
  };


  // ==================================================
  // PAGE
  // ==================================================

  return (
    <>

      <Navbar />

      <Hero />


      {/* ==========================================
          EXISTING ROUTE FORM
      ========================================== */}

      <RouteForm
        source={source}
        setSource={setSource}

        destination={destination}
        setDestination={setDestination}

        setSourceCoords={setSourceCoords}
        setDestinationCoords={setDestinationCoords}
      />


      {/* ==========================================
          EXISTING ROUTE STATUS
      ========================================== */}

      <RouteStatus
        sourceCoords={sourceCoords}
        destinationCoords={destinationCoords}
        distance={distance}
      />


      {/* ==========================================
          EXISTING MAP
      ========================================== */}

      <MapView
  sourceCoords={sourceCoords}
  destinationCoords={destinationCoords}

  hospitals={hospitals}
  policeStations={policeStations}

  setHospitals={setHospitals}
  setPoliceStations={setPoliceStations}

  setDistance={setDistance}
  setTime={setTime}

  setWeather={setWeather}

  safeRouteData={safeRouteData}
/>


      <MapLegend />


      {/* ==========================================
          EXISTING ROUTE INFORMATION
      ========================================== */}

      <RouteInfo
        distance={distance}
        time={time}
      />


      {/* ==========================================
          EXISTING WEATHER
      ========================================== */}

      <WeatherInfo
        weather={weather}
      />


      {/* ==========================================
          EXISTING SAFETY SCORE
      ========================================== */}

      <SafetyScore
        weather={weather}
        hospitals={hospitals}
        policeStations={policeStations}
      />


      {/* ==========================================
          TEMPORARY BACKEND CONNECTION

          Only appears after source and
          destination coordinates exist.
      ========================================== */}

      {sourceCoords && destinationCoords && (

        <div
          style={{
            textAlign: "center",
            margin: "25px"
          }}
        >

          <button
            onClick={handleSafeRoute}
            disabled={backendLoading}
          >

            {backendLoading
              ? "Analyzing Route..."
              : "Analyze Route with Backend"}

          </button>

        </div>

      )}


      {/* ==========================================
          BACKEND ERROR
      ========================================== */}

      {backendError && (

        <div
          style={{
            textAlign: "center",
            margin: "20px"
          }}
        >

          <p>{backendError}</p>

        </div>

      )}


      {/* ==========================================
          BACKEND RESULT

          Temporary display so we can SEE that
          React received data from FastAPI.
      ========================================== */}

      {safeRouteData && (

        <div
          style={{
            textAlign: "center",
            margin: "25px"
          }}
        >

          <h2>
            Backend Route Analysis
          </h2>


          <p>
            Routes Found:{" "}
            {safeRouteData.total_routes}
          </p>


          {safeRouteData.recommended_route && (

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

          )}

        </div>

      )}


      {/* ==========================================
          EXISTING COMPONENTS
      ========================================== */}

      <EmergencySOS />

      <Features />

      <Footer />

    </>
  );
}


export default Home;