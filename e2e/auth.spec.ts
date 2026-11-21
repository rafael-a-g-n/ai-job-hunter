import { expect, test } from "@playwright/test";
import { mailLink, PASSWORD, signOut, signUp, signUpVerified, uniqueEmail } from "./helpers";

test("sign up, verify by email, sign out, reset the password and sign in with it", async ({
  page,
  request,
}) => {
  const email = await signUpVerified(page, request, "auth");
  await signOut(page, email);

  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.waitForLoadState("networkidle"); // let the form hydrate before typing into it
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("a reset link is on its way")).toBeVisible();

  const newPassword = `${PASSWORD}-new`;
  // The latest mail to this address is now the reset link (the verification mail came first).
  await page.goto(await mailLink(request, email, "reset-password"));
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await page.getByLabel("New password").fill(newPassword);
  await page.getByLabel("Confirm password").fill(newPassword);
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Invalid" })).toHaveText(
    "Invalid email or password.",
  );

  await page.getByLabel("Password").fill(newPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("an unverified user cannot sign in", async ({ page }) => {
  const email = uniqueEmail("unverified");
  await signUp(page, email);

  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle"); // let the form hydrate before typing into it
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "verify" })).toHaveText(
    "Please verify your email before signing in.",
  );
  await expect(page).toHaveURL(/\/sign-in$/);
});
