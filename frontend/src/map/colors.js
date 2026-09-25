// Route line colours. Leaflet draws SVG with real colour values, so these
// mirror the design tokens (see styles/tokens.css).
export const routeColors = {
  selected: "#2f6bff",
  recommended: "#16a34a",
  alternative: "#8592a8",
  highlight: "#f59e0b",
  casing: "#ffffff",
  scan: "#22d3ee",
};

// Preferred basemap: OpenFreeMap vector tiles (free, no key), drawn by MapLibre.
export const VECTOR_STYLE = "https://tiles.openfreemap.org/styles/positron";
export const VECTOR_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

// Fallback: OpenStreetMap raster tiles.
export const RASTER_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const RASTER_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
