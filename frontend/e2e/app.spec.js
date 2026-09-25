import { expect, test } from "@playwright/test";

import { makeResponse, makeRoute } from "../src/test/fixtures.js";
import { PLACES, card, collectProblems, mockApi, pickPlace, planTrip, preference, scoreRing } from "./helpers.js";

const SELECTED_STROKE = "#2563eb";
const RECOMMENDED_STROKE = "#16a34a";

const paths = (page, stroke) => page.locator(`.leaflet-overlay-pane path[stroke="${stroke}"]`);

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

    // Three real route lines: selected one plus two alternatives.
    await expect(paths(page, SELECTED_STROKE)).toHaveCount(1);
    expect(await page.locator(".leaflet-overlay-pane path").count()).toBeGreaterThanOrEqual(5);

    // Start and destination markers.
    await expect(page.locator(".lp-pin--start")).toHaveCount(1);
    await expect(page.locator(".lp-pin--end")).toHaveCount(1);

    expect(problems).toEqual([]);
  });

  test("the recommended route is selected first and clearly explained", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    await expect(card(page, "Route B")).toHaveAttribute("aria-pressed", "true");
    await expect(card(page, "Route B")).toContainText("Recommended");
    await expect(card(page, "Route A")).not.toContainText("Recommended");
    // The active choice starts as Safest, because the safest route is selected.
    await expect(preference(page, "Safest")).toHaveAttribute("aria-pressed", "true");

    await expect(scoreRing(page, "Safety score 84 out of 100")).toBeVisible();
    await expect(page.getByText(/12 points ahead/)).toBeVisible();
    await expect(page.getByText("High confidence")).toBeVisible();
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
    const alternative = page.locator('.leaflet-overlay-pane path[stroke-opacity="0"]').first();
    await alternative.dispatchEvent("click");

    // Route B was selected first; tapping an alternative moves the selection.
    await expect(card(page, "Route B")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("not-recommended-note")).toBeVisible();
    await expect(paths(page, SELECTED_STROKE)).toHaveCount(1);
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
    await expect(page.getByText(/Some safety data couldn't be loaded/)).toContainText("emergency services");

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

    await expect(page.getByText("No data – not scored")).toBeVisible();
    await expect(page.getByText(/Street lighting is not mapped for most of this route/)).toBeVisible();
    await expect(page.getByText("Not mapped").first()).toBeVisible();
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

    await page.getByText("Experimental ML estimate").click();
    await expect(page.getByText(/Not available: No model has been trained/)).toBeVisible();
  });
});

test.describe("emergency services and weather", () => {
  test("hospital and police markers appear for the selected route with details", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    await expect(page.locator(".lp-pin--hospital")).toHaveCount(1);
    await expect(page.locator(".lp-pin--police")).toHaveCount(1);

    await page.locator(".lp-pin--hospital").click();
    await expect(page.locator(".leaflet-popup")).toContainText("Test Hospital");
    await expect(page.locator(".leaflet-popup")).toContainText("Emergency department");
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

  test("weather is shown for the route", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    await expect(page.getByRole("heading", { name: "Weather" })).toBeVisible();
    await expect(page.getByText(/29/).first()).toBeVisible();
  });

  test("a missing weather source is reported, not hidden", async ({ page }) => {
    const response = makeResponse();
    response.data_sources.weather = false;
    response.routes.forEach((route) => { route.weather = null; });

    await mockApi(page, { routes: () => ({ body: response }) });
    await planTrip(page);

    await expect(page.getByText(/Some safety data couldn't be loaded right now \(weather\)/)).toBeVisible();
  });
});

test.describe("errors and edge cases", () => {
  test("a server error shows a helpful message and Retry recovers", async ({ page }) => {
    await mockApi(page, {
      routes: (_request, call) =>
        call === 1
          ? { status: 502, body: { detail: { message: "The routing service is unavailable right now. Please try again shortly." } } }
          : { body: makeResponse() },
    });

    await planTrip(page);

    await expect(page.getByText("The routing service is unavailable right now")).toBeVisible();

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("3 routes compared")).toBeVisible();
  });

  test("rate limiting is explained", async ({ page }) => {
    await mockApi(page, {
      routes: () => ({ status: 429, body: { detail: { message: "Too many requests. Please wait a moment and try again." } } }),
    });

    await planTrip(page);

    await expect(page.getByText("Too many requests. Please wait a moment and try again.")).toBeVisible();
  });

  test("an unreachable backend is reported in plain language", async ({ page }) => {
    await mockApi(page, { routes: () => ({ abort: true }) });

    await planTrip(page);

    await expect(page.getByText(/Can't reach the LumaPath server/)).toBeVisible();
  });

  test("no routes found is a clear state", async ({ page }) => {
    await mockApi(page, {
      routes: () => ({ status: 404, body: { detail: { message: "No route could be found between these locations." } } }),
    });

    await planTrip(page);

    await expect(page.getByText("No route could be found between these locations.")).toBeVisible();
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

    // Same start, different destination text -> a new analysis begins.
    await pickPlace(page, "Start", "Kodakara", PLACES.kodakara);

    // While it runs, nothing from the previous trip may stay on screen.
    await expect(page.getByText(/Finding alternative routes|Checking|Scoring/)).toBeVisible();
    await expect(page.getByText("3 routes compared")).toHaveCount(0);
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(0);
    await expect(page.locator(".lp-pin--hospital")).toHaveCount(0);

    await expect(page.getByText("3 routes compared")).toBeVisible();
  });

  test("changing travel mode asks the backend again with that mode", async ({ page }) => {
    const seen = await mockApi(page);
    await planTrip(page);
    await expect(page.getByText("3 routes compared")).toBeVisible();

    await page.getByRole("button", { name: "Drive" }).click();

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
    await expect(page.getByText(/Location permission was denied|Your location is unavailable/)).toBeVisible();

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

    await expect(page.getByText("3 routes compared")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const map = await page.locator(".leaflet-container").boundingBox();
    expect(map.height).toBeGreaterThan(200);
    expect(map.width).toBeGreaterThan(340);

    // Route cards are usable by touch.
    await card(page, "Route C").scrollIntoViewIfNeeded();
    await card(page, "Route C").tap();
    await expect(card(page, "Route C")).toHaveAttribute("aria-pressed", "true");

    expect(problems).toEqual([]);
  });

  test("the landing page fits a phone too", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("navigation", () => {
  test("landing page leads to the planner and the emergency page loads", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await page.getByRole("link", { name: /Plan/i }).first().click();
    await expect(page).toHaveURL(/\/map/);
    await expect(page.getByLabel("Destination", { exact: true })).toBeVisible();

    await page.goto("/emergency");
    await expect(page.getByText(/112/).first()).toBeVisible();
  });
});
