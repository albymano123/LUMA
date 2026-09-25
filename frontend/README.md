# LumaPath frontend

React 19 + Vite, a custom token-based design system (no component library), Leaflet with a MapLibre
vector basemap, and a lazy three.js hero. See the [project README](../README.md) and
[docs/DESIGN_SYSTEM.md](../docs/DESIGN_SYSTEM.md).

```bash
npm install
npm run dev          # http://localhost:5173  (API at VITE_API_URL, default http://127.0.0.1:8000)
npm run build        # production build in dist/
npm run lint
npm test             # unit and component tests (Vitest + Testing Library)
npx playwright install chromium   # once
npm run test:e2e     # browser tests against the production build, network mocked
LIVE=1 npx playwright test e2e/live.spec.js   # real backend and services (start the backend first)
```

The UI never calculates a safety score. It displays what the backend returns, including the
recommendation state, and says "Data unavailable" or "Not mapped" where data is missing.

| Folder | Contents |
|---|---|
| `src/styles` | design tokens and base styles |
| `src/ui` | reusable components (Button, SegmentedControl, ScoreRing, FactorBar, Disclosure...) |
| `src/layout` | navigation bar, footer, logo |
| `src/pages` | landing, planner, how it works, emergency |
| `src/planner` | trip form, place search, route list and details, progress, bottom sheet |
| `src/map` | map, markers, basemap layer |
| `src/hero3d` | the 3D hero and its 2D fallback |
| `src/services/api.js` | the only place that talks to the backend (including streamed progress) |
| `e2e/` | Playwright specs: app, landing, accessibility, performance, live, deployment, screenshots |

MapLibre runs a web worker whose files bundlers do not emit; `scripts/copy-maplibre.mjs` copies them into
`public/maplibre/` before dev and build (generated, not committed).
