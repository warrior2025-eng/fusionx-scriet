// Join a member's project team, see it in My projects, and leave it (migration 0048). Local stack only.
import { test, expect } from "@playwright/test";
import { signIn } from "./db.mjs";

test("join a project team → \"You're in\" on the card and in My projects → Leave", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await signIn(page, "smoke-d2", "/projects");
  // Chitra's project from the ideas test (4-auto).
  const card = page.locator("[data-project-meta]", { hasText: "Started by Chitra" }).first();
  await card.locator("[data-join-project]").click();
  await expect(page.getByText("You joined the team. It is in My projects.")).toBeVisible();
  await expect(card.locator("[data-joined]")).toBeVisible();

  await page.goto("/projects/mine#joined");
  const row = page.locator("[data-joined-team]").first();
  await expect(row).toContainText("Started by Chitra");
  await row.locator("[data-leave-project]").click();
  await expect(page.getByText("You left the team.")).toBeVisible();
  await expect(page.locator("[data-joined-team]")).toHaveCount(0);

  await page.goto("/projects");
  await expect(page.locator("[data-project-meta]", { hasText: "Started by Chitra" }).first().locator("[data-join-project]")).toBeVisible();
});
