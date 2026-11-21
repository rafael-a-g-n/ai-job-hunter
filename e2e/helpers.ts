import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PASSWORD = "correct-horse-battery";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
}

/**
 * Waits for the console mailer to "send" a message to `to` whose link path contains `kind`
 * (`verify-email` or `reset-password`) and returns that link.
 */
export async function mailLink(
  request: APIRequestContext,
  to: string,
  kind: "verify-email" | "reset-password",
): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`/api/test/mail?to=${encodeURIComponent(to)}`);
        const body = (await res.json()) as { messages: { text: string }[] };
        link = body.messages
          .map((m) => m.text.match(/https?:\/\/\S+/)?.[0])
          .findLast((l) => l?.includes(kind));
        return link;
      },
      { message: `${kind} mail to ${to}`, timeout: 15_000 },
    )
    .toBeTruthy();
  return link as string;
}

export async function signUp(page: Page, email: string, name = "E2E User"): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your email to verify your account")).toBeVisible();
}

/** Signs up, follows the emailed verification link (which signs the user in) and lands on the dashboard. */
export async function signUpVerified(
  page: Page,
  request: APIRequestContext,
  prefix: string,
): Promise<string> {
  const email = uniqueEmail(prefix);
  await signUp(page, email);
  await page.goto(await mailLink(request, email, "verify-email"));
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  return email;
}

export async function signOut(page: Page, email: string): Promise<void> {
  await page.getByRole("button", { name: email }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
}
