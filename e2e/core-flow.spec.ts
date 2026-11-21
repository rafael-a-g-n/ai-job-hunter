import path from "node:path";
import { expect, test } from "@playwright/test";
import { signUpVerified } from "./helpers";

const SAMPLE_PDF = path.resolve(__dirname, "../tests/fixtures/cv/sample.pdf");

test("upload a CV, see matches, write and edit a letter, paste a job", async ({
  page,
  request,
}) => {
  await signUpVerified(page, request, "core");

  // CV upload -> analysis report with a score.
  await page.goto("/cv");
  await page.waitForLoadState("networkidle"); // the file input's handler attaches on hydration
  await page.getByTestId("cv-file").setInputFiles(SAMPLE_PDF);
  await page.getByRole("button", { name: "Upload and analyse" }).click();
  await expect(page).toHaveURL(/\/cv\/[\w-]+$/, { timeout: 30_000 });
  await expect(page.getByRole("img", { name: /Overall score \d+ out of 100/ })).toBeVisible();

  // Matches -> at least one scored match.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Matches" })
    .click();
  await expect(page).toHaveURL(/\/jobs\/matches$/);
  await expect(page.getByLabel(/^Match score \d+ out of 100$/).first()).toBeVisible({
    timeout: 30_000,
  });

  // Open the first job and write a letter (mock stream) -> lands on the editor.
  const firstMatch = page.locator("main ul a[href^='/jobs/']").first();
  const jobTitle = (await firstMatch.textContent())?.trim() ?? "";
  expect(jobTitle).not.toBe("");
  await firstMatch.click();
  await expect(page.getByRole("heading", { level: 1, name: jobTitle })).toBeVisible();
  await page.getByRole("button", { name: "Write cover letter" }).click();
  await page.getByRole("button", { name: "Generate" }).click();
  await expect(page).toHaveURL(/\/letters\/[\w-]+$/, { timeout: 30_000 });

  // Edit it; autosave must persist the edit.
  const editor = page.getByRole("textbox", { name: "Cover letter" });
  await expect(editor).toHaveValue(/Dear Hiring Manager/);
  const edited = "Dear Hiring Manager, this sentence was edited in the e2e test.";
  const letterUrl = page.url();
  // The debounced autosave is a server-action POST to the letter page; wait for it WITHOUT
  // navigating, so the unmount/pagehide save cannot be what persists the edit.
  const autosave = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url() === letterUrl && r.ok(),
  );
  await editor.fill(edited);
  await autosave;
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Cover letter" })).toHaveValue(edited);

  // It appears in the list, with the edit.
  await page.goto("/letters");
  await expect(page.getByText(jobTitle).first()).toBeVisible();
  await page.locator("main ul a[href^='/letters/']").first().click();
  await expect(page.getByRole("textbox", { name: "Cover letter" })).toHaveValue(edited);

  // Paste a job -> it shows in search under "Pasted by you".
  await page.goto("/jobs/new");
  await page
    .getByLabel("Job description")
    .fill(
      "Frontend Engineer at Lisbon Labs. We build a customer facing web app with React and TypeScript, hybrid or remote.",
    );
  await page.getByRole("button", { name: "Import job" }).click();
  await expect(page).toHaveURL(/\/jobs\/[\w-]+$/, { timeout: 30_000 });

  await page.goto("/jobs");
  await page.getByLabel("Source").selectOption("MANUAL");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/source=MANUAL/);
  await expect(page.getByText("1 job found")).toBeVisible();
  await expect(page.getByText("Lisbon Labs")).toBeVisible();
});
