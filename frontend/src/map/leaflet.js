import L from "leaflet";

// leaflet.markercluster expects a global `L`, so the global is set before
// the plugin is loaded (a static import would run first). Loaded only when
// the map page opens.
globalThis.L = L;

export const clusterReady = import("leaflet.markercluster").then(() => L);

export default L;
