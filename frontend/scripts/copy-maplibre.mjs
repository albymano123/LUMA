// MapLibre runs its heavy work in a web worker made of two files that must
// sit side by side. Bundlers do not emit them, so they are copied into
// public/ (served as static files) before dev and build.
import { copyFileSync, mkdirSync } from "node:fs";

const from = "node_modules/maplibre-gl/dist";
const to = "public/maplibre";

mkdirSync(to, { recursive: true });

for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(`${from}/${file}`, `${to}/${file}`);
}

console.log("MapLibre worker files copied to public/maplibre");
