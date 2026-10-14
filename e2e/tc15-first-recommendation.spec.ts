import { expect, test, type Page } from "@playwright/test";

/**
 * TC15 / NFR2: a first-time patron gets a recommendation within three interactions of landing.
 * "Landing" is the onboarding screen a new account arrives on; an interaction is one click on it
 * (a subject chip, a star rating, or the button that goes to Your shelf).
 */

let counter = 0;

async function register(page: Page) {
  const email = `tc15-${Date.now()}-${counter++}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Name").fill("Test Patron");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
}

async function expectShelfWithReasons(page: Page, reason: RegExp) {
  await expect(page).toHaveURL(/\/recommendations$/);
  await expect(page.getByRole("heading", { name: "Your shelf" })).toBeVisible();
  const cards = page.locator("article");
  await expect(cards.first()).toBeVisible();
  const total = await cards.count();
  expect(total).toBeGreaterThan(0);
  // Every recommendation carries a reason slip, and the first one is the top pick.
  await expect(page.locator("article p.border-l-\\[3px\\]")).toHaveCount(total);
  await expect(page.locator("article p.border-l-\\[3px\\]").first()).toHaveText(reason);
  await expect(page.getByText("Top pick")).toBeVisible();
}

test("TC15: picking subjects gives a recommendation within 3 interactions", async ({ page }) => {
  await register(page);
  let interactions = 0;

  await page.locator("label", { hasText: /^Fantasy$/ }).click();
  interactions++;
  await page.locator("label", { hasText: /^Science fiction$/ }).click();
  interactions++;
  await page.getByRole("button", { name: "Show my shelf" }).click();
  interactions++;

  await expectShelfWithReasons(page, /^Matches your interest in /);
  expect(interactions).toBeLessThanOrEqual(3);
});

test("TC15: rating popular books gives a recommendation within 3 interactions", async ({ page }) => {
  await register(page);
  let interactions = 0;

  // A click that lands before React has hydrated the page is lost (the dev server is slow on a cold route), so each
  // rating is retried until the page confirms it. Re-rating the same star is an upsert, so a retry is harmless.
  const groups = page.getByRole("radiogroup");
  const rate = async (group: number, stars: number) => {
    await expect(async () => {
      await groups.nth(group).getByRole("radio", { name: `${stars} stars` }).click();
      await expect(page.getByRole("status")).toContainText(`Rated ${stars}★`, { timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
  };
  await rate(0, 4);
  interactions++;
  await rate(1, 5);
  interactions++;
  await page.getByRole("link", { name: "Go to Your shelf" }).click();
  interactions++;

  await expectShelfWithReasons(page, /^Because you rated /);
  expect(interactions).toBeLessThanOrEqual(3);
});

test("a patron with no history who opens Your shelf is sent to onboarding", async ({ page }) => {
  await register(page);
  await page.goto("/recommendations");
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Start your shelf" })).toBeVisible();
});

test("the book page shows More like this with a reason slip on each book", async ({ page }) => {
  await page.goto("/catalogue");
  await page.locator("article h3 a").first().click();
  await expect(page.getByRole("heading", { name: "More like this" })).toBeVisible();
  const slips = page.locator("section[aria-labelledby='more-like-this'] p.border-l-\\[3px\\]");
  await expect(slips.first()).toHaveText(/^Similar to /);
  expect(await slips.count()).toBe(await page.locator("section[aria-labelledby='more-like-this'] article").count());
});
