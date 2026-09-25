import { Link } from "react-router-dom";
import {
  ArrowRight,
  Baby,
  Building2,
  Eye,
  Footprints,
  Globe2,
  HeartHandshake,
  ListChecks,
  MapPin,
  Moon,
  Route,
  Scale,
  ShieldCheck,
  Navigation,
  Layers,
} from "lucide-react";

import { Button, Reveal, SectionHeader } from "../../ui";

const WHY = [
  {
    icon: <Route size={22} aria-hidden="true" />,
    title: "Fastest isn't always best",
    text: "Most navigation optimises for time. LumaPath also weighs what surrounds each route, so you can trade a few minutes for a calmer way when it matters.",
  },
  {
    icon: <ListChecks size={22} aria-hidden="true" />,
    title: "Explained, not just scored",
    text: "Every score comes with reasons you can read: what helps a route, what hurts it, and how much each factor counts.",
  },
  {
    icon: <Eye size={22} aria-hidden="true" />,
    title: "Honest about what it doesn't know",
    text: "If lighting or weather data is missing, that factor is left out and confidence drops. Missing data is never counted as zero, and never guessed.",
  },
];

export function Why() {
  return (
    <section className="section section--white" aria-labelledby="why-title">
      <div className="container">
        <div className="section__head">
          <Reveal>
            <SectionHeader
              id="why-title"
              eyebrow="Why LumaPath"
              title="Navigation that considers more than just speed."
              lead="A safer choice starts with seeing the whole picture of a route, not only its length."
            />
          </Reveal>
        </div>

        <div className="why-grid">
          {WHY.map((item, index) => (
            <Reveal key={item.title} delay={index * 0.08} className="why-card">
              <div className="icon-tile">{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { icon: <MapPin size={20} />, title: "Enter your destination", text: "Search a start and destination, or use your current location. Choose walking, cycling or driving." },
  { icon: <Route size={20} />, title: "Find routes", text: "Up to five genuinely different routes are generated, and near-duplicates and absurd detours are dropped." },
  { icon: <Layers size={20} />, title: "Collect map and weather data", text: "Roads, buildings, hospitals, police, fire stations and live weather are gathered for every route at once." },
  { icon: <ShieldCheck size={20} />, title: "Analyse route safety", text: "Six factors are measured along each route and combined into a score, with a confidence level." },
  { icon: <Scale size={20} />, title: "Compare alternatives", text: "See scores side by side, with the reasons: what supports each one, and what data is missing." },
  { icon: <Navigation size={20} />, title: "Choose your route", text: "Pick Safest, Balanced or Time-efficient. What you select and what is recommended are shown separately." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section section--tint" aria-labelledby="how-title">
      <div className="container">
        <div className="section__head">
          <Reveal>
            <SectionHeader
              id="how-title"
              eyebrow="How it works"
              title="From a destination to a decision, in six steps."
              lead="Everything happens in a few seconds, and every step is visible in the results."
            />
          </Reveal>
        </div>

        <ol className="steps" role="list">
          {STEPS.map((step, index) => (
            <Reveal
              as="li"
              key={step.title}
              delay={index * 0.09}
              className="step"
              style={{ "--line-delay": `${0.4 + index * 0.09}s` }}
            >
              <div className="step__top">
                <span className="step__number" aria-hidden="true">{index + 1}</span>
                <span className="step__icon" aria-hidden="true">{step.icon}</span>
              </div>
              <h3 style={{ fontSize: "var(--fs-h4)" }}>{step.title}</h3>
              <p>{step.text}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

const JOURNEYS = [
  { icon: <Moon size={20} aria-hidden="true" />, title: "Walking home after dark", text: "Compare routes by how built-up and busy they are, and see where lighting is mapped." },
  { icon: <Globe2 size={20} aria-hidden="true" />, title: "Exploring somewhere new", text: "See nearby hospitals and police before you set out, with distances and phone numbers where mapped." },
  { icon: <Baby size={20} aria-hidden="true" />, title: "Travelling with children", text: "Prefer routes that stay off fast main roads and check the weather along the way." },
  { icon: <HeartHandshake size={20} aria-hidden="true" />, title: "Looking out for family", text: "Understand the route an older relative will take, and keep emergency numbers one tap away." },
];

export function Journeys() {
  return (
    <section className="section section--white" aria-labelledby="journeys-title">
      <div className="container">
        <div className="section__head">
          <Reveal>
            <SectionHeader
              id="journeys-title"
              eyebrow="Designed for real-world journeys"
              title="Made for the trips that deserve a second look."
              lead="LumaPath supports your judgement. It doesn't replace it, and it never promises safety."
            />
          </Reveal>
        </div>

        <div className="journeys">
          {JOURNEYS.map((journey, index) => (
            <Reveal key={journey.title} delay={index * 0.07} className="journey">
              <div className="icon-tile" style={{ width: 40, height: 40, borderRadius: 12 }}>{journey.icon}</div>
              <h3>{journey.title}</h3>
              <p>{journey.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="section section--tint" aria-labelledby="cta-title">
      <div className="container">
        <Reveal className="cta on-dark">
          <Building2 size={28} style={{ color: "var(--cyan-300)" }} aria-hidden="true" />
          <h2 id="cta-title">Plan your next journey with the whole picture.</h2>
          <p className="lead">Free to use, no account needed. Kerala is covered by a local map database; other areas use live public data.</p>
          <Button as={Link} to="/map" size="lg" iconRight={<ArrowRight size={18} aria-hidden="true" />}>
            Plan a route
          </Button>
          <Button as={Link} to="/about" variant="ghost" icon={<Footprints size={16} aria-hidden="true" />}>
            See how scores work
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
