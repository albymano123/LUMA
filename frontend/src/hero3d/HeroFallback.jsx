/*
  The lightweight hero visual: the same idea as the 3D scene (a route drawn
  between two points, emergency markers, a safety ring around the
  destination) as one small SVG animated with CSS. Used on low-end devices,
  with reduced motion, without WebGL, and while the 3D scene loads.
*/
export default function HeroFallback() {
  return (
    <div className="hero-fallback" aria-hidden="true">
      <svg viewBox="0 0 640 420" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id="hf-route" x1="60" y1="330" x2="580" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#34d399" />
            <stop offset="0.55" stopColor="#38d5f2" />
            <stop offset="1" stopColor="#5b8dff" />
          </linearGradient>
          <radialGradient id="hf-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#5b8dff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#5b8dff" stopOpacity="0" />
          </radialGradient>
          <pattern id="hf-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#2f6bff" strokeOpacity="0.16" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width="640" height="420" fill="url(#hf-grid)" />
        <circle cx="560" cy="96" r="120" fill="url(#hf-glow)" />

        {/* alternative routes */}
        <path className="hf-alt hf-alt--1" d="M70 330 C150 360 220 250 300 260 S470 190 560 96" />
        <path className="hf-alt hf-alt--2" d="M70 330 C130 250 190 170 290 190 S470 60 560 96" />

        {/* the chosen route */}
        <path className="hf-route" d="M70 330 C150 300 200 230 290 220 S470 160 560 96" />

        {/* emergency-service markers */}
        <g className="hf-service" style={{ "--d": "0s" }}><circle cx="200" cy="240" r="6" fill="#fb7185" /><circle cx="200" cy="240" r="12" fill="#fb7185" fillOpacity="0.2" /></g>
        <g className="hf-service" style={{ "--d": "0.6s" }}><circle cx="340" cy="190" r="6" fill="#60a5fa" /><circle cx="340" cy="190" r="12" fill="#60a5fa" fillOpacity="0.2" /></g>
        <g className="hf-service" style={{ "--d": "1.2s" }}><circle cx="450" cy="150" r="6" fill="#fb923c" /><circle cx="450" cy="150" r="12" fill="#fb923c" fillOpacity="0.2" /></g>

        {/* start and destination */}
        <circle cx="70" cy="330" r="9" fill="#34d399" />
        <circle className="hf-ring" cx="70" cy="330" r="9" fill="none" stroke="#34d399" strokeWidth="2" />
        <circle cx="560" cy="96" r="10" fill="#5b8dff" />
        <circle className="hf-ring hf-ring--b" cx="560" cy="96" r="10" fill="none" stroke="#5b8dff" strokeWidth="2" />
        <circle className="hf-shell" cx="560" cy="96" r="54" fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4 8" />
      </svg>
    </div>
  );
}
