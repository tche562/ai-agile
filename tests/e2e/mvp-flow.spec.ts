import { expect, test } from "@playwright/test";

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test("MVP loop: create project -> generate -> edit -> replan -> diff visible", async ({ page }) => {
  const suffix = uniqueSuffix();
  const projectName = `E2E MVP ${suffix}`;
  const editedTitle = `E2E edited ticket ${suffix}`;

  await page.goto("/projects");

  await expect(page.getByRole("heading", { name: "Your Projects" })).toBeVisible();

  await page.getByLabel(/project name/i).fill(projectName);
  await page.getByRole("button", { name: /create project/i }).click();

  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  const generateButton = page.getByRole("button", { name: /^generate plan$/i });
  await expect(generateButton).toBeVisible();
  await expect(generateButton).toBeEnabled();
  await generateButton.click();

  await expect(page.getByText("Generate Plan applied: 8 created")).toBeVisible();
  await expect(page.getByTestId("ticket-row").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E Seed: Scaffold project shell" })).toBeVisible();

  await page.getByRole("link", { name: "E2E Seed: Scaffold project shell" }).click();
  await expect(page.getByRole("heading", { name: "Update ticket" })).toBeVisible();

  await page.getByLabel(/^title$/i).fill(editedTitle);
  await page.getByRole("button", { name: /save ticket/i }).click();

  await expect(
    page.getByText("Ticket saved. A new version and timeline event were created."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: editedTitle })).toBeVisible();

  await page.getByRole("link", { name: "Back to dashboard" }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  const replanButton = page.getByRole("button", { name: /^replan$/i });
  await expect(replanButton).toBeVisible();
  await expect(replanButton).toBeEnabled();
  await replanButton.click();

  await expect(
    page.getByText("Replan applied: 0 created, 1 updated, 0 closed, 0 rejected."),
  ).toBeVisible();
  await expect(page.getByTestId("replan-diff")).toBeVisible();
  await expect(page.getByTestId("replan-rationale")).toContainText(
    "Replan incorporated recent manual edits",
  );
  await expect(page.getByTestId("replan-diff")).toContainText("Before");
  await expect(page.getByTestId("replan-diff")).toContainText("After");
});
