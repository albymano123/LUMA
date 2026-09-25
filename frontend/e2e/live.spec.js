import { expect, test } from "@playwright/test";

import { card, collectProblems } from "./helpers.js";

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

    await page.getByRole("button", { name: trip.mode }).click();

    for (const [label, text] of [["Start", trip.from], ["Destination", trip.to]]) {
      await page.getByLabel(label, { exact: true }).fill(text);
      const option = page.getByRole("option").first();
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();
    }

    await expect(page.getByText(/\d+ routes? compared/)).toBeVisible({ timeout: 90_000 });

    // Real routes drawn, emergency services from the local map database.
    expect(await page.locator(".leaflet-overlay-pane path").count()).toBeGreaterThan(1);
    await expect(page.locator(".lp-pin--hospital, .lp-pin--clinic").first()).toBeVisible();

    // A score, a risk level and the data source credit are shown.
    await expect(page.getByText(/Lower risk|Moderate risk|Higher risk/).first()).toBeVisible();
    await expect(page.getByText(/OpenStreetMap extract/)).toBeVisible();
    await expect(page.getByText("Experimental ML estimate")).toBeVisible();

    // Exactly one route is selected at a time.
    const selected = await page.locator('button[aria-pressed="true"]').filter({ hasText: /Route [A-E]/ }).count();
    expect(selected).toBe(1);

    expect(card(page, "Route A")).toBeTruthy();
    expect(problems.filter((p) => !/Failed to load resource/.test(p))).toEqual([]);
  });
}

test("live: picking a place from search works with the real geocoder", async ({ page }) => {
  await page.goto("/map");

  await page.getByLabel("Start", { exact: true }).fill("Chalakudy");
  await page.getByRole("option").first().click();

  await expect(page.getByLabel("Start", { exact: true })).toHaveValue(/Chalakud/i);
});
