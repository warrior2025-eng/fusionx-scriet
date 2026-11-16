// Joining a project team needs the owner's Accept (migration 0049); then it shows in My projects and can be left.
// Local stack only.
import { test, expect } from "@playwright/test";
import { one, signIn } from "./db.mjs";

test("Ask to join → the owner accepts → \"You're in\" and in My projects → Leave; the owner can remove and stop joins", async ({ page, browser }) => {
  page.on("dialog", (d) => d.accept());
  // Dia asks to join Chitra's project (from the ideas test, 4-auto).
  await signIn(page, "smoke-d2", "/projects");
  const card = page.locator("[data-project-meta]", { hasText: "Started by Chitra" }).first();
  await card.locator("[data-join-project]").click();
  await expect(page.getByText("Request sent. You join when the owner accepts.")).toBeVisible();
  await expect(card.locator("[data-requested]")).toBeVisible();

  // Chitra (the owner) accepts on the project's work page.
  const pid = (await one("select p.id from projects p join profiles o on o.id = p.owner_id where o.full_name = 'Chitra Community' and p.idea_id is not null order by p.created_at limit 1")).id;
  const owner = await browser.newContext();
  const ownerPage = await owner.newPage();
  ownerPage.on("dialog", (d) => d.accept());
  await signIn(ownerPage, "smoke-comm", `/projects/${pid}/work`);
  await expect(ownerPage.locator("[data-join-request]")).toContainText("Dia Writer");
  await ownerPage.getByRole("button", { name: "Accept Dia Writer" }).click();
  await expect(ownerPage.getByText("Dia Writer is in the team now.")).toBeVisible();
  await expect(ownerPage.locator("[data-team-member]", { hasText: "Dia Writer" })).toBeVisible();

  // Dia sees it in My projects and leaves.
  await page.goto("/projects/mine#joined");
  const row = page.locator("[data-joined-team]").first();
  await expect(row).toContainText("Started by Chitra");
  await row.locator("[data-leave-project]").click();
  await expect(page.getByText("You left the team.")).toBeVisible();
  await expect(page.locator("[data-joined-team]")).toHaveCount(0);

  // The owner stops new joins: Ask to join disappears from the card.
  await ownerPage.reload();
  await ownerPage.locator("[data-toggle-joins]").click();
  await expect(ownerPage.getByText("New joins stopped.")).toBeVisible();
  await page.goto("/projects");
  await expect(page.locator("[data-project-meta]", { hasText: "Started by Chitra" }).first().locator("[data-join-project]")).toHaveCount(0);
  await ownerPage.locator("[data-toggle-joins]").click();
  await owner.close();
});
