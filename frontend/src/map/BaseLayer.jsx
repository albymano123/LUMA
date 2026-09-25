import { useEffect, useState } from "react";
import { TileLayer, useMap } from "react-leaflet";

import L from "./leaflet";
import { RASTER_ATTRIBUTION, RASTER_URL, VECTOR_ATTRIBUTION, VECTOR_STYLE } from "./colors";
import { canRun3D } from "../lib/capabilities";

/*
  The basemap. Preferred: crisp vector tiles (OpenFreeMap "positron", a
  calm light style, free and keyless) drawn by MapLibre inside the Leaflet
  map. Fallback: plain OpenStreetMap raster tiles, used when WebGL is
  missing, when the visitor chose the lightweight map (localStorage key
  "lumapath.map" = "raster"), or if the vector style cannot be loaded.
*/

function preferredMode() {
  try {
    if (window.localStorage.getItem("lumapath.map") === "raster") return "raster";
  } catch {
    // Storage blocked: use the default.
  }

  // Reduced motion / save-data still get vectors; only missing WebGL falls back.
  return canRun3D() || hasWebGL() ? "vector" : "raster";
}

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

const LOAD_TIMEOUT_MS = 12_000;

function VectorLayer({ onFail }) {
  const map = useMap();

  useEffect(() => {
    let layer;
    let timer;
    let cancelled = false;

    (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        await import("@maplibre/maplibre-gl-leaflet");
        await import("maplibre-gl/dist/maplibre-gl.css");

        // The worker files are static assets (see scripts/copy-maplibre.mjs).
        maplibre.setWorkerUrl(new URL("/maplibre/maplibre-gl-worker.mjs", window.location.origin).href);

        if (cancelled) return;

        layer = L.maplibreGL({ style: VECTOR_STYLE, attribution: VECTOR_ATTRIBUTION, interactive: false });
        layer.addTo(map);

        // Until the style has loaded, any error (or a long silence) means the
        // vector map cannot work here: use the raster map instead. After it
        // has loaded, an occasional failed tile is not worth a fallback.
        const gl = layer.getMaplibreMap();
        let loaded = false;

        gl.on("load", () => { loaded = true; });
        gl.on("error", () => { if (!loaded) onFail(); });
        timer = setTimeout(() => { if (!loaded) onFail(); }, LOAD_TIMEOUT_MS);
      } catch {
        if (!cancelled) onFail();
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);

      try {
        layer?.remove();
      } catch {
        // The map is going away anyway.
      }
    };
  }, [map, onFail]);

  return null;
}

export default function BaseLayer() {
  const [mode, setMode] = useState(preferredMode);

  if (mode === "vector") {
    return <VectorLayer onFail={() => setMode("raster")} />;
  }

  return (
    <TileLayer
      className="lp-tiles--soft"
      attribution={RASTER_ATTRIBUTION}
      url={RASTER_URL}
      maxZoom={19}
    />
  );
}
