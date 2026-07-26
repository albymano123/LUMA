import "./Features.css";

function Features() {
  return (
    <section className="features">

      <div className="card">
        <h2>🛡️ Safe Routes</h2>
        <p>
          Find safer routes using AI-powered safety analysis.
        </p>
      </div>

      <div className="card">
        <h2>📍 Live Navigation</h2>
        <p>
          Explore routes with interactive OpenStreetMap integration.
        </p>
      </div>

      <div className="card">
        <h2>🚨 Emergency Support</h2>
        <p>
          Quickly locate nearby hospitals and police stations.
        </p>
      </div>

    </section>
  );
}

export default Features;