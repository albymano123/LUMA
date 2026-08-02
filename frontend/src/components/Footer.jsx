function Footer() {
  return (
    <footer
      style={{
        width: "100%",
        marginTop: "40px",
        padding: "20px",
        textAlign: "center",
        backgroundColor: "#111827",
        color: "white",
      }}
    >
      <h3 style={{ margin: "0 0 8px 0" }}>
        LumaPath
      </h3>

      <p
        style={{
          margin: 0,
          fontSize: "14px",
          opacity: 0.8,
        }}
      >
        Safer Routes. Smarter Journeys.
      </p>

      <p
        style={{
          marginTop: "8px",
          marginBottom: 0,
          fontSize: "12px",
          opacity: 0.6,
        }}
      >
        © 2026 LumaPath
      </p>
    </footer>
  );
}

export default Footer;