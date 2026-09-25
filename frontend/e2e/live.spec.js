import { expect, test } from "@playwright/test";

import { collectProblems } from "./helpers.js";

// Real backend, real map data and real public services. Slower and
// dependent on the internet, so it only runs on request:
//
//   1. start the backend   (cd backend && venv/Scripts/python -m uvicorn main:app --port 8000)
//   2. LIVE=1 npx playwright test e2e/live.spec.js
test.skip(!process.env.LIVE, "set LIVE=1 with the backend running to run live tests");

test.setTimeout(120_000);

const TRIPS = [
  { name: "Chalakudy to Kodakara", from: "Chalakudy", to: "Kodakara", mode: "Walk" },
  { name: "Ernakulam to Fort Kochi", from: "Ernakulam South", to: "Fort Kochi", mode: "Drive" },
];

for (const trip of TRIPS) {
  test(`real analysis: ${trip.name}`, async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto("/map");

    await page.getByRole("button", { name: trip.mode, exact: true }).click();

    // Record which analysis steps tick, and when, to prove they are real.
    await page.evaluate(() => {
      window.__steps = [];
      const seen = new Set();
      new MutationObserver(() => {
        document.querySelectorAll(".ap__step").forEach((step) => {
          const key = step.querySelector(".ap__title")?.textContent;
          const state = step.dataset.state;

          if ((state === "done" || state === "warn") && !seen.has(key)) {
            seen.add(key);
            window.__steps.push({ key, at: performance.now() });
          }
        });
      }).observe(document.body, { subtree: true, attributes: true, childList: true, attributeFilter: ["data-state"] });
    });

    for (const [label, text] of [["Start", trip.from], ["Destination", trip.to]]) {
      await page.getByLabel(label, { exact: true }).fill(text);
      const option = page.getByRole("option").first();
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();
    }

    await expect(page.getByText(/\d+ routes? compared/).first()).toBeVisible({ timeout: 90_000 });

    // The steps ticked in the order the backend really finished them.
    const steps = await page.evaluate(() => window.__steps);
    const order = steps.map((step) => step.key);

    expect(order.indexOf("Finding routes")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("Finding routes")).toBeLessThan(order.indexOf("Checking the weather"));
    expect(order.indexOf("Checking the weather")).toBeLessThan(order.indexOf("Loading roads, buildings and emergency services"));

    // Real routes drawn, emergency services from the local map database.
    expect(await page.locator(".leaflet-overlay-pane path").count()).toBeGreaterThan(1);
    await expect(page.locator(".lp-pin--hospital, .lp-pin--clinic").first()).toBeVisible();

    // The vector basemap actually loaded (no fallback to plain raster tiles).
    await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(1);

    // A score, a risk level and the data source credit are shown.
    await expect(page.getByText(/Lower risk|Moderate risk|Higher risk/).first()).toBeVisible();
    await expect(page.getByText(/OpenStreetMap extract/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Experimental ML estimate" })).toBeVisible();

    // Exactly one route is selected at a time.
    const selected = await page.locator('button[aria-pressed="true"]').filter({ hasText: /Route [A-E]/ }).count();
    expect(selected).toBe(1);

    expect(problems.filter((p) => !/Failed to load resource/.test(p))).toEqual([]);
  });
}

test("live: picking a place from search works with the real geocoder", async ({ page }) => {
  await page.goto("/map");

  await page.getByLabel("Start", { exact: true }).fill("Chalakudy");
  await page.getByRole("option").first().click();

  await expect(page.getByLabel("Start", { exact: true })).toHaveValue(/Chalakud/i);
});
