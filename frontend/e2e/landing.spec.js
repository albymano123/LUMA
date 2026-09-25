import { expect, test } from "@playwright/test";

import { collectProblems, mockApi } from "./helpers.js";

async function scrollThrough(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);

  for (let y = 0; y < height; y += 500) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(90);
  }
}

test.describe("landing page", () => {
  test("the hero says what LumaPath is and offers the two actions", async ({ page }) => {
    const problems = collectProblems(page);
    await mockApi(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Navigate smarter.");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Travel safer.");
    await expect(page.getByRole("link", { name: "Plan a route" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "How it works" }).first()).toBeVisible();

    // The example card is labelled as an illustration, never as real data.
    await expect(page.getByLabel("Illustration of a route comparison")).toContainText("Illustration");

    expect(problems).toEqual([]);
  });

  test("Plan a route opens the planner", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await page.getByRole("link", { name: "Plan a route" }).first().click();

    await expect(page).toHaveURL(/\/map$/);
    await expect(page.getByLabel("Destination", { exact: true })).toBeVisible();
  });

  test("How it works scrolls to the workflow", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    // The hero button (the navigation bar has a "How it works" page link too).
    await page.locator(".hero__actions").getByRole("link", { name: "How it works" }).click();

    await expect(page).toHaveURL(/#how-it-works$/);
    await expect(page.getByRole("heading", { name: /From a destination to a decision/ })).toBeInViewport();
  });

  test("shows the real size of the map database once scrolled into view", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await scrollThrough(page);
    await page.evaluate(() => window.scrollTo(0, 0));

    const stats = page.getByRole("list", { name: "Map data available" });

    // Figures come from /health (Indian digit grouping), counted up on view.
    await expect(stats).toContainText("4,95,875");
    await expect(stats).toContainText("7,440");
    await expect(stats).toContainText("852");
    await expect(stats).toContainText("181");
    await expect(page.getByText(/extract dated 2026-09-23/)).toBeVisible();
  });

  test("all the required sections are present", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    for (const heading of [
      /Navigation that considers more than just speed/,
      /From a destination to a decision/,
      /Six factors, each measured from real data/,
      /Choose what matters for this trip/,
      /Know what is around you/,
      /Made for the trips that deserve a second look/,
      /Plan your next journey/,
    ]) {
      await expect(page.getByRole("heading", { name: heading })).toBeAttached();
    }

    // The six steps of the workflow.
    await expect(page.locator(".steps > li")).toHaveCount(6);
  });

  test("the factor explorer changes content and works with arrow keys", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    const tabs = page.getByRole("tablist", { name: "Safety factors" });
    const panel = page.getByRole("tabpanel");

    await tabs.scrollIntoViewIfNeeded();
    await expect(panel).toContainText("Emergency access");

    await tabs.getByRole("tab", { name: /Street lighting/ }).click();
    await expect(panel).toContainText("Unmapped never means unlit");
    await expect(panel).toContainText("Data unavailable");

    // Arrow keys move through the tabs.
    await tabs.getByRole("tab", { name: /Street lighting/ }).press("ArrowDown");
    await expect(tabs.getByRole("tab", { name: /Road and traffic exposure/ })).toHaveAttribute("aria-selected", "true");
    await expect(panel).toContainText("walking and cycling only");
  });

  test("the comparison demo switches routes and is labelled as an illustration", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    const demo = page.locator(".compare__card");
    await demo.scrollIntoViewIfNeeded();

    await expect(demo).toContainText("Illustration, not real data");
    await expect(demo.getByRole("img", { name: "Safety score 86 out of 100" })).toBeVisible();

    await demo.getByRole("button", { name: "Time-efficient" }).click();
    await expect(demo.getByRole("img", { name: "Safety score 61 out of 100" })).toBeVisible();
    await expect(demo).toContainText("Some safety data was unavailable");

    await demo.getByRole("button", { name: "Balanced" }).click();
    await expect(demo.getByRole("img", { name: "Safety score 78 out of 100" })).toBeVisible();
  });

  test("the weather demo cycles through conditions", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    const stage = page.locator(".weather-stage");
    await stage.scrollIntoViewIfNeeded();

    await expect(stage).toContainText("Rain showers");
    await page.getByRole("group", { name: "Weather example" }).getByRole("button", { name: "Clear" }).click();
    await expect(stage).toContainText("Clear sky");
    await page.getByRole("group", { name: "Weather example" }).getByRole("button", { name: "Cloudy" }).click();
    await expect(stage).toContainText("Overcast");
  });

  test("without the API the page still works and shows no invented numbers", async ({ page }) => {
    await mockApi(page);
    await page.route("**/health", (route) => route.abort());
    await page.goto("/");

    await scrollThrough(page);

    await expect(page.getByRole("list", { name: "Map data available" })).toHaveCount(0);
    await expect(page.getByText(/Built on OpenStreetMap, Open-Meteo and OSRM/)).toBeVisible();
  });
});

test.describe("navigation bar", () => {
  test("shows the four destinations and marks the current page", async ({ page }) => {
    await mockApi(page);
    await page.goto("/about");

    const nav = page.getByRole("navigation", { name: "Main" }).first();

    for (const name of ["Home", "Plan a route", "How it works", "Emergency"]) {
      await expect(nav.getByRole("link", { name })).toBeVisible();
    }

    await expect(nav.getByRole("link", { name: "How it works" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", "page");
  });

  test("the emergency number is one tap away on every page", async ({ page }) => {
    await mockApi(page);

    for (const path of ["/", "/map", "/about", "/emergency"]) {
      await page.goto(path);
      await expect(page.getByRole("banner").getByRole("link", { name: "Call emergency number 112" }), path).toHaveAttribute("href", "tel:112");
    }
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

    test("the menu opens, navigates and closes with Escape", async ({ page }) => {
      await mockApi(page);
      await page.goto("/");

      const toggle = page.getByRole("button", { name: "Open menu" });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");

      await toggle.tap();
      await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator("#lp-mobile-menu")).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(page.locator("#lp-mobile-menu")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();

      await page.getByRole("button", { name: "Open menu" }).tap();
      await page.locator("#lp-mobile-menu").getByRole("link", { name: "Plan a route" }).tap();
      await expect(page).toHaveURL(/\/map$/);
      await expect(page.locator("#lp-mobile-menu")).toHaveCount(0);
    });
  });
});

test.describe("3D hero and its fallbacks", () => {
  test("a capable browser upgrades to the 3D scene", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await expect(page.locator(".hero-visual")).toHaveAttribute("data-mode", "3d", { timeout: 25_000 });
    await expect(page.locator(".hero-scene canvas")).toHaveCount(1);
  });

  test("reduced motion keeps the still 2D visual and never loads three.js", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockApi(page);

    const requested = [];
    page.on("request", (request) => requested.push(request.url()));

    await page.goto("/");
    await page.waitForTimeout(2500);

    await expect(page.locator(".hero-fallback")).toBeVisible();
    await expect(page.locator(".hero-scene")).toHaveCount(0);
    expect(requested.filter((url) => /HeroScene/.test(url))).toEqual([]);
  });

  test("without WebGL the 2D visual is used and there are no errors", async ({ page }) => {
    const problems = collectProblems(page);

    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
        if (/webgl/i.test(type)) return null;
        return original.call(this, type, ...rest);
      };
    });
    await mockApi(page);

    await page.goto("/");
    await page.waitForTimeout(2500);

    await expect(page.locator(".hero-fallback")).toBeVisible();
    await expect(page.locator(".hero-scene")).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test("data-saver connections skip the 3D download", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", { value: { saveData: true, effectiveType: "4g" }, configurable: true });
    });
    await mockApi(page);

    const requested = [];
    page.on("request", (request) => requested.push(request.url()));

    await page.goto("/");
    await page.waitForTimeout(2000);

    expect(requested.filter((url) => /HeroScene/.test(url))).toEqual([]);
    await expect(page.locator(".hero-scene")).toHaveCount(0);
  });
});

test.describe("emergency page", () => {
  test("offers SOS, the helplines and safety tips", async ({ page }) => {
    await mockApi(page);
    await page.goto("/emergency");

    await expect(page.getByRole("link", { name: "Call emergency number 112" }).last()).toBeVisible();

    const sos = page.locator("a.sos");
    await expect(sos).toHaveAttribute("href", "tel:112");
    await expect(sos).toContainText("Emergency SOS");

    for (const [name, number] of [["Police", "100"], ["Ambulance", "108"], ["Fire", "101"], ["Women Helpline", "1091"], ["Childline", "1098"], ["Elderline", "14567"]]) {
      await expect(page.locator(`a.helpline[href="tel:${number}"]`), name).toContainText(name);
    }

    await expect(page.getByText(/Share your route and expected arrival time/)).toBeVisible();
  });

  test("sharing a location builds a message with a map link", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 10.3042, longitude: 76.3371 });
    await mockApi(page);
    await page.goto("/emergency");

    await page.getByRole("button", { name: "Share my location" }).click();

    const message = page.getByTestId("share-message");
    await expect(message).toContainText("I need help. My location:");
    await expect(message).toContainText("openstreetmap.org/?mlat=10.304200&mlon=76.337100");
    await expect(page.getByRole("link", { name: "Send by SMS" })).toHaveAttribute("href", /^sms:/);
    await expect(page.getByText(/doesn't store or send your location/)).toBeVisible();
  });

  test("a denied location permission is explained", async ({ page, context }) => {
    await context.clearPermissions();
    await mockApi(page);
    await page.goto("/emergency");

    await page.getByRole("button", { name: "Share my location" }).click();

    await expect(page.getByRole("status").filter({ hasText: /Location permission was denied|unavailable/ })).toBeVisible();
    await expect(page.getByTestId("share-message")).toHaveCount(0);
  });
});

test.describe("how it works page", () => {
  test("documents the method: factors, weights, risk levels and recommendation states", async ({ page }) => {
    await mockApi(page);
    await page.goto("/about");

    await expect(page.getByRole("heading", { name: "The six factors" })).toBeVisible();
    await expect(page.locator(".fcard")).toHaveCount(6);

    const table = page.getByRole("table");
    await expect(table.getByRole("row")).toHaveCount(7);
    await expect(table).toContainText("Walking, night");

    await expect(page.getByText("Lower risk")).toBeVisible();
    await expect(page.locator(".state")).toHaveCount(5);
    await expect(page.getByText(/no trained machine-learning model/i)).toBeVisible();
    await expect(page.getByText(/not built from crime or incident records/i)).toBeVisible();
  });
});
