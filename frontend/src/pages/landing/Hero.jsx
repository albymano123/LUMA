import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

import HeroVisual from "../../hero3d/HeroVisual";
import { getHealth } from "../../services/api";
import { Badge, Button, Counter, GlassCard, ScoreRing } from "../../ui";

// Illustration only: numbers here are examples, and the card says so.
const DEMO = [
  { name: "Route A", score: 84, level: "Lower risk", meta: "24 min · 1.9 km", selected: true },
  { name: "Route B", score: 68, level: "Moderate risk", meta: "19 min · 1.5 km" },
  { name: "Route C", score: 51, level: "Higher risk", meta: "21 min · 1.7 km" },
];

export function Hero() {
  return (
    <section className="hero on-dark" aria-labelledby="hero-title">
      <div className="hero__visual">
        <HeroVisual />
      </div>
      <div className="hero__shade" aria-hidden="true" />

      <div className="container hero__grid">
        <div className="hero__content">
          <span className="hero__badge">
            <span className="hero__badge-dot"><Sparkles size={13} aria-hidden="true" /></span>
            Safety-aware navigation
          </span>

          <h1 id="hero-title">
            Navigate smarter.
            <span className="hero__accent">Travel safer.</span>
          </h1>

          <p className="lead">
            LumaPath compares routes using real map and weather data, from nearby
            hospitals and police to how built-up the streets are, and explains why
            one route scores higher than another.
          </p>

          <div className="hero__actions">
            <Button as={Link} to="/map" size="lg" iconRight={<ArrowRight size={18} aria-hidden="true" />}>
              Plan a route
            </Button>
            <Button as="a" href="#how-it-works" variant="glass" size="lg">
              How it works
            </Button>
          </div>

          <div className="hero__note">
            <span><CheckCircle2 size={15} aria-hidden="true" /> Free, no account needed</span>
            <span><ShieldCheck size={15} aria-hidden="true" /> Never a guarantee, always explained</span>
          </div>
        </div>
      </div>

      <GlassCard className="hero__card" aria-label="Illustration of a route comparison">
        <div className="hero__card-tag">
          <span>Route comparison</span>
          <Badge tone="info">Illustration</Badge>
        </div>

        <div className="demo-rows">
          {DEMO.map((route) => (
            <div key={route.name} className="demo-row" data-selected={route.selected}>
              <ScoreRing score={route.score} level={route.level} size={46} label={false} />
              <div>
                <div className="demo-row__title">
                  {route.name}
                  {route.selected && <Badge tone="positive">Recommended</Badge>}
                </div>
                <div className="demo-row__meta">{route.level} · {route.meta}</div>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </section>
  );
}

// Real numbers from the running map database; hidden if the API is unreachable.
export function TrustStrip() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then((data) => !cancelled && setHealth(data.geo_database?.available ? data.geo_database : null))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (!health) {
    return (
      <div className="trust on-dark">
        <p className="trust__source" style={{ paddingBlock: "var(--s-5)" }}>
          Built on OpenStreetMap, Open-Meteo and OSRM open data.
        </p>
      </div>
    );
  }

  const places = health.places ?? {};
  const stats = [
    { value: health.ways, label: "roads mapped" },
    { value: (places.hospital ?? 0) + (places.clinic ?? 0), label: "hospitals and clinics" },
    { value: places.police ?? 0, label: "police stations" },
    { value: places.fire_station ?? 0, label: "fire stations" },
  ];

  return (
    <div className="trust on-dark">
      <div className="container">
        <ul className="trust__grid" role="list" aria-label="Map data available">
          {stats.map((stat) => (
            <li key={stat.label} className="trust__stat">
              <strong><Counter value={stat.value} /></strong>
              <span>{stat.label}</span>
            </li>
          ))}
        </ul>
        <p className="trust__source">
          Live figures from the local Kerala map database
          {health.extract_date ? ` (OpenStreetMap extract dated ${health.extract_date})` : ""}.
          Other areas use live public map servers.
        </p>
      </div>
    </div>
  );
}
