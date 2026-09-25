import Navbar from "../layout/Navbar";
import Footer from "../layout/Footer";
import { Hero, TrustStrip } from "./landing/Hero";
import { Awareness, ComparisonDemo, SafetyIntelligence } from "./landing/Interactive";
import { FinalCta, HowItWorks, Journeys, Why } from "./landing/Sections";
import "./landing/landing.css";

export default function Home() {
  return (
    <div className="lp-page">
      <Navbar />

      <main id="main">
        <Hero />
        <TrustStrip />
        <Why />
        <HowItWorks />
        <SafetyIntelligence />
        <ComparisonDemo />
        <Awareness />
        <Journeys />
        <FinalCta />
      </main>

      <Footer />
    </div>
  );
}
