import { gzipSync } from "node:zlib";

import { expect, test } from "@playwright/test";

import { mockApi, planTrip } from "./helpers.js";

/*
  Performance budgets, measured on the production build. Sizes are gzip
  (what a real host sends). Web-vitals are measured in headless Chromium on
  localhost, so they show regressions rather than real-world speed.
*/

const KB = 1024;

// Records every script/style/font the page downloads.
function trackDownloads(page) {
  const files = [];

  page.on("response", async (response) => {
    const url = response.url();

    if (!/\/assets\/|\/maplibre\//.test(url)) return;

    try {
      const body = await response.body();
      files.push({ name: url.split("/").pop(), url, raw: body.length, gzip: gzipSync(body).length });
    } catch {
      // Response went away (navigation): not relevant to the budget.
    }
  });

  return files;
}

// Response bodies are read asynchronously; under load they can lag the page.
async function settle(page, files) {
  await page.waitForLoadState("networkidle");

  let last = -1;

  for (let attempt = 0; attempt < 20 && files.length !== last; attempt += 1) {
    last = files.length;
    await page.waitForTimeout(250);
  }
}

const total = (files, pattern) =>
  files.filter((file) => pattern.test(file.name)).reduce((sum, file) => sum + file.gzip, 0);

async function webVitals(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const result = { lcp: 0, cls: 0 };

        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) result.lcp = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });

        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) result.cls += entry.value;
        }).observe({ type: "layout-shift", buffered: true });

        setTimeout(() => resolve(result), 1500);
      })
  );
}

test.describe("what is downloaded, and when", () => {
  test("the landing page stays small and does not load the map or 3D code up front", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockApi(page);
    const files = trackDownloads(page);

    await page.goto("/");
    await settle(page, files);

    const scripts = total(files, /\.js$/);
    const styles = total(files, /\.css$/);

    console.log(`landing: ${(scripts / KB).toFixed(0)} KB JS, ${(styles / KB).toFixed(0)} KB CSS (gzip)`);

    expect(scripts).toBeLessThan(150 * KB);
    expect(styles).toBeLessThan(25 * KB);

    expect(files.some((file) => /HeroScene|leaflet|maplibre/i.test(file.name))).toBe(false);
  });

  test("the 3D scene is a separate download, only on capable devices", async ({ page }) => {
    await mockApi(page);
    const files = trackDownloads(page);

    await page.goto("/");
    await expect(page.locator(".hero-visual")).toHaveAttribute("data-mode", "3d", { timeout: 25_000 });

    const three = files.filter((file) => /HeroScene/.test(file.name));

    expect(three).toHaveLength(1);
    console.log(`3D hero chunk: ${(three[0].gzip / KB).toFixed(0)} KB gzip (lazy, after first paint)`);
    expect(three[0].gzip).toBeLessThan(170 * KB);
  });

  test("the planner does not download the 3D scene, and only the raster path avoids MapLibre", async ({ page }) => {
    await mockApi(page);
    const files = trackDownloads(page);

    await planTrip(page);
    await expect(page.getByText("3 routes compared")).toBeVisible();
    await settle(page, files);

    expect(files.some((file) => /HeroScene/.test(file.name))).toBe(false);
    // Forced lightweight map: the vector engine is never downloaded.
    expect(files.some((file) => /maplibre-gl/.test(file.name))).toBe(false);

    console.log(`planner (raster map): ${(total(files, /\.js$/) / KB).toFixed(0)} KB JS gzip`);
    expect(total(files, /\.js$/)).toBeLessThan(230 * KB);
  });

  test("fonts: only the Latin subsets are downloaded", async ({ page }) => {
    await mockApi(page);
    const files = trackDownloads(page);

    await page.goto("/");
    await settle(page, files);

    const fonts = files.filter((file) => /\.woff2$/.test(file.name));

    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every((font) => /latin/.test(font.name) && !/cyrillic|greek|vietnamese/.test(font.name))).toBe(true);
    console.log(`fonts: ${fonts.map((font) => `${font.name.split("-")[0]} ${(font.gzip / KB).toFixed(0)}KB`).join(", ")}`);
  });
});

test.describe("web vitals", () => {
  test("landing page paints quickly and does not jump around", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockApi(page);

    await page.goto("/");
    const vitals = await webVitals(page);

    console.log(`landing LCP ${vitals.lcp.toFixed(0)} ms, CLS ${vitals.cls.toFixed(3)}`);
    expect(vitals.lcp).toBeLessThan(2500);
    expect(vitals.cls).toBeLessThan(0.1);
  });

  test("the planner is interactive quickly", async ({ page }) => {
    await mockApi(page);

    const started = Date.now();
    await page.goto("/map");
    await page.getByLabel("Start", { exact: true }).waitFor();
    const ready = Date.now() - started;

    const vitals = await webVitals(page);

    console.log(`planner ready in ${ready} ms, LCP ${vitals.lcp.toFixed(0)} ms, CLS ${vitals.cls.toFixed(3)}`);
    expect(ready).toBeLessThan(3000);
    expect(vitals.cls).toBeLessThan(0.1);
  });

  test("results appear promptly after the answer arrives", async ({ page }) => {
    await mockApi(page);
    await page.goto("/map");

    const started = Date.now();
    await planTrip(page);
    await expect(page.getByText("3 routes compared")).toBeVisible();

    console.log(`search to results (mocked API): ${Date.now() - started} ms`);
    expect(Date.now() - started).toBeLessThan(6000);
  });
});

test.describe("rendering cost", () => {
  test("switching between routes does not stall the page", async ({ page }) => {
    await mockApi(page);
    await planTrip(page);
    await expect(page.getByText("3 routes compared")).toBeVisible();

    const longest = await page.evaluate(async () => {
      let worst = 0;
      let last = performance.now();
      let running = true;

      const tick = () => {
        const now = performance.now();
        worst = Math.max(worst, now - last);
        last = now;
        if (running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);

      const buttons = [...document.querySelectorAll(".rc")];

      for (let round = 0; round < 3; round += 1) {
        for (const button of buttons) {
          button.click();
          await new Promise((resolve) => setTimeout(resolve, 90));
        }
      }

      running = false;
      return worst;
    });

    console.log(`longest frame while switching routes: ${longest.toFixed(0)} ms`);
    // Headless software rendering is slow; this only catches real stalls.
    expect(longest).toBeLessThan(400);
  });
});
