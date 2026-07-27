import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import RouteForm from "../components/RouteForm";
import Features from "../components/Features";
import MapView from "../components/MapView";
function Home() {
  return (
    <>
      <Navbar />
      <Hero />
      <RouteForm />
      <Features />
      <MapView />
    </>
  );
}

export default Home;