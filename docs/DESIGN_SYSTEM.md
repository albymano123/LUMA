# Design system and front-end architecture

LumaPath's interface is a custom design system, not a component-library theme. It was built to
feel like a navigation product: calm, precise and trustworthy, with motion that explains rather
than decorates.

## Principles

1. **Honest first.** Missing data is shown as "Data unavailable" or "Not mapped", never as a number.
   Selected and recommended are separate concepts with separate labels. Nothing says "safe".
2. **The map is the product.** On desktop the planner is a floating glass panel over a full-bleed map;
   on phones the map fills the screen and results live in a draggable bottom sheet.
3. **Meaning is never colour alone.** Every risk level has a word and an icon; selection has a label
   ("Selected", "Recommended"), not only an outline.
4. **Purposeful motion.** Fast (120 to 520 ms), eased, and switched off for `prefers-reduced-motion`.
5. **Performance is a feature.** Heavy code (map, 3D, vector engine) loads only where it is used.

## Design tokens (`src/styles/tokens.css`)

Every colour, size, radius, shadow and duration comes from CSS variables; components never hard-code
values.

| Group | Tokens |
|---|---|
| Palette | midnight inks (`--ink-950..500`), electric blue (`--blue-*`), cyan (`--cyan-*`), green, amber, red |
| Semantic | `--bg`, `--surface(-2,-3)`, `--line`, `--text`, `--muted`, `--faint`, `--accent`, `--positive/warning/danger/info` (+ `-bg`) |
| Type | Manrope (headings) and Inter (body), self-hosted variable fonts; fluid scale `--fs-display .. --fs-caption` |
| Space | 4 px scale `--s-1 .. --s-24` |
| Shape / depth | `--r-sm .. --r-2xl`, `--shadow-xs .. --shadow-lg`, glass tokens |
| Motion | `--ease-out`, `--ease-in-out`, `--dur-1 .. --dur-4` |

The `.on-dark` class redefines the semantic tokens for midnight surfaces (navigation bar, hero,
footer), so the same components work on light and dark backgrounds. Contrast is verified by axe on
every screen; muted text meets WCAG AA (4.5:1).

## Components (`src/ui`)

| Component | Notes |
|---|---|
| `Button`, `IconButton` | variants primary / secondary / ghost / glass / danger; loading state keeps its label; renders as a link with `as` |
| `GlassCard`, `Card`, `Badge`, `Notice`, `Skeleton`, `Tip` | surfaces and status; `Notice` is an alert only when asked to be |
| `SegmentedControl` | a labelled group of toggle buttons (`aria-pressed`) with a sliding indicator; `cards` variant for the Safest / Balanced / Time-efficient choice |
| `ScoreRing`, `FactorBar` | animated ring and bars for the score the backend supplied; a dash or "Data unavailable" when there is none |
| `Disclosure` | expandable section with a smooth height animation (CSS grid rows), `aria-expanded` / `aria-controls` |
| `Reveal`, `Counter` | scroll-triggered fade-in and count-up (motion) |
| `ToastProvider` | polite live-region messages |

Feature components live in `src/planner` (form, search, route list and details, emergency list,
weather, progress, bottom sheet, map controls), `src/map` (map, markers, basemap) and `src/pages`.

## Libraries and why

| Library | Purpose | Why this one |
|---|---|---|
| `motion` (LazyMotion, `domAnimation`) | reveals, page fades, menu | small feature bundle; layout animations avoided so the lighter set suffices |
| `lucide-react` | icons | tree-shaken, consistent, accessible |
| `three` | landing hero | one WebGL scene, lazy-loaded; raw three.js (no React wrapper) keeps it small |
| `leaflet` + `react-leaflet` + `leaflet.markercluster` | map, routes, clustered markers | mature, fast for DOM markers and route lines |
| `maplibre-gl` + `@maplibre/maplibre-gl-leaflet` | crisp vector basemap (OpenFreeMap "positron") | free, no API key; raster fallback when WebGL is unavailable |
| `@fontsource-variable/*` | fonts | self-hosted: no third-party requests, Latin subsets only |
| Vitest, Testing Library, Playwright, axe | tests | see [Testing](#testing) |

Material UI and Axios from the original front end were removed (about 115 kB gzip saved), replaced by
the token-based system above and `fetch`.

## The 3D hero and its fallbacks

`src/hero3d`: a route being drawn across a stylised city grid (instanced buildings in one draw call,
merged edge lines, a safety shell around the destination, emergency-service markers, a pulse that
travels the finished route, pointer parallax).

- The page paints with a light **2D SVG** version first (part of the first paint).
- After idle time, on capable devices only, the 3D chunk is downloaded and cross-fades in once its
  first frame is drawn.
- **No 3D** for: reduced motion, data-saver or slow connections, very low memory or few CPU cores,
  no WebGL. The scene also **downgrades itself** if it cannot hold about 24 fps.
- It stops rendering when off screen or in a background tab, caps the pixel ratio at 1.5 and disposes
  of everything on unmount.

## Real progress (not a fake progress bar)

The API streams `POST /safe-route/stream` as newline-delimited JSON. The loading panel ticks a step
only when the backend reports it finished (`routes`, `weather`, `map_data`); a stage that finished
without data (for example weather down) is shown with a warning, not as a success. The streaming
endpoint is exempt from gzip, which would otherwise hold events back until the end.

## Map

- Basemap: OpenFreeMap vector tiles through MapLibre, inside the Leaflet map. Falls back to
  OpenStreetMap raster tiles when WebGL is missing, when the visitor sets `localStorage["lumapath.map"] = "raster"`
  (lightweight map), or when the style cannot load.
- Routes: selected (blue, drawn in with an animation), recommended (green, dashed), alternatives (grey,
  highlight on hover, wide invisible hit-line for touch).
- Emergency services: animated custom markers, clustered when close; popups show only what OpenStreetMap
  holds (opening hours and phone appear only when mapped).
- Layers: Emergency services, Weather (conditions used in the score), Safety factors (real stretches of the
  route with no mapped buildings, computed by the backend).

## Phone layout

A floating trip card on top, a draggable bottom sheet with three snap points (peek, half, full) below.
Drag the grip, or use the button (keyboard and screen-reader friendly). The pointer is captured on
press so fast flicks are not lost; a tap on the grip is recognised on release.

## Testing

| Layer | Tool | What it covers |
|---|---|---|
| Unit / component | Vitest + Testing Library (102) | UI kit, route list and details states, honest-data rules, progress semantics, combobox, sheet, streaming client, helpers |
| Browser | Playwright (about 85 mocked + performance) | source to destination, autocomplete, all three preferences, layers, popups, clustering, errors, phone layout, sheet dragging, 3D fallbacks |
| Accessibility | axe-core via Playwright | landing, method, emergency, planner (empty, results, missing data, phone): no serious or critical violations; keyboard and focus checks |
| Performance | Playwright | download budgets, what loads where, LCP, layout shift, frame time |
| Live | Playwright (`LIVE=1`) | real backend, real data, real streamed progress |
| Deployment | Playwright (`DEPLOYED=1`) | health, headers, CSP with the vector basemap, same-origin API |

## Measured (production build)

| Metric | Value |
|---|---|
| Landing page JavaScript | about 122 kB gzip (initial), CSS 12 kB |
| 3D hero chunk | 137 kB gzip, lazy, only on capable devices |
| Planner JavaScript (lightweight map) | about 190 kB gzip; vector engine 286 kB gzip only when the vector map is used |
| Fonts | Latin subsets only: 24 kB + 47 kB |
| Landing LCP / CLS (headless, localhost) | about 1.0 s / 0 |
| Planner ready / CLS | about 1.0 s / 0 |
| Frame time while switching routes (software rendering) | about 60 ms worst frame |
