import { expect, test } from "@playwright/test";

// Captures real screenshots (real backend, real data) for the docs and the
// presentation. Run with the backend up:  SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.js
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 with the backend running");
test.setTimeout(150_000);

const OUT = "../docs/screenshots";

// Scroll through the page so scroll-triggered reveals and counters run.
async function scrollThrough(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);

  for (let y = 0; y < height; y += 500) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(160);
  }

  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

async function plan(page, from, to, mode) {
  await page.goto("/map");
  if (mode) await page.getByRole("button", { name: mode, exact: true }).click();

  for (const [label, text] of [["Start", from], ["Destination", to]]) {
    await page.getByLabel(label, { exact: true }).fill(text);
    await expect(page.getByRole("option").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("option").first().click();
  }

  await expect(page.getByText(/\d+ routes? compared/).first()).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(2000); // let tiles and animations settle
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("landing page", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(3500); // let the 3D scene draw
    await page.screenshot({ path: `${OUT}/landing-desktop.png` });
    await scrollThrough(page);
    await page.screenshot({ path: `${OUT}/landing-desktop-full.png`, fullPage: true });
  });

  test("route comparison", async ({ page }) => {
    await plan(page, "Chalakudy", "Kodakara", "Walk");
    await page.screenshot({ path: `${OUT}/routes-desktop.png` });

    await page.locator(".panel__scroll").evaluate((element) => { element.scrollTop = element.scrollHeight * 0.32; });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/details-desktop.png` });
    await page.locator(".panel__scroll").evaluate((element) => { element.scrollTop = 0; });

    await page.getByRole("group", { name: "Route preference" }).getByRole("button", { name: "Time-efficient", exact: true }).click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/time-efficient-desktop.png` });

    const layers = page.getByRole("group", { name: "Map layers" });
    await layers.getByRole("button", { name: "Safety factors" }).click();
    await layers.getByRole("button", { name: "Weather" }).click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/layers-desktop.png` });
  });

  test("emergency page", async ({ page }) => {
    await page.goto("/emergency");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/emergency-desktop.png` });
  });

  test("how it works", async ({ page }) => {
    await page.goto("/about");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/about-desktop.png` });
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("route comparison", async ({ page }) => {
    await plan(page, "Chalakudy", "Kodakara", "Walk");
    await page.screenshot({ path: `${OUT}/routes-phone.png` });

    await page.getByRole("button", { name: "Expand results" }).click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/routes-phone-open.png` });
  });

  test("landing page", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/landing-phone.png` });
    await scrollThrough(page);
    await page.screenshot({ path: `${OUT}/landing-phone-full.png`, fullPage: true });
  });

  test("emergency page", async ({ page }) => {
    await page.goto("/emergency");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/emergency-phone.png` });
  });
});
