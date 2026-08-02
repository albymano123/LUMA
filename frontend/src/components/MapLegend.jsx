function MapLegend() {
  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "15px auto",
        padding: "15px 20px",
        borderRadius: "10px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        backgroundColor: "white",
      }}
    >
      <h3 style={{ marginTop: 0 }}>🗺️ Map Legend</h3>

      <div
        style={{
          display: "flex",
          gap: "25px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span>📍 Source / Destination</span>

        <span>🔴 Hospital</span>

        <span>🔵 Police Station</span>

        <span>〰️ Blue Line — Selected Route</span>
      </div>
    </div>
  );
}

export default MapLegend;