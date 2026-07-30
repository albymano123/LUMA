function RouteInfo({ distance, time }) {
  if (!distance || !time) return null;

  return (
    <div
      style={{
        width: "300px",
        margin: "20px auto",
        padding: "20px",
        borderRadius: "10px",
        border: "1px solid #ddd",
        backgroundColor: "#ffffff",
        textAlign: "center",
      }}
    >
      <h2>Route Information</h2>

      <p>
        <strong>Distance:</strong> {distance} km
      </p>

      <p>
        <strong>Estimated Time:</strong> {time} min
      </p>
    </div>
  );
}

export default RouteInfo;