import { Link } from "react-router-dom";
import { ArrowRight, Building2, CloudRain, Hospital, Lightbulb, Signpost, Store } from "lucide-react";

import Footer from "../layout/Footer";
import Navbar from "../layout/Navbar";
import { Button, Notice, Reveal, SectionHeader } from "../ui";
import "./pages.css";

const FACTORS = [
  {
    icon: <Hospital size={20} aria-hidden="true" />,
    title: "Emergency access",
    measures: "Distance from the route (sampled every 100 m) to the nearest hospital or clinic and police station.",
    source: "OpenStreetMap",
    detail: "Full marks within 500 m (walking), 1 km (cycling) or 1.5 km (driving); zero at 2, 3 or 5 km.",
  },
  {
    icon: <Store size={20} aria-hidden="true" />,
    title: "Street activity",
    measures: "The share of the route within 100 m of a shop, café, bank, transit stop, school or similar place, and the longest stretch without one.",
    source: "OpenStreetMap",
    detail: "A sign that people are around. Not scored for driving.",
  },
  {
    icon: <Building2 size={20} aria-hidden="true" />,
    title: "Built-up surroundings",
    measures: "The share of the route (sampled every 50 m) with at least 3 mapped buildings in the surrounding block, and the longest empty stretch.",
    source: "OpenStreetMap buildings",
    detail: "85% counts as fully built up. Each km of unbroken empty stretch beyond 0.5 km costs 10 points, up to 30. Empty stretches are shown on the map.",
  },
  {
    icon: <Lightbulb size={20} aria-hidden="true" />,
    title: "Street lighting",
    measures: "The share of the route's streets mapped as lit.",
    source: "OpenStreetMap lit tags",
    detail: "Only used when at least 30% of the route's streets carry the tag. Unmapped never means unlit.",
  },
  {
    icon: <Signpost size={20} aria-hidden="true" />,
    title: "Road and traffic exposure",
    measures: "For walking and cycling: how much of the route follows fast main roads, plus sidewalks and speed limits where mapped.",
    source: "OpenStreetMap road classes",
    detail: "30 km/h or less counts as calm, 80 km/h or more scores zero. Sidewalks and speed limits count only above 30% coverage.",
  },
  {
    icon: <CloudRain size={20} aria-hidden="true" />,
    title: "Weather",
    measures: "Current rain, wind, thunderstorms and visibility along the route.",
    source: "Open-Meteo",
    detail: "Heavy rain takes 55 points, thunderstorms 40, fog 25. Weather alone is never enough to publish a score.",
  },
];

const WEIGHTS = [
  ["Walking, day", "25%", "15%", "20%", "5%", "10%", "25%"],
  ["Walking, night", "20%", "20%", "20%", "20%", "10%", "10%"],
  ["Cycling, day", "25%", "10%", "15%", "5%", "20%", "25%"],
  ["Cycling, night", "20%", "10%", "15%", "20%", "20%", "15%"],
  ["Driving, day", "40%", "-", "10%", "10%", "-", "40%"],
  ["Driving, night", "35%", "-", "10%", "25%", "-", "30%"],
];

const STATES = [
  ["Recommended", "The safest route is at least 5 points ahead of the next best."],
  ["Close", "The safest route leads, but by less than 5 points. Compare the alternatives if time matters."],
  ["Tie", "Several routes are within 2 points, which is smaller than the noise in open data. The quickest of them is recommended."],
  ["Only route", "Only one distinct route was found."],
  ["No recommendation", "There is no score, or the best score rests on low-confidence data. No route is called recommended; the quickest is only the default selection."],
];

export default function About() {
  return (
    <div className="lp-page">
      <Navbar />

      <main id="main">
        <section className="page-hero on-dark">
          <div className="container">
            <Reveal className="page-hero__inner">
              <span className="eyebrow">How it works</span>
              <h1>How LumaPath scores routes.</h1>
              <p className="lead">
                Every score is built from real map and weather data, measured along the length of each route,
                and explained. This page is the whole method.
              </p>
            </Reveal>
          </div>
        </section>

        <div className="container lp-prose-page method">
          <section className="method__block" aria-labelledby="factors-title">
            <SectionHeader id="factors-title" title="The six factors" lead="Each factor is scored from 0 to 100 and measured as a share of the route's length, so a longer route does not look safer just because it passes more places." />

            <div className="fgrid">
              {FACTORS.map((factor, index) => (
                <Reveal key={factor.title} delay={index * 0.05} className="fcard">
                  <h3>{factor.icon}{factor.title}</h3>
                  <p>{factor.measures}</p>
                  <dl>
                    <dt>Data</dt>
                    <dd>{factor.source}</dd>
                    <dt>How it counts</dt>
                    <dd>{factor.detail}</dd>
                  </dl>
                </Reveal>
              ))}
            </div>
          </section>

          <section className="method__block" aria-labelledby="weights-title">
            <SectionHeader id="weights-title" title="Weights" lead="After dark, lighting, activity and surroundings count for more and weather for less. A dash means the factor does not apply to that mode." />

            <div className="wtable-wrap">
              <table className="wtable">
                <thead>
                  <tr>
                    <th scope="col">Mode and time</th>
                    <th scope="col">Emergency</th>
                    <th scope="col">Activity</th>
                    <th scope="col">Surroundings</th>
                    <th scope="col">Lighting</th>
                    <th scope="col">Road</th>
                    <th scope="col">Weather</th>
                  </tr>
                </thead>
                <tbody>
                  {WEIGHTS.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, index) => (index === 0 ? <th scope="row" key={cell}>{cell}</th> : <td key={index}>{cell}</td>))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="method__block" aria-labelledby="risk-title">
            <SectionHeader id="risk-title" title="Risk level and confidence" lead="The score is the weighted average of the factors that had data." />

            <div className="levels">
              <div className="level" data-tone="positive"><strong>Lower risk</strong><span>Score 75 to 100</span></div>
              <div className="level" data-tone="warning"><strong>Moderate risk</strong><span>Score 55 to 74</span></div>
              <div className="level" data-tone="danger"><strong>Higher risk</strong><span>Score 0 to 54</span></div>
            </div>

            <p>
              <strong>Confidence</strong> is the share of the total weight that had data: 85% or more is high,
              55% or more medium, otherwise low. If a factor's data is missing it is left out, never counted as
              zero. If less than 40% of the weight is available, or only weather is, no score is shown at all.
            </p>
          </section>

          <section className="method__block" aria-labelledby="choice-title">
            <SectionHeader id="choice-title" title="Safest, Balanced and Time-efficient" lead="What you select and what is recommended are separate. Choosing Time-efficient selects the quickest route without calling it the safest." />

            <p>
              <strong>Safest</strong> is the quickest route among those within 2 points of the highest score.
              <strong> Balanced</strong> weighs safety (50%), time (30%) and distance (20%).
              <strong> Time-efficient</strong> is the quickest route, with its safety information still shown.
            </p>

            <div className="states">
              {STATES.map(([name, text]) => (
                <div className="state" key={name}>
                  <strong>{name}</strong>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="method__block" aria-labelledby="limits-title">
            <SectionHeader id="limits-title" title="What the score is not" />

            <Notice tone="warning" title="An estimate from open data, not a guarantee">
              Map completeness varies: in Kerala only about 0.5% of roads carry a lighting tag and 2% a sidewalk
              tag, so those are usually reported as &ldquo;not mapped&rdquo;. Scores are not built from crime or
              incident records, because none are available, and the factor weights are documented engineering
              judgements, not values learned from data.
            </Notice>

            <p>
              There is no trained machine-learning model. A model can only learn safety from real incident
              records, so until they exist the app says so instead of showing an estimate. The pipeline for
              training one on real data is built and tested.
            </p>

            <p>
              Data sources: OpenStreetMap contributors (roads, buildings, places, lighting; a Kerala extract is
              stored locally, other areas use live public servers), OSRM (routing), Photon (place search),
              Open-Meteo (weather), OpenFreeMap (basemap).
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-3)" }}>
              <Button as={Link} to="/map" iconRight={<ArrowRight size={16} aria-hidden="true" />}>Plan a route</Button>
              <Button as={Link} to="/emergency" variant="secondary">Emergency help</Button>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
