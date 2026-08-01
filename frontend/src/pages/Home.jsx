import { useState } from "react";
import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import RouteForm from "../components/RouteForm";
import MapView from "../components/MapView";
import Features from "../components/Features";
import RouteInfo from "../components/RouteInfo";
import WeatherInfo from "../components/WeatherInfo";
import SafetyScore from "../components/SafetyScore";
function Home() {
  // Route Input
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
const [weather, setWeather] = useState(null);
  // Route Coordinates
  const [sourceCoords, setSourceCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);

  // Route Information
  const [distance, setDistance] = useState("");
  const [time, setTime] = useState("");

  // Nearby Hospitals
  const [hospitals, setHospitals] = useState([]);

  // Nearby Police Stations
  const [policeStations, setPoliceStations] = useState([]);

  return (
    <>
      <Navbar />
      <Hero />

      <RouteForm
        source={source}
        setSource={setSource}
        destination={destination}
        setDestination={setDestination}
        setSourceCoords={setSourceCoords}
        setDestinationCoords={setDestinationCoords}
      />
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
/>

<RouteInfo
  distance={distance}
  time={time}
/>

<WeatherInfo weather={weather} />

<SafetyScore
  weather={weather}
  hospitals={hospitals}
  policeStations={policeStations}
/>

<Features />
    </>
  );
}

export default Home;