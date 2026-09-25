# LumaPath frontend

React 19 + Vite + Material UI + React Leaflet. See the [project README](../README.md) for the whole system.

```bash
npm install
npm run dev          # http://localhost:5173  (API at VITE_API_URL, default http://127.0.0.1:8000)
npm run build        # production build in dist/
npm run lint
npm test             # component tests (Vitest + Testing Library)
npx playwright install chromium   # once
npm run test:e2e     # browser tests against the production build, network mocked
LIVE=1 npx playwright test e2e/live.spec.js   # real backend and services (start the backend first)
```

The UI never calculates a safety score. It displays what the backend returns, including the
recommendation state, and says "not mapped" or "no data" where data is missing.

| Folder | Contents |
|---|---|
| `src/pages` | `Home` (landing), `MapPage` (the planner), `About`, `Emergency` |
| `src/components` | Route form and search, comparison cards, details, map, legend, status |
| `src/services/api.js` | The only place that talks to the backend |
| `src/test`, `e2e/` | Shared fixtures; Playwright specs and helpers |
