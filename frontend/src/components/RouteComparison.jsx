function RouteComparison({
  safeRouteData,
  selectedRoute,
  setSelectedRoute,
}) {
  if (!safeRouteData) {
    return null;
  }

  return (
    <div className="route-comparison">

      <h2>Route Comparison</h2>

      {safeRouteData.routes.map((route) => {

        const isRecommended =
          safeRouteData.recommended_route.name === route.name;

        return (
<div
  key={route.name}
  onClick={() => setSelectedRoute(route.name)}
  style={{
    border:
      route.name === selectedRoute
        ? "3px solid #00ff00"
        : "1px solid gray",

    borderRadius: "10px",
    padding: "15px",
    marginBottom: "15px",

    backgroundColor:
      route.name === selectedRoute
        ? "#eaffea"
        : "#ffffff",

    cursor: "pointer",
    transition: "0.3s",
  }}
>

            <h3>
              {route.name}

              {isRecommended && " ⭐ Recommended"}
            </h3>

            <p>
              Safety Score :
              {route.safety_score}
            </p>

            <p>
              Risk Level :
              {route.risk_level}
            </p>

            <p>
              Distance :
              {route.distance_km} km
            </p>

            <p>
              Duration :
              {route.duration_min} min
            </p>

          </div>

        );

      })}

    </div>
  );

}

export default RouteComparison;