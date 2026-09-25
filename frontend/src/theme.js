import { createTheme } from "@mui/material/styles";

// Brand colours carried over from the original navbar / hero.
export const brand = {
  navy: "#0f172a",
  deepBlue: "#1e3a8a",
  sky: "#38bdf8",
};

// Route line colours on the map.
export const routeColors = {
  selected: "#2563eb",
  recommended: "#16a34a",
  alternative: "#94a3b8",
  casing: "#ffffff",
};

// Risk colours. The backend decides the level; the UI only maps it.
export const riskColors = {
  "Lower risk": { main: "#15803d", bg: "#dcfce7" },
  "Moderate risk": { main: "#b45309", bg: "#fef3c7" },
  "Higher risk": { main: "#b91c1c", bg: "#fee2e2" },
  "Insufficient data": { main: "#475569", bg: "#e2e8f0" },
};

export function riskStyle(level) {
  return riskColors[level] || riskColors["Insufficient data"];
}

const theme = createTheme({
  palette: {
    primary: {
      main: "#2563eb",
      dark: brand.deepBlue,
    },
    secondary: {
      main: "#0ea5e9",
    },
    background: {
      default: "#f8fafc",
      paper: "#ffffff",
    },
    text: {
      primary: "#0f172a",
      secondary: "#475569",
    },
    divider: "#e2e8f0",
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily:
      '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    h1: { fontWeight: 800, letterSpacing: "-0.02em" },
    h2: { fontWeight: 800, letterSpacing: "-0.02em" },
    h3: { fontWeight: 700, letterSpacing: "-0.01em" },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: { borderRadius: 14 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },
  },
});

export default theme;
