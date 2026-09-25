import { AlertTriangle, Check } from "lucide-react";

/*
  Real progress. The backend reports each stage only when it has actually
  finished, and this list ticks a step only on that report:

    routes    -> "Finding routes"
    weather   -> "Checking the weather"
    map_data  -> "Loading roads, buildings and emergency services"
    (result)  -> "Scoring and comparing routes"  (ends the loading state)

  A stage that finished but came back without data (weather down...) is
  shown with a warning, never as a plain success.
*/

function stepStates(progress) {
  const routes = progress.routes;
  const weather = progress.weather;
  const mapData = progress.map_data;

  const steps = [
    {
      key: "routes",
      title: "Finding routes",
      done: Boolean(routes),
      detail: routes ? `${routes.count} ${routes.count === 1 ? "route" : "routes"} found` : "Asking the routing service",
    },
    {
      key: "weather",
      title: "Checking the weather",
      done: Boolean(weather),
      warn: weather && !weather.available,
      detail: weather
        ? weather.available ? "Conditions loaded" : "Weather is unavailable; scores will say so"
        : "Waiting for conditions",
    },
    {
      key: "map_data",
      title: "Loading roads, buildings and emergency services",
      done: Boolean(mapData),
      warn: mapData && (!mapData.emergency_services || !mapData.road_network),
      detail: mapData
        ? mapData.emergency_services
          ? mapData.source === "local" ? "From the local map database" : "From live map servers"
          : "Some map data is unavailable"
        : "Reading the map around your routes",
    },
    { key: "score", title: "Scoring and comparing routes", done: false, detail: "Measuring every route" },
  ];

  // The first unfinished step is the one in progress.
  const active = steps.findIndex((step) => !step.done);

  return steps.map((step, index) => ({ ...step, active: index === active }));
}

export default function AnalysisProgress({ progress }) {
  const steps = stepStates(progress);
  const finished = steps.filter((step) => step.done).length;

  return (
    <div className="ap" role="status" aria-live="polite" aria-label="Analysing your trip">
      <div className="ap__visual" aria-hidden="true">
        <svg viewBox="0 0 240 64" focusable="false">
          <path className="ap__ghost" d="M14 46 C60 46 70 14 120 22 S190 40 226 16" />
          <path className="ap__draw" d="M14 46 C60 46 70 14 120 22 S190 40 226 16" />
          <circle cx="14" cy="46" r="5" fill="#34d399" />
          <circle cx="226" cy="16" r="5" fill="#5b8dff" />
        </svg>
      </div>

      <div className="ap__head">
        <strong>Analysing your trip</strong>
        <span>{finished} of {steps.length} steps done</span>
      </div>

      <ol className="ap__steps" role="list">
        {steps.map((step) => (
          <li
            key={step.key}
            className="ap__step"
            data-state={step.done ? (step.warn ? "warn" : "done") : step.active ? "active" : "pending"}
          >
            <span className="ap__mark" aria-hidden="true">
              {step.done && (step.warn ? <AlertTriangle size={14} /> : <Check size={14} strokeWidth={3} />)}
              {!step.done && step.active && <span className="ap__spin" />}
            </span>

            <span className="ap__text">
              <span className="ap__title">{step.title}</span>
              <span className="ap__detail">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
