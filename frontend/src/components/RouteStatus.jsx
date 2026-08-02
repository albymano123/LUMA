function RouteStatus({
  sourceCoords,
  destinationCoords,
  distance,
}) {
  // Route already calculated
  if (distance) {
    return null;
  }

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "20px auto",
        padding: "18px",
        backgroundColor: "#f5f7fa",
        borderRadius: "10px",
        textAlign: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      {!sourceCoords || !destinationCoords ? (
        <>
          <h3>🧭 Plan Your Safe Journey</h3>
          <p>
            Enter your source and destination to view
            the route, nearby emergency services,
            weather conditions and safety information.
          </p>
        </>
      ) : (
        <>
          <h3>⏳ Finding Route...</h3>
          <p>
            Please wait while LumaPath calculates your journey.
          </p>
        </>
      )}
    </div>
  );
}

export default RouteStatus;