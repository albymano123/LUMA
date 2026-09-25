import { expect, test } from "@playwright/test";

// Captures real screenshots (real backend, real data) for the docs and the
// presentation. Run with the backend up:  SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.js
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 with the backend running");
test.setTimeout(120_000);

const OUT = "../docs/screenshots";

async function plan(page, from, to, mode) {
  await page.goto("/map");
  if (mode) await page.getByRole("button", { name: mode }).click();

  for (const [label, text] of [["Start", from], ["Destination", to]]) {
    await page.getByLabel(label, { exact: true }).fill(text);
    await expect(page.getByRole("option").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("option").first().click();
  }

  await expect(page.getByText(/\d+ routes? compared/)).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(1200); // let map tiles settle
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("landing page", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/landing-desktop.png` });
  });

  test("route comparison", async ({ page }) => {
    await plan(page, "Chalakudy", "Kodakara", "Walk");
    await page.screenshot({ path: `${OUT}/routes-desktop.png` });

    await page.getByRole("group", { name: "Route preference" }).getByRole("button", { name: "Time-efficient" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/time-efficient-desktop.png` });
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("route comparison", async ({ page }) => {
    await plan(page, "Chalakudy", "Kodakara", "Walk");
    await page.screenshot({ path: `${OUT}/routes-phone.png` });
    await page.screenshot({ path: `${OUT}/routes-phone-full.png`, fullPage: true });
  });

  test("landing page", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/landing-phone.png` });
  });
});
