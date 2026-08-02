function EmergencySOS() {
  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "30px auto",
        padding: "25px",
        borderRadius: "12px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
        textAlign: "center",
      }}
    >
      <h2>🚨 Emergency Assistance</h2>

      <p>
        Quickly contact emergency services if you
        encounter danger during your journey.
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "20px",
          flexWrap: "wrap",
          marginTop: "20px",
        }}
      >
        <a
          href="tel:112"
          style={{
            padding: "12px 25px",
            background: "#d32f2f",
            color: "white",
            textDecoration: "none",
            borderRadius: "8px",
            fontWeight: "bold",
          }}
        >
          🚔 Call Police – 112
        </a>

        <a
          href="tel:108"
          style={{
            padding: "12px 25px",
            background: "#1976d2",
            color: "white",
            textDecoration: "none",
            borderRadius: "8px",
            fontWeight: "bold",
          }}
        >
          🚑 Call Ambulance – 108
        </a>
      </div>
    </div>
  );
}

export default EmergencySOS;