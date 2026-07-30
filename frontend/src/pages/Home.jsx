import { useState } from "react";
import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import RouteForm from "../components/RouteForm";
import MapView from "../components/MapView";
import Features from "../components/Features";
import RouteInfo from "../components/RouteInfo";

function Home() {
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");

  const [sourceCoords, setSourceCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);

  // NEW STATES
  const [distance, setDistance] = useState("");
  const [time, setTime] = useState("");

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
        setDistance={setDistance}
        setTime={setTime}
      />

      <RouteInfo
        distance={distance}
        time={time}
      />

      <Features />
    </>
  );
}

export default Home;