import { expect, test } from "@playwright/test";

test("the demo is pre-filled, flagged as a demo and limits a second analysis", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /try the demo/i }).click();

  // Everything is pre-filled: the CV score, scored matches and a letter appear within 5 s.
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(/CV score/)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByLabel(/^Match score \d+ out of 100$/).first()).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByText("Recent cover letters")).toBeVisible();
  await expect(page.locator("main a[href^='/letters/']").first()).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("status").filter({ hasText: "Demo account" })).toBeVisible();

  // A demo user gets one analysis per day: the first re-analysis works, the second is refused.
  await page.locator("main a[href^='/cv/']").first().click();
  await expect(page).toHaveURL(/\/cv\/[\w-]+$/);
  const reanalyse = page.getByRole("button", { name: "Re-analyse CV" });
  await reanalyse.click();
  await expect(page.getByRole("button", { name: "Analysing…" })).toHaveCount(0);
  await expect(reanalyse).toBeEnabled();
  await reanalyse.click();
  await expect(page.getByRole("alert").filter({ hasText: "analyses" })).toHaveText(
    "You've used today's 1 analyses. Limits reset at 00:00 UTC.",
  );
});
