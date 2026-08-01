function SafetyScore({ weather, hospitals, policeStations }) {
  if (!weather) {
    return null;
  }

  let score = 100;
  const warnings = [];

  // Rain / precipitation
  if (weather.precipitation >= 5) {
    score -= 20;
    warnings.push("⚠️ Heavy rainfall");
  } else if (weather.precipitation > 0) {
    score -= 10;
    warnings.push("⚠️ Rainfall detected");
  }

  // High wind
  if (weather.wind_speed_10m >= 40) {
    score -= 15;
    warnings.push("⚠️ High wind speed");
  }

  // Hospital availability
  if (hospitals.length === 0) {
    score -= 10;
    warnings.push("⚠️ No nearby hospital found");
  }

  // Police availability
  if (policeStations.length === 0) {
    score -= 10;
    warnings.push("⚠️ No nearby police station found");
  }

  // Prevent score below 0
  score = Math.max(0, score);

  // Safety level
  let safetyLevel = "GOOD";

  if (score >= 80) {
    safetyLevel = "GOOD";
  } else if (score >= 60) {
    safetyLevel = "MODERATE";
  } else {
    safetyLevel = "HIGH RISK";
  }

  return (
    <div
      style={{
        maxWidth: "600px",
        margin: "20px auto",
        padding: "20px",
        backgroundColor: "#f5f5f5",
        borderRadius: "10px",
        textAlign: "center",
      }}
    >
      <h2>🛡️ Route Safety Score</h2>

      <h1>{score}/100</h1>

      <h3>Safety Level: {safetyLevel}</h3>

      {hospitals.length > 0 && (
        <p>✅ Hospital available nearby</p>
      )}

      {policeStations.length > 0 && (
        <p>✅ Police station available nearby</p>
      )}

      {warnings.map((warning, index) => (
        <p key={index}>{warning}</p>
      ))}
    </div>
  );
}

export default SafetyScore;