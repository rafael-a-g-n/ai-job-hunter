import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("shows the hero, both calls to action and no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // "Try the demo" is a button (it starts a demo session via POST), "Sign up" is a link.
    await expect(page.getByRole("button", { name: /try the demo/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
    await expect(page.getByRole("link", { name: /github/i })).toHaveAttribute(
      "href",
      "https://github.com/rafael-a-g-n/ai-job-hunter",
    );
    await expect(page.getByText("Coming soon")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("has no horizontal scroll at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
