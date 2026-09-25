import "./weather.css";

/*
  A small animated scene for a weather condition. Purely illustrative and
  quiet by design: slow drifts and gentle falls, disabled for reduced
  motion. `kind` comes from lib/weather.js (clear, partly, cloudy, fog,
  drizzle, rain, snow, storm, unknown).
*/

function Cloud({ x, y, scale = 1, dark = false, drift = 0 }) {
  return (
    <g
      className="wx-cloud"
      style={{ "--drift": `${drift}s` }}
      transform={`translate(${x} ${y}) scale(${scale})`}
    >
      <path
        d="M14 34a10 10 0 0 1 2-19.8A14 14 0 0 1 43 12a11 11 0 0 1 3 21.7V34Z"
        fill={dark ? "#64748b" : "#cbd5e1"}
      />
      <path d="M14 34h32" stroke={dark ? "#475569" : "#94a3b8"} strokeOpacity="0.5" strokeWidth="1" />
    </g>
  );
}

function Sun({ cx = 32, cy = 30, night = false }) {
  if (night) {
    return (
      <g className="wx-moon">
        <path d="M40 18a14 14 0 1 0 8 25 12 12 0 0 1-8-25Z" fill="#e2e8f0" transform={`translate(${cx - 32} ${cy - 30})`} />
      </g>
    );
  }

  return (
    <g className="wx-sun" transform={`translate(${cx} ${cy})`}>
      <g className="wx-rays">
        {Array.from({ length: 8 }, (_, index) => (
          <line
            key={index}
            x1="0" y1="-19" x2="0" y2="-25"
            stroke="#fbbf24" strokeWidth="2.6" strokeLinecap="round"
            transform={`rotate(${index * 45})`}
          />
        ))}
      </g>
      <circle r="12.5" fill="#fbbf24" />
      <circle r="12.5" fill="#fde68a" fillOpacity="0.5" transform="translate(-3 -3) scale(0.6)" />
    </g>
  );
}

function Drops({ count, snow = false }) {
  return (
    <g>
      {Array.from({ length: count }, (_, index) => {
        const x = 20 + ((index * 37) % 46);

        return snow ? (
          <circle
            key={index}
            className="wx-flake"
            cx={x} cy="40" r="1.7" fill="#f1f5f9"
            style={{ "--delay": `${(index % 6) * 0.35}s` }}
          />
        ) : (
          <line
            key={index}
            className="wx-drop"
            x1={x} y1="38" x2={x - 2.4} y2="46"
            stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round"
            style={{ "--delay": `${(index % 7) * 0.18}s` }}
          />
        );
      })}
    </g>
  );
}

export default function WeatherVisual({ kind = "clear", night = false, size = 72 }) {
  return (
    <svg
      className="wx"
      width={size}
      height={size}
      viewBox="0 0 72 72"
      aria-hidden="true"
      focusable="false"
      data-kind={kind}
    >
      {kind === "clear" && <Sun cx={36} cy={36} night={night} />}

      {kind === "partly" && (
        <>
          <Sun cx={28} cy={26} night={night} />
          <Cloud x={14} y={26} drift={7} />
        </>
      )}

      {(kind === "cloudy" || kind === "unknown") && (
        <>
          <Cloud x={20} y={12} scale={0.85} drift={9} />
          <Cloud x={6} y={22} drift={6} dark />
        </>
      )}

      {kind === "fog" && (
        <g className="wx-fog" stroke="#cbd5e1" strokeLinecap="round" strokeWidth="4">
          <line x1="12" y1="26" x2="60" y2="26" />
          <line x1="8" y1="38" x2="52" y2="38" />
          <line x1="16" y1="50" x2="64" y2="50" />
        </g>
      )}

      {(kind === "drizzle" || kind === "rain") && (
        <>
          <Cloud x={8} y={4} dark />
          <Drops count={kind === "rain" ? 12 : 7} />
        </>
      )}

      {kind === "snow" && (
        <>
          <Cloud x={8} y={4} />
          <Drops count={10} snow />
        </>
      )}

      {kind === "storm" && (
        <>
          <Cloud x={8} y={2} dark />
          <path className="wx-bolt" d="M38 34 30 48h7l-3 12 12-18h-8l4-8Z" fill="#fbbf24" />
          <Drops count={6} />
        </>
      )}
    </svg>
  );
}
