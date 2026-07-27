import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import Features from "../components/Features";
import Button from "../components/Button";
import Counter from "../components/Counter";
import RouteForm from "../components/RouteForm";

function Home() {
  return (
    <>
      <Navbar />
      <Hero />

      <Button text="Login" />
      <Button text="Register" />
      <Button text="Emergency" />

      <Counter />

      <RouteForm />

      <Features />
    </>
  );
}

export default Home;