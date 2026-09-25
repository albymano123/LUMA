import { Link } from "react-router-dom";

import { Logo } from "./Logo";
import "./layout.css";

export default function Footer() {
  return (
    <footer className="lp-footer on-dark">
      <div className="container lp-footer__grid">
        <div className="lp-footer__brand">
          <Logo />
          <p>
            Navigation that considers more than just speed. Route safety scores
            built from open map data, always explained, never a guarantee.
          </p>
        </div>

        <nav aria-label="Product">
          <h2 className="lp-footer__title">Product</h2>
          <ul role="list">
            <li><Link to="/map">Plan a route</Link></li>
            <li><Link to="/about">How it works</Link></li>
            <li><Link to="/emergency">Emergency help</Link></li>
          </ul>
        </nav>

        <div>
          <h2 className="lp-footer__title">Data</h2>
          <ul role="list">
            <li>Map data &copy; OpenStreetMap contributors</li>
            <li>Routing: OSRM</li>
            <li>Weather: Open-Meteo</li>
            <li>Basemap: OpenFreeMap</li>
          </ul>
        </div>
      </div>

      <div className="container lp-footer__legal">
        <p>
          A safety score is an estimate from available open data. It is not a
          guarantee that a route is safe. In an emergency call 112.
        </p>
        <p>&copy; 2026 LumaPath</p>
      </div>
    </footer>
  );
}
