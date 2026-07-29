import { useState } from "react";
import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import RouteForm from "../components/RouteForm";
import MapView from "../components/MapView";
import Features from "../components/Features";

function Home() {
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [sourceCoords, setSourceCoords] = useState(null);
const [destinationCoords, setDestinationCoords] = useState(null);

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
  source={source}
  destination={destination}
/>

      <Features />
    </>
  );
}

export default Home;