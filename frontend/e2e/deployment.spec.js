import { expect, test } from "@playwright/test";

import { collectProblems, mockApi, planTrip } from "./helpers.js";

// Checks a running deployment where one service serves both the API and
// the web app (the Docker image). Run with:
//
//   BASE_URL=http://127.0.0.1:8010 DEPLOYED=1 npx playwright test e2e/deployment.spec.js
test.skip(!process.env.DEPLOYED, "set DEPLOYED=1 and BASE_URL to test a running deployment");

test("health check reports the map database", async ({ request }) => {
  const response = await request.get("/health");
  const body = await response.json();

  expect(response.status()).toBe(200);
  expect(body.status).toBe("healthy");
  expect(body.geo_database.available).toBe(true);
  expect(body.geo_database.ways).toBeGreaterThan(300_000);
});

test("the API documentation is served", async ({ request }) => {
  const response = await request.get("/openapi.json");

  expect(response.status()).toBe(200);
  expect(Object.keys((await response.json()).paths)).toContain("/safe-route");
});

test("page routes work when opened directly and after a reload", async ({ page }) => {
  for (const path of ["/", "/map", "/about", "/emergency"]) {
    const response = await page.goto(path);
    expect(response.status(), path).toBe(200);
  }

  await page.goto("/map");
  await page.reload();
  await expect(page.getByLabel("Destination", { exact: true })).toBeVisible();
});

test("security and caching headers are set", async ({ request }) => {
  const page = await request.get("/map");
  const headers = page.headers();

  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["cache-control"]).toBe("no-cache");

  const html = await page.text();
  const asset = html.match(/\/assets\/[^"]+\.js/)[0];
  const assetResponse = await request.get(asset);

  expect(assetResponse.headers()["cache-control"]).toContain("immutable");
});

test("files cannot be read from outside the app folder", async ({ request }) => {
  const response = await request.get("/..%2f..%2fmain.py");
  const body = await response.text();

  expect(body).not.toContain("FastAPI");
});

test("the CSP allows the vector basemap (no violations, no console errors)", async ({ page }) => {
  // No mocks and no forced raster map: the real vector style loads from
  // OpenFreeMap. Needs the internet; only CSP problems are asserted on.
  const violations = [];

  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  page.on("pageerror", (error) => {
    if (/Content Security Policy|Refused to/i.test(error.message)) violations.push(error.message);
  });

  await page.goto("/map");
  await page.waitForTimeout(8000);

  expect(violations).toEqual([]);
  // The worker files are served by the app itself.
  const worker = await page.request.get("/maplibre/maplibre-gl-worker.mjs");
  expect(worker.status()).toBe(200);
  expect(worker.headers()["content-type"]).toMatch(/javascript/);
});

test("the app runs under the content security policy without errors", async ({ page }) => {
  const problems = collectProblems(page);
  await mockApi(page);

  await planTrip(page);
  await expect(page.getByText("3 routes compared")).toBeVisible();

  // Any blocked script, style, font or image would show up here.
  expect(problems).toEqual([]);
});

test("the real API answers from the same origin", async ({ request }) => {
  const response = await request.post("/safe-route", {
    data: {
      source_lat: 10.3042, source_lon: 76.3371,
      destination_lat: 10.3717, destination_lon: 76.3042, mode: "walking",
    },
    timeout: 90_000,
  });
  const body = await response.json();

  expect(response.status()).toBe(200);
  expect(body.geo_source.type).toBe("local");
  expect(body.routes.length).toBeGreaterThan(1);
});
