import { makeResponse } from "../src/test/fixtures.js";

export const PLACES = {
  chalakudy: { id: "N1", name: "Chalakudy", description: "Thrissur, Kerala, India", type: "town", lat: 10.3042, lon: 76.3371 },
  kodakara: { id: "N2", name: "Kodakara", description: "Thrissur, Kerala, India", type: "village", lat: 10.3717, lon: 76.3042 },
};

// 1x1 transparent PNG, so map tiles never need the internet.
const TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

const json = (body, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

// What the backend streams: stages as they finish, then the result.
function ndjson(result) {
  const events = [
    { event: "routes", count: result.routes.length },
    { event: "weather", available: result.data_sources.weather !== false },
    {
      event: "map_data",
      source: result.geo_source?.type === "live" ? "overpass" : "local",
      emergency_services: result.data_sources.emergency_services !== false,
      road_network: result.data_sources.road_network !== false,
    },
    { event: "result", data: result },
  ];

  return events.map((event) => JSON.stringify(event)).join("\n") + "\n";
}

/**
 * Replaces every network call the app makes.
 *   routes(request, callNumber) -> {status?, body} | {abort: true}
 * Returns a recorder so tests can assert what the app asked for.
 *
 * The lightweight raster basemap is forced (a documented visitor setting),
 * so tests never depend on the vector-tile servers.
 */
export async function mockApi(page, { routes = () => ({ body: makeResponse() }) } = {}) {
  const seen = { safeRoute: [], searches: [] };

  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("lumapath.map", "raster");
    } catch {
      // Storage unavailable: the default map is used.
    }
  });

  await page.route(/tile\.openstreetmap\.org/, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: TILE })
  );

  await page.route("**/geocode/search**", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q").toLowerCase();
    seen.searches.push(q);

    const results = Object.values(PLACES).filter((place) =>
      place.name.toLowerCase().startsWith(q.slice(0, 3))
    );

    return route.fulfill(json({ results }));
  });

  await page.route("**/geocode/reverse**", (route) =>
    route.fulfill(json({ id: "point", name: "Near Chalakudy", description: "Kerala, India", lat: 10.3, lon: 76.33 }))
  );

  await page.route("**/health", (route) =>
    route.fulfill(json({
      status: "healthy",
      geo_database: {
        available: true, source: "Test extract", extract_date: "2026-09-23",
        ways: 495875, places: { hospital: 5270, clinic: 2170, police: 852, fire_station: 181, activity: 142881 },
      },
    }))
  );

  const handle = (streaming) => async (route) => {
    seen.safeRoute.push(JSON.parse(route.request().postData()));

    const answer = await routes(route.request(), seen.safeRoute.length);

    if (answer.abort) {
      return route.abort();
    }

    if (answer.status && answer.status !== 200) {
      return route.fulfill(json(answer.body, answer.status));
    }

    if (streaming) {
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: ndjson(answer.body) });
    }

    return route.fulfill(json(answer.body));
  };

  await page.route("**/safe-route/stream", handle(true));
  await page.route("**/safe-route", handle(false));

  return seen;
}

export async function pickPlace(page, label, typed, place) {
  await page.getByLabel(label, { exact: true }).fill(typed);
  await page.getByRole("option", { name: new RegExp(place.name) }).click();
}

// Chalakudy -> Kodakara, using the suggestion lists like a user.
export async function planTrip(page) {
  await page.goto("/map");
  await pickPlace(page, "Start", "Chalakudy", PLACES.chalakudy);
  await pickPlace(page, "Destination", "Kodakara", PLACES.kodakara);
}

export function collectProblems(page) {
  const problems = [];

  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });

  return problems;
}

export const card = (page, name) => page.getByRole("button", { name: new RegExp(name) });

// The Safest / Balanced / Time-efficient switch (route cards also mention
// those words, so scope to the labelled group).
export const preference = (page, name) =>
  page.getByRole("group", { name: "Route preference" }).getByRole("button", { name, exact: true });

// The score ring in the details panel (cards show the score as text).
export const scoreRing = (page, text) => page.getByRole("img", { name: text });

// The map-layer toggles.
export const layer = (page, name) =>
  page.getByRole("group", { name: "Map layers" }).getByRole("button", { name });
