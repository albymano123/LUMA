import { expect, test } from "@playwright/test";

import { makeResponse, makeRoute } from "../src/test/fixtures.js";
import { PLACES, card, collectProblems, layer, mockApi, pickPlace, planTrip, preference, scoreRing } from "./helpers.js";

const SELECTED_STROKE = "#2f6bff";
const RECOMMENDED_STROKE = "#16a34a";
const HIGHLIGHT_STROKE = "#f59e0b";

const paths = (page, stroke) => page.locator(`.leaflet-overlay-pane path[stroke="${stroke}"]`);

const withHighlights = () => {
  const response = makeResponse();
  response.routes[1].highlights = [
    { kind: "unbuilt", label: "No mapped buildings nearby", from_km: 1.0, to_km: 1.9, length_km: 0.9,
      coordinates: [[76.322, 10.334], [76.315, 10.348], [76.31, 10.36]] },
  ];
  return response;
};

test.describe("planning a trip", () => {
  test("autocomplete suggests places while typing and fills the field", async ({ page }) => {
    const seen = await mockApi(page);
    await page.goto("/map");

    await page.getByLabel("Start", { exact: true }).fill("Cha");
    await expect(page.getByRole("option", { name: /Chalakudy/ })).toBeVisible();

    await page.getByRole("option", { name: /Chalakudy/ }).click();
    await expect(page.getByLabel("Start", { exact: true })).toHaveValue("Chalakudy");
    expect(seen.searches).toContain("cha");
  });

  test("the search box works from the keyboard", async ({ page }) => {
    await mockApi(page);
    await page.goto("/map");

    const start = page.getByLabel("Start", { exact: true });

    await start.fill("Chal");
    await expect(start).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("option", { name: /Chalakudy/ })).toBeVisible();

    await start.press("ArrowDown");
    await start.press("Enter");

    await expect(start).toHaveValue("Chalakudy");
    await expect(start).toHaveAttribute("aria-expanded", "false");

    // Escape closes an open list without choosing anything.
    const destination = page.getByLabel("Destination", { exact: true });
    await destination.fill("Kod");
    await expect(page.getByRole("option", { name: /Kodakara/ })).toBeVisible();
    await destination.press("Escape");
    await expect(page.getByRole("option")).toHaveCount(0);
  });

  test("clearing a place removes the trip", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);
    await expect(page.getByText("3 routes compared")).toBeVisible();

    await page.getByRole("button", { name: "Clear destination" }).click();

    await expect(page.getByText("3 routes compared")).toHaveCount(0);
    await expect(page.getByText("Plan a safer journey")).toBeVisible();
    await expect(paths(page, SELECTED_STROKE)).toHaveCount(0);
  });

  test("source and destination produce compared routes on the map", async ({ page }) => {
    const problems = collectProblems(page);
    const seen = await mockApi(page);

    await planTrip(page);

    await expect(page.getByText("3 routes compared")).toBeVisible();

    // The backend was asked for exactly the chosen places and mode.
    expect(seen.safeRoute).toHaveLength(1);
    expect(seen.safeRoute[0]).toMatchObject({
      source_lat: PLACES.chalakudy.lat,
      destination_lon: PLACES.kodakara.lon,
      mode: "walking",
    });

    // Three real route lines: the selected one plus two alternatives.
    await expect(paths(page, SELECTED_STROKE)).toHaveCount(1);
    expect(await page.locator(".leaflet-overlay-pane path").count()).toBeGreaterThanOrEqual(5);

    await expect(page.locator(".lp-pin--start")).toHaveCount(1);
    await expect(page.locator(".lp-pin--end")).toHaveCount(1);

    expect(problems).toEqual([]);
  });

  test("the recommended route is selected first and clearly explained", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    await expect(card(page, "Route B")).toHaveAttribute("aria-pressed", "true");
    await expect(card(page, "Route B")).toContainText("Recommended");
    await expect(card(page, "Route B")).toContainText("Selected");
    await expect(card(page, "Route A")).not.toContainText("Recommended");
    await expect(card(page, "Route A")).not.toContainText("Selected");
    // The active choice starts as Safest, because the safest route is selected.
    await expect(preference(page, "Safest")).toHaveAttribute("aria-pressed", "true");

    await expect(scoreRing(page, "Safety score 84 out of 100")).toBeVisible();
    await expect(page.getByText("Safest recommendation")).toBeVisible();
    await expect(page.getByText(/12 points ahead/)).toBeVisible();
    await expect(page.getByRole("article", { name: "Details for Route B" }).getByText("High confidence")).toBeVisible();
  });

  test("each route card shows score, risk, time, distance and key factors", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    const route = card(page, "Route B");

    await expect(route).toContainText("58 min");
    await expect(route).toContainText("4.6 km");
    await expect(route).toContainText("Lower risk");
    await expect(route).toContainText("Emergency");
    await expect(route).toContainText("Weather");
    await expect(route).toContainText("High confidence");
    // Score is available to screen readers without repeating the ring.
    await expect(route.getByText("Safety score 84 out of 100")).toBeAttached();
  });
});

test.describe("Safest / Balanced / Time-efficient", () => {
  test("Time-efficient selects the fastest route without calling it recommended", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    await preference(page, "Time-efficient").click();

    await expect(card(page, "Route A")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: "Route A" })).toBeVisible();
    await expect(scoreRing(page, "Safety score 61 out of 100")).toBeVisible();

    // The recommended route is still Route B, and the page says so.
    await expect(page.getByTestId("not-recommended-note")).toContainText("You chose Time-efficient");
    await expect(page.getByTestId("not-recommended-note")).toContainText("Route B");
    await expect(card(page, "Route A")).not.toContainText("Recommended");
    await expect(card(page, "Route B")).toContainText("Recommended");

    // Map: Route A selected (blue), Route B still drawn as the recommended (green dashed).
    await expect(paths(page, SELECTED_STROKE)).toHaveCount(1);
    await expect(paths(page, RECOMMENDED_STROKE)).toHaveCount(1);
  });

  test("Safest returns to the recommended route and the note disappears", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    await preference(page, "Time-efficient").click();
    await preference(page, "Safest").click();

    await expect(card(page, "Route B")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("not-recommended-note")).toHaveCount(0);
    await expect(preference(page, "Safest")).toHaveAttribute("aria-pressed", "true");
  });

  test("Balanced selects the balanced route", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    await preference(page, "Balanced").click();

    await expect(card(page, "Route C")).toHaveAttribute("aria-pressed", "true");
    await expect(scoreRing(page, "Safety score 72 out of 100")).toBeVisible();
  });

  test("Time-efficient stays chosen when the fastest route is also the safest", async ({ page }) => {
    const all = makeResponse({
      routes: [
        makeRoute({ id: "route-1", duration_min: 40, safety_score: 90, categories: ["fastest", "safest", "balanced"] }),
        makeRoute({ id: "route-2", duration_min: 55, safety_score: 70 }),
      ],
    });
    all.recommendation.route_id = "route-1";
    all.recommended_route_id = "route-1";
    all.recommendation.default_route_id = "route-1";
    all.default_route_id = "route-1";

    await mockApi(page, { routes: () => ({ body: all }) });
    await planTrip(page);

    await preference(page, "Time-efficient").click();

    await expect(preference(page, "Time-efficient")).toHaveAttribute("aria-pressed", "true");
    await expect(preference(page, "Safest")).toHaveAttribute("aria-pressed", "false");
  });

  test("tapping a route on the map selects it and updates the details", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    // Click the invisible wide hit-line of an alternative route.
    await page.locator('.leaflet-overlay-pane path[stroke-opacity="0"]').first().dispatchEvent("click");

    // Route B was selected first; tapping an alternative moves the selection.
    await expect(card(page, "Route B")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("not-recommended-note")).toBeVisible();
    await expect(paths(page, SELECTED_STROKE)).toHaveCount(1);
  });

  test("the selected route line is drawn with an animation that then settles", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    const line = page.locator("path.lp-route--selected");
    await expect(line).toHaveCount(1);

    // After the draw-in finishes the class is removed and the line is solid.
    await expect(line).not.toHaveClass(/lp-route--draw/, { timeout: 3000 });
    await expect(line).toHaveAttribute("stroke", SELECTED_STROKE);
  });
});

test.describe("honest safety information", () => {
  test("no route is called recommended when safety data is unavailable", async ({ page }) => {
    const response = makeResponse({
      state: "unavailable",
      routes: [
        makeRoute({ id: "route-1", duration_min: 45, safety_score: null, risk_level: "Insufficient data", data_confidence: "low", categories: ["fastest"] }),
        makeRoute({ id: "route-2", duration_min: 58, safety_score: null, risk_level: "Insufficient data", data_confidence: "low" }),
      ],
    });
    response.data_sources.emergency_services = false;

    await mockApi(page, { routes: () => ({ body: response }) });
    await planTrip(page);

    await expect(page.getByTestId("no-recommendation")).toContainText("no route can be recommended as safest");
    await expect(page.getByText("Recommended", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Safest recommendation")).toHaveCount(0);
    await expect(page.getByText(/Some safety data is temporarily unavailable/)).toBeVisible();
    await expect(page.getByText(/Couldn't load: emergency services/)).toBeVisible();

    // The quickest route is merely the default; no score is invented.
    await expect(card(page, "Route A")).toHaveAttribute("aria-pressed", "true");
    await expect(scoreRing(page, "No safety score")).toBeVisible();
    await expect(page.getByText("Insufficient data").first()).toBeVisible();
    await expect(preference(page, "Safest")).toBeDisabled();
    // With nothing recommendable, the quickest route is the active choice.
    await expect(preference(page, "Time-efficient")).toHaveAttribute("aria-pressed", "true");

    // No green "recommended" route line on the map.
    await expect(paths(page, RECOMMENDED_STROKE)).toHaveCount(0);
  });

  test("factors without data say so instead of showing a score", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    await expect(page.getByText("Data unavailable").first()).toBeVisible();
    await expect(page.getByText(/Street lighting is not mapped for most of this route/)).toBeVisible();

    await page.getByRole("button", { name: "Route environment" }).click();
    await expect(page.getByText("Not mapped").first()).toBeVisible();
  });

  test("a factor that does not apply to the mode is not shown as missing", async ({ page }) => {
    const driving = makeResponse();
    driving.routes.forEach((route) => {
      route.factors = route.factors.map((factor) =>
        factor.key === "activity" ? { ...factor, score: null, weight: 0, available: false, applicable: false } : factor
      );
    });

    await mockApi(page, { routes: () => ({ body: driving }) });
    await planTrip(page);

    await expect(page.getByText("Not used for this mode")).toBeVisible();
  });

  test("never claims a route is guaranteed safe and shows the disclaimer", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    await expect(page.getByText(/not a guarantee of safety/)).toBeVisible();

    const text = (await page.locator("body").innerText()).toLowerCase();
    expect(text).not.toMatch(/guaranteed safe|100% safe|completely safe/);
  });

  test("the experimental ML estimate is clearly not trained", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    await page.getByRole("button", { name: "Experimental ML estimate" }).click();
    await expect(page.getByText(/Not available: No model has been trained/)).toBeVisible();
  });

  test("the reasons behind a score can be collapsed and expanded", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    const why = page.getByRole("button", { name: /Why this route/ });

    await expect(why).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(/Good mapped availability of hospitals/)).toBeVisible();

    await why.click();
    await expect(why).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText(/Good mapped availability of hospitals/)).toBeHidden();

    await why.click();
    await expect(page.getByText(/Good mapped availability of hospitals/)).toBeVisible();
  });
});

test.describe("emergency services", () => {
  test("hospital and police markers appear for the selected route", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    await expect(page.locator(".lp-pin--hospital")).toHaveCount(1);
    await expect(page.locator(".lp-pin--police")).toHaveCount(1);
  });

  test("a popup shows only what is mapped: hours and phone appear only when they exist", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    await page.locator(".lp-pin--hospital").click();
    const popup = page.locator(".leaflet-popup");

    await expect(popup).toContainText("Test Hospital");
    await expect(popup).toContainText("Emergency department");
    await expect(popup).toContainText("Hours: Open 24 hours");
    await expect(popup.locator('a[href="tel:+91 480 2700001"]')).toContainText("Call");

    // The hospital popup can sit on top of neighbouring markers: close it first.
    await page.locator(".leaflet-popup-close-button").click();
    await page.locator(".lp-pin--police").click();
    const police = page.locator(".leaflet-popup");

    await expect(police).toContainText("Test Police Station");
    await expect(police).not.toContainText("Hours:");
    await expect(police.locator("a[href^='tel:']")).toHaveCount(0);
  });

  test("the list shows the same services with a call link and a show-on-map action", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    const list = page.getByRole("region", { name: "Nearby emergency services" });

    await expect(list).toContainText("Test Hospital");
    await expect(list).toContainText("Open 24 hours");
    await expect(list.getByRole("link", { name: "Call Test Hospital" })).toHaveAttribute("href", "tel:+91 480 2700001");

    await list.getByRole("button", { name: "Show Test Hospital on the map" }).click();
    await expect(page.locator(".leaflet-popup")).toContainText("Test Hospital");

    await list.getByRole("button", { name: /Police/ }).click();
    await expect(list).toContainText("Test Police Station");
    await expect(list.getByRole("link", { name: /Call Test Police/ })).toHaveCount(0);
  });

  test("an empty category says so and points to 112", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    const list = page.getByRole("region", { name: "Nearby emergency services" });
    await list.getByRole("button", { name: /Fire/ }).click();

    await expect(list).toContainText("None mapped within 2 km");
    await expect(list).toContainText("112");
  });

  test("markers follow the selected route", async ({ page }) => {
    const response = makeResponse();
    response.routes[0].emergency_services = [];   // Route A has none mapped
    await mockApi(page, { routes: () => ({ body: response }) });
    await planTrip(page);

    await expect(page.locator(".lp-pin--hospital")).toHaveCount(1);

    await preference(page, "Time-efficient").click();

    await expect(page.locator(".lp-pin--hospital")).toHaveCount(0);
  });

  test("many nearby services are grouped into a numbered cluster", async ({ page }) => {
    const response = makeResponse();
    response.routes[1].emergency_services = Array.from({ length: 8 }, (_, index) => ({
      id: `node-${index}`, kind: "hospital", name: `Hospital ${index}`, phone: null, emergency_ward: false,
      opening_hours: null, lat: 10.3300 + index * 0.00015, lon: 76.3300 + index * 0.00015, distance_m: 200, along_route_km: 1,
    }));

    await mockApi(page, { routes: () => ({ body: response }) });
    await planTrip(page);

    await expect(page.locator(".lp-cluster")).toHaveCount(1);
    await expect(page.locator(".lp-cluster")).toContainText("8");
  });
});

test.describe("map layers", () => {
  test("emergency services can be switched off and on", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    await expect(layer(page, "Emergency services")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".lp-pin--hospital")).toHaveCount(1);

    await layer(page, "Emergency services").click();
    await expect(layer(page, "Emergency services")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".lp-pin--hospital")).toHaveCount(0);

    await layer(page, "Emergency services").click();
    await expect(page.locator(".lp-pin--hospital")).toHaveCount(1);
  });

  test("the weather layer shows the conditions used for the score", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    await expect(page.getByRole("region", { name: "Weather on this route" })).toHaveCount(0);

    await layer(page, "Weather").click();

    const chip = page.getByRole("region", { name: "Weather on this route" });
    await expect(chip).toContainText("29°");
    await expect(chip).toContainText("Partly cloudy");
  });

  test("the safety-factors layer draws real isolated stretches and explains them", async ({ page }) => {
    await mockApi(page, { routes: () => ({ body: withHighlights() }) });
    await planTrip(page);

    await expect(paths(page, HIGHLIGHT_STROKE)).toHaveCount(0);

    await layer(page, "Safety factors").click();

    await expect(paths(page, HIGHLIGHT_STROKE)).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Safety factors layer" })).toContainText("1 stretch with no mapped buildings nearby");

    await layer(page, "Safety factors").click();
    await expect(paths(page, HIGHLIGHT_STROKE)).toHaveCount(0);
  });

  test("a route with no isolated stretch says so instead of drawing nothing silently", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    await layer(page, "Safety factors").click();

    await expect(page.getByRole("region", { name: "Safety factors layer" })).toContainText("No long stretches without mapped buildings");
  });
});

test.describe("weather", () => {
  test("weather details are shown for the route", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    const weather = page.getByRole("region", { name: "Weather", exact: true });

    await expect(weather).toContainText("29°");
    await expect(weather).toContainText("Partly cloudy");
    await expect(weather).toContainText("Feels like");
    await expect(weather).toContainText("8 km/h");
  });

  test("a missing weather source is reported, not hidden", async ({ page }) => {
    const response = makeResponse();
    response.data_sources.weather = false;
    response.routes.forEach((route) => { route.weather = null; });

    await mockApi(page, { routes: () => ({ body: response }) });
    await planTrip(page);

    await expect(page.getByText(/Couldn't load: weather/)).toBeVisible();
    await expect(page.getByText(/Weather data is unavailable for this route/)).toBeVisible();
  });
});

test.describe("loading and errors", () => {
  test("a slow analysis shows honest progress, then the results", async ({ page }) => {
    await mockApi(page, {
      routes: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return { body: makeResponse() };
      },
    });

    await planTrip(page);

    const progress = page.getByRole("status", { name: "Analysing your trip" });

    await expect(progress).toBeVisible();
    await expect(progress).toContainText("Finding routes");
    await expect(progress).toContainText("Checking the weather");
    await expect(progress).toContainText("Loading roads, buildings and emergency services");
    await expect(progress).toContainText("Scoring and comparing routes");
    // Nothing is ticked as done before the backend has reported it.
    await expect(progress.locator('[data-state="done"]')).toHaveCount(0);

    await expect(page.getByText("3 routes compared")).toBeVisible();
    await expect(progress).toHaveCount(0);
  });

  test("a server error shows a helpful message and Retry recovers", async ({ page }) => {
    await mockApi(page, {
      routes: (_request, call) =>
        call === 1
          ? { status: 502, body: { detail: { message: "The routing service is unavailable right now. Please try again shortly." } } }
          : { body: makeResponse() },
    });

    await planTrip(page);

    await expect(page.getByRole("alert")).toContainText("Routes couldn't be generated");
    await expect(page.getByRole("alert")).toContainText("The routing service is unavailable right now");

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("3 routes compared")).toBeVisible();
  });

  test("rate limiting is explained", async ({ page }) => {
    await mockApi(page, {
      routes: () => ({ status: 429, body: { detail: { message: "Too many requests. Please wait a moment and try again." } } }),
    });

    await planTrip(page);

    await expect(page.getByRole("alert")).toContainText("Please slow down");
    await expect(page.getByRole("alert")).toContainText("Too many requests. Please wait a moment and try again.");
  });

  test("an unreachable backend is reported in plain language", async ({ page }) => {
    await mockApi(page, { routes: () => ({ abort: true }) });

    await planTrip(page);

    await expect(page.getByRole("alert")).toContainText("Can't reach LumaPath");
  });

  test("no route found is a clear state", async ({ page }) => {
    await mockApi(page, {
      routes: () => ({ status: 404, body: { detail: { message: "No route could be found between these locations." } } }),
    });

    await planTrip(page);

    await expect(page.getByRole("alert")).toContainText("No route found");
    await expect(page.getByRole("alert")).toContainText("No route could be found between these locations.");
  });

  test("raw server errors are never shown to the user", async ({ page }) => {
    await mockApi(page, {
      routes: () => ({ status: 500, body: { detail: { message: "Unable to analyse routes right now. Please try again." } } }),
    });

    await planTrip(page);

    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/Traceback|Exception|stack|undefined|\[object/i);
  });

  test("a new search clears the previous trip's results while loading", async ({ page }) => {
    await mockApi(page, {
      routes: async (_request, call) => {
        // Make the second analysis slow enough to observe the loading state.
        if (call === 2) await new Promise((resolve) => setTimeout(resolve, 1500));
        return { body: makeResponse() };
      },
    });

    await planTrip(page);
    await expect(page.getByText("3 routes compared")).toBeVisible();
    await expect(paths(page, SELECTED_STROKE)).toHaveCount(1);

    // A different start -> a new analysis begins.
    await pickPlace(page, "Start", "Kodakara", PLACES.kodakara);

    // While it runs, nothing from the previous trip may stay on screen.
    await expect(page.getByRole("status", { name: "Analysing your trip" })).toBeVisible();
    await expect(page.getByText("3 routes compared")).toHaveCount(0);
    await expect(paths(page, SELECTED_STROKE)).toHaveCount(0);
    await expect(page.locator(".lp-pin--hospital")).toHaveCount(0);

    await expect(page.getByText("3 routes compared")).toBeVisible();
  });

  test("changing travel mode asks the backend again with that mode", async ({ page }) => {
    const seen = await mockApi(page);
    await planTrip(page);
    await expect(page.getByText("3 routes compared")).toBeVisible();

    await page.getByRole("button", { name: "Drive", exact: true }).click();

    await expect.poll(() => seen.safeRoute.length).toBe(2);
    expect(seen.safeRoute[1].mode).toBe("driving");
  });

  test("swap exchanges start and destination", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);
    await expect(page.getByText("3 routes compared")).toBeVisible();

    await page.getByRole("button", { name: "Swap start and destination" }).click();

    await expect(page.getByLabel("Start", { exact: true })).toHaveValue("Kodakara");
    await expect(page.getByLabel("Destination", { exact: true })).toHaveValue("Chalakudy");
  });
});

test.describe("current location", () => {
  test("uses the browser's location as the start", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 10.3, longitude: 76.33 });

    const seen = await mockApi(page);
    await page.goto("/map");

    await page.getByRole("button", { name: "Use my current location" }).click();
    await expect(page.getByLabel("Start", { exact: true })).toHaveValue("Your location");

    await pickPlace(page, "Destination", "Kodakara", PLACES.kodakara);
    await expect(page.getByText("3 routes compared")).toBeVisible();

    expect(seen.safeRoute[0].source_lat).toBeCloseTo(10.3, 3);
  });

  test("denied permission shows a clear message and the app keeps working", async ({ page, context }) => {
    await context.clearPermissions();
    await mockApi(page);
    await page.goto("/map");

    await page.getByRole("button", { name: "Use my current location" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Location permission was denied|Your location is unavailable/ })).toBeVisible();

    await pickPlace(page, "Start", "Chalakudy", PLACES.chalakudy);
    await pickPlace(page, "Destination", "Kodakara", PLACES.kodakara);
    await expect(page.getByText("3 routes compared")).toBeVisible();
  });
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("fits the screen, keeps the map visible and results reachable", async ({ page }) => {
    const problems = collectProblems(page);
    await mockApi(page);
    await planTrip(page);

    const sheet = page.locator(".sheet");

    await expect(sheet.getByText(/3 routes/).first()).toBeVisible();
    await expect(sheet).toHaveAttribute("data-snap", "half");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const map = await page.locator(".leaflet-container").boundingBox();
    expect(map.height).toBeGreaterThan(300);
    expect(map.width).toBeGreaterThan(340);

    // Emergency access stays one tap away.
    await expect(page.getByRole("link", { name: "Call emergency number 112" })).toBeVisible();

    // Expand the sheet, then tap a route card.
    await page.getByRole("button", { name: "Expand results" }).click();
    await expect(sheet).toHaveAttribute("data-snap", "full");

    await card(page, "Route C").scrollIntoViewIfNeeded();
    await card(page, "Route C").tap();
    await expect(card(page, "Route C")).toHaveAttribute("aria-pressed", "true");

    expect(problems).toEqual([]);
  });

  test("the sheet snaps between peek, half and full, by button and by dragging", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    const sheet = page.locator(".sheet");
    await expect(sheet).toHaveAttribute("data-snap", "half");

    await page.getByRole("button", { name: "Expand results" }).click();
    await expect(sheet).toHaveAttribute("data-snap", "full");

    await page.getByRole("button", { name: "Collapse results" }).click();
    await expect(sheet).toHaveAttribute("data-snap", "peek");
    await page.waitForTimeout(800); // let the sheet finish sliding before measuring it

    // Drag the grip upwards from peek.
    const grip = await page.locator(".sheet__top").boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + 14);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2, grip.y - 260, { steps: 8 });
    await page.mouse.up();

    await expect(sheet).not.toHaveAttribute("data-snap", "peek");
  });

  test("the trip card collapses to a summary and can be edited again", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    const edit = page.getByRole("button", { name: "Edit trip" });

    await expect(edit).toContainText("Chalakudy");
    await expect(edit).toContainText("Kodakara");

    await edit.click();
    await expect(page.getByLabel("Destination", { exact: true })).toBeVisible();
  });

  test("layer toggles and the preference switch are reachable by touch", async ({ page }) => {
    await mockApi(page, { routes: () => ({ body: withHighlights() }) });
    await planTrip(page);

    await layer(page, "Safety factors").tap();
    await expect(paths(page, HIGHLIGHT_STROKE)).toHaveCount(1);

    await preference(page, "Balanced").tap();
    await expect(card(page, "Route C")).toHaveAttribute("aria-pressed", "true");
  });

  test("the landing page fits a phone too", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
