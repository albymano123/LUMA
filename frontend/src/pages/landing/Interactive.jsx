import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import {
  AlertTriangle,
  Building2,
  Check,
  CloudRain,
  Flame,
  Hospital,
  Lightbulb,
  Scale,
  Shield,
  ShieldCheck,
  Signpost,
  Store,
  Zap,
  Siren,
  Cloud,
  Sun,
} from "lucide-react";

import WeatherVisual from "../../components/WeatherVisual";
import { Badge, FactorBar, Reveal, ScoreRing, SectionHeader, SegmentedControl } from "../../ui";

/* ============================ safety intelligence ============================ */

const FACTORS = [
  {
    key: "emergency",
    icon: <Hospital size={18} aria-hidden="true" />,
    title: "Emergency access",
    tagline: "Hospitals and police along the way",
    measures: "How close the route stays to a hospital or clinic and to a police station, measured every 100 metres, not just at the start and end.",
    source: "OpenStreetMap: hospitals, clinics, police stations.",
    effect: "One of the heaviest factors: about a quarter of the score when walking. It falls to zero at 2 km (walking), 3 km (cycling) or 5 km (driving).",
    example: 80,
  },
  {
    key: "activity",
    icon: <Store size={18} aria-hidden="true" />,
    title: "Street activity",
    tagline: "Signs that people are around",
    measures: "How much of the route passes shops, cafés, banks, transit stops, schools and similar places, and the longest stretch without any.",
    source: "OpenStreetMap places.",
    effect: "Counts for more after dark. Not scored for driving, where it says little about safety.",
    example: 70,
  },
  {
    key: "surroundings",
    icon: <Building2 size={18} aria-hidden="true" />,
    title: "Built-up surroundings",
    tagline: "Homes and buildings nearby",
    measures: "How much of the route has mapped buildings close by, and where the longest empty stretch is. Long empty stretches can feel isolated.",
    source: "OpenStreetMap buildings, about 2.6 million in Kerala.",
    effect: "A long unbroken stretch with no buildings lowers the score, and is shown on the map's Safety factors layer.",
    example: 75,
  },
  {
    key: "lighting",
    icon: <Lightbulb size={18} aria-hidden="true" />,
    title: "Street lighting",
    tagline: "Only where the map has it",
    measures: "The share of streets on the route mapped as lit.",
    source: "OpenStreetMap lit tags.",
    effect: "Lighting is rarely mapped, so it is used only when at least 30% of the route's streets carry the tag. Unmapped never means unlit.",
    example: null,
  },
  {
    key: "road",
    icon: <Signpost size={18} aria-hidden="true" />,
    title: "Road and traffic exposure",
    tagline: "For people on foot or bicycle",
    measures: "How much of the route follows fast main roads, plus sidewalks and posted speed limits where they are mapped.",
    source: "OpenStreetMap road classes and tags.",
    effect: "Used for walking and cycling only.",
    example: 60,
  },
  {
    key: "weather",
    icon: <CloudRain size={18} aria-hidden="true" />,
    title: "Weather",
    tagline: "Conditions right now",
    measures: "Rain, wind, thunderstorms and visibility along the route.",
    source: "Open-Meteo.",
    effect: "Adjusts the score; it can never make a score on its own. Weather alone is not enough evidence.",
    example: 100,
  },
];

export function SafetyIntelligence() {
  const [selected, setSelected] = useState("emergency");
  const factor = FACTORS.find((item) => item.key === selected);

  return (
    <section className="section section--white" aria-labelledby="intel-title">
      <div className="container">
        <div className="section__head">
          <Reveal>
            <SectionHeader
              id="intel-title"
              eyebrow="Safety intelligence"
              title="Six factors, each measured from real data."
              lead="Select a factor to see what it measures, where the data comes from and how it counts. There is no crime data behind the score, because none is available."
            />
          </Reveal>
        </div>

        <div className="explorer">
          <div className="explorer__tabs" role="tablist" aria-label="Safety factors" aria-orientation="vertical">
            {FACTORS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                id={`tab-${item.key}`}
                aria-selected={selected === item.key}
                aria-controls="factor-panel"
                tabIndex={selected === item.key ? 0 : -1}
                className="explorer__tab"
                onClick={() => setSelected(item.key)}
                onKeyDown={(event) => {
                  const order = FACTORS.map((entry) => entry.key);
                  const index = order.indexOf(selected);

                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    const next = order[(index + (event.key === "ArrowDown" ? 1 : order.length - 1)) % order.length];
                    setSelected(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }
                }}
              >
                {item.icon}
                <span>
                  {item.title}
                  <small>{item.tagline}</small>
                </span>
              </button>
            ))}
          </div>

          <div id="factor-panel" role="tabpanel" aria-labelledby={`tab-${selected}`} className="explorer__panel on-dark">
            <AnimatePresence mode="wait">
              <m.div
                key={factor.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
                style={{ display: "grid", gap: "var(--s-5)" }}
              >
                <h3>{factor.title}</h3>

                <dl>
                  <div><dt>What it measures</dt><dd>{factor.measures}</dd></div>
                  <div><dt>Where the data comes from</dt><dd>{factor.source}</dd></div>
                  <div><dt>How it counts</dt><dd>{factor.effect}</dd></div>
                </dl>

                <div className="explorer__demo">
                  <FactorBar
                    factor={{
                      label: factor.example == null ? `${factor.title} (example: not mapped)` : `${factor.title} (example value)`,
                      score: factor.example,
                      available: factor.example != null,
                      applicable: true,
                    }}
                  />
                </div>
              </m.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================ comparison demo ============================ */

const CHOICES = {
  safest: {
    name: "Route B", score: 86, level: "Lower risk", time: "34 min", distance: "2.8 km", confidence: "High confidence",
    reasons: [
      { ok: true, text: "Strong emergency-service coverage along the route" },
      { ok: true, text: "Built-up streets for almost the whole way" },
      { ok: false, text: "Lighting is not mapped for part of the route" },
    ],
  },
  balanced: {
    name: "Route A", score: 78, level: "Lower risk", time: "28 min", distance: "2.4 km", confidence: "High confidence",
    reasons: [
      { ok: true, text: "Good emergency-service access" },
      { ok: true, text: "Mostly built-up, with one short quiet stretch" },
      { ok: false, text: "Follows a main road for about a third of the way" },
    ],
  },
  fastest: {
    name: "Route C", score: 61, level: "Moderate risk", time: "22 min", distance: "2.0 km", confidence: "Medium confidence",
    reasons: [
      { ok: true, text: "The quickest of the three routes" },
      { ok: false, text: "A 0.9 km stretch with no mapped buildings" },
      { ok: false, text: "Some safety data was unavailable" },
    ],
  },
};

const OPTIONS = [
  { value: "safest", label: "Safest", icon: <Shield size={16} aria-hidden="true" /> },
  { value: "balanced", label: "Balanced", icon: <Scale size={16} aria-hidden="true" /> },
  { value: "fastest", label: "Time-efficient", icon: <Zap size={16} aria-hidden="true" /> },
];

export function ComparisonDemo() {
  const [choice, setChoice] = useState("safest");
  const route = CHOICES[choice];

  return (
    <section className="section section--tint" aria-labelledby="compare-title">
      <div className="container compare">
        <Reveal className="compare__copy">
          <SectionHeader
            id="compare-title"
            eyebrow="Route comparison"
            title="Choose what matters for this trip."
            lead="Switch between Safest, Balanced and Time-efficient and watch the score, time and reasons change."
          />
          <ul>
            <li><Check size={18} aria-hidden="true" /> The route you select and the route recommended are always shown separately.</li>
            <li><Check size={18} aria-hidden="true" /> When safety data can't support a recommendation, none is made.</li>
            <li><Check size={18} aria-hidden="true" /> Every route shows how confident the score is.</li>
          </ul>
        </Reveal>

        <Reveal delay={0.1} className="compare__card">
          <div className="compare__tag">
            <span>Example journey</span>
            <Badge tone="info">Illustration, not real data</Badge>
          </div>

          <SegmentedControl label="Route preference (example)" options={OPTIONS} value={choice} onChange={setChoice} />

          <AnimatePresence mode="wait">
            <m.div
              key={choice}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: "grid", gap: "var(--s-4)" }}
            >
              <div className="compare__hero">
                <ScoreRing score={route.score} level={route.level} size={92} />
                <div>
                  <h3 style={{ marginBottom: 4 }}>{route.name}</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <Badge tone={route.score >= 75 ? "positive" : "warning"} size="lg">{route.level}</Badge>
                    <Badge outline size="lg">{route.confidence}</Badge>
                  </div>
                </div>
              </div>

              <ul className="compare__reasons">
                {route.reasons.map((reason) => (
                  <li key={reason.text}>
                    {reason.ok
                      ? <Check size={16} color="var(--green-600)" aria-label="Good" />
                      : <AlertTriangle size={16} color="var(--amber-500)" aria-label="Caution" />}
                    {reason.text}
                  </li>
                ))}
              </ul>

              <div className="compare__stats">
                <div className="lp-stat"><span className="lp-stat__label">Time</span><span className="lp-stat__value">{route.time}</span></div>
                <div className="lp-stat"><span className="lp-stat__label">Distance</span><span className="lp-stat__value">{route.distance}</span></div>
                <div className="lp-stat"><span className="lp-stat__label">Score</span><span className="lp-stat__value">{route.score}/100</span></div>
              </div>
            </m.div>
          </AnimatePresence>
        </Reveal>
      </div>
    </section>
  );
}

/* ============================ emergency + weather awareness ============================ */

const SKY = [
  { value: "clear", label: "Clear", icon: <Sun size={16} aria-hidden="true" />, text: "Clear sky" },
  { value: "rain", label: "Rain", icon: <CloudRain size={16} aria-hidden="true" />, text: "Rain showers" },
  { value: "cloudy", label: "Cloudy", icon: <Cloud size={16} aria-hidden="true" />, text: "Overcast" },
];

export function Awareness() {
  const [sky, setSky] = useState("rain");
  const current = SKY.find((item) => item.value === sky);

  return (
    <section className="section section--white" aria-labelledby="aware-title">
      <div className="container">
        <div className="section__head">
          <Reveal>
            <SectionHeader
              id="aware-title"
              eyebrow="Emergency and weather awareness"
              title="Know what is around you, and what the sky is doing."
              lead="Help and conditions belong in the same view as the route itself."
            />
          </Reveal>
        </div>

        <div className="awareness">
          <Reveal className="aware-card">
            <div className="aware-visual" aria-hidden="true">
              <svg viewBox="0 0 400 190" preserveAspectRatio="xMidYMid slice" focusable="false">
                <path d="M20 160 C110 150 130 80 210 84 S330 60 384 28" fill="none" stroke="#38d5f2" strokeWidth="4" strokeLinecap="round" />
                {[
                  [96, 128, "#fb7185", "H"],
                  [212, 82, "#60a5fa", "P"],
                  [318, 56, "#fb923c", "F"],
                ].map(([x, y, color, letter], index) => (
                  <g key={letter}>
                    <circle cx={x} cy={y} r="10" fill={color} fillOpacity="0.28" style={{ transformOrigin: `${x}px ${y}px`, animation: `lp-pulse-ring 2.6s ease-out ${index * 0.7}s infinite` }} />
                    <circle cx={x} cy={y} r="11" fill={color} />
                    <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">{letter}</text>
                  </g>
                ))}
                <circle cx="20" cy="160" r="7" fill="#34d399" />
                <circle cx="384" cy="28" r="7" fill="#5b8dff" />
              </svg>
            </div>

            <h3 style={{ fontSize: "var(--fs-h3)" }}>Emergency awareness</h3>
            <p>
              Hospitals, clinics, police and fire stations near your selected route, with distance from
              the route, and phone number, emergency department and opening hours where they are mapped.
              Nothing is shown that the map does not contain.
            </p>
            <div className="aware-legend">
              <span><span className="pin-badge" style={{ background: "#e11d48" }}><Hospital size={14} aria-hidden="true" /></span> Hospital / clinic</span>
              <span><span className="pin-badge" style={{ background: "#1d4ed8" }}><Shield size={14} aria-hidden="true" /></span> Police</span>
              <span><span className="pin-badge" style={{ background: "#ea580c" }}><Flame size={14} aria-hidden="true" /></span> Fire</span>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="aware-card">
            <div className="weather-stage on-dark">
              <WeatherVisual kind={sky} size={84} />
              <div>
                <small>How the app shows conditions</small>
                <strong>{current.text}</strong>
                <small>Temperature, rain, wind and visibility</small>
              </div>
            </div>

            <SegmentedControl label="Weather example" options={SKY} value={sky} onChange={setSky} />

            <h3 style={{ fontSize: "var(--fs-h3)" }}>Weather awareness</h3>
            <p>
              Current temperature, rain, wind and visibility from Open-Meteo, shown with a small, quiet
              animation. Storms and fog lower a route's score; clear weather never raises it above what
              the map data supports.
            </p>
            <div className="aware-legend">
              <span><ShieldCheck size={16} aria-hidden="true" /> Weather can adjust a score, never create one</span>
              <span><Siren size={16} aria-hidden="true" /> Emergency numbers stay one tap away</span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
