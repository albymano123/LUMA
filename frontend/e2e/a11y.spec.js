import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { makeResponse } from "../src/test/fixtures.js";
import { mockApi, planTrip } from "./helpers.js";

// Automated accessibility checks (WCAG 2.1 A/AA rules) on every screen.
// Automated tools cannot find everything, but serious and critical
// violations must never ship.
async function audit(page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // The map canvas is third-party; the app's own controls are checked.
    .exclude(".leaflet-container")
    .analyze();

  return results.violations
    .filter((violation) => ["serious", "critical"].includes(violation.impact))
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.slice(0, 3).map((node) => node.target.join(" ")).join(" | ")}`);
}

async function settle(page) {
  // Let reveal animations and count-ups finish so colours are final.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
}

test.describe("accessibility (axe)", () => {
  for (const [name, path] of [["landing page", "/"], ["how it works", "/about"], ["emergency page", "/emergency"]]) {
    test(`${name} has no serious violations`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await mockApi(page);
      await page.goto(path);
      await settle(page);

      expect(await audit(page)).toEqual([]);
    });
  }

  test("planner (empty) has no serious violations", async ({ page }) => {
    await mockApi(page);
    await page.goto("/map");
    await page.waitForTimeout(600);

    expect(await audit(page)).toEqual([]);
  });

  test("planner with results has no serious violations", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);
    await expect(page.getByText("3 routes compared")).toBeVisible();
    await page.waitForTimeout(1200);

    expect(await audit(page)).toEqual([]);
  });

  test("planner with missing data and an error has no serious violations", async ({ page }) => {
    const response = makeResponse({ state: "unavailable" });
    response.data_sources.weather = false;
    response.routes.forEach((route) => { route.safety_score = null; route.risk_level = "Insufficient data"; route.data_confidence = "low"; route.weather = null; });

    await mockApi(page, { routes: () => ({ body: response }) });
    await planTrip(page);
    await expect(page.getByText("3 routes compared")).toBeVisible();
    await page.waitForTimeout(800);

    expect(await audit(page)).toEqual([]);
  });

  test("planner on a phone has no serious violations", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    const page = await context.newPage();

    await mockApi(page);
    await planTrip(page);
    await expect(page.locator(".sheet")).toBeVisible();
    await page.getByRole("button", { name: "Expand results" }).click();
    await page.waitForTimeout(1000);

    expect(await audit(page)).toEqual([]);

    await context.close();
  });
});

test.describe("keyboard and focus", () => {
  test("the skip link jumps to the main content", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });

    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("every interactive control shows a visible focus indicator", async ({ page }) => {
    await mockApi(page);
    await page.goto("/map");

    for (const control of [
      page.getByLabel("Start", { exact: true }),
      page.getByRole("button", { name: "Use my current location" }),
      page.getByRole("button", { name: "Walk", exact: true }),
    ]) {
      await control.focus();

      const outline = await control.evaluate((element) => {
        const style = getComputedStyle(element.matches("input") ? element.closest(".ps__field") : element);
        return { outline: style.outlineStyle, shadow: style.boxShadow };
      });

      expect(outline.outline !== "none" || outline.shadow !== "none").toBe(true);
    }
  });

  test("the planner can be operated entirely from the keyboard", async ({ page }) => {
    await mockApi(page);
    await page.goto("/map");

    const start = page.getByLabel("Start", { exact: true });
    await start.fill("Chalakudy");
    await expect(page.getByRole("option", { name: /Chalakudy/ })).toBeVisible();
    await start.press("ArrowDown");
    await start.press("Enter");

    const destination = page.getByLabel("Destination", { exact: true });
    await destination.fill("Kodakara");
    await expect(page.getByRole("option", { name: /Kodakara/ })).toBeVisible();
    await destination.press("ArrowDown");
    await destination.press("Enter");

    await expect(page.getByText("3 routes compared")).toBeVisible();

    // Choose a preference and a route without a mouse.
    await page.getByRole("button", { name: "Balanced", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /Route C/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("selection is never conveyed by colour alone", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);

    // Every route card states its risk in words and with an icon.
    for (const name of ["Route A", "Route B", "Route C"]) {
      await expect(page.getByRole("button", { name: new RegExp(name) })).toContainText(/(Lower|Moderate|Higher) risk/);
    }

    // Selected and recommended are text labels, not just outlines.
    await expect(page.getByRole("button", { name: /Route B/ })).toContainText("Selected");
    await expect(page.getByRole("button", { name: /Route B/ })).toContainText("Recommended");
  });
});
