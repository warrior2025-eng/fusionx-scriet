// Smoke tests for PR 2 (people): open seats, community tasks, pitches and project tracking, in the browser.
import { test, expect } from "@playwright/test";
import { as, one, q, signIn, state } from "./db.mjs";

test.describe.configure({ mode: "serial" });
const P = () => state().people;

test("open seat: the lead opens it, a community member applies, the lead accepts", async ({ page }) => {
  const pb = (await one("select id from playbooks where slug = 'hackathon-entry'")).id;
  const [{ id }] = await as(P().boss, "select ap_start_mission($1, 'open-seat', current_date + 25, 'Smoke Hackathon', null, $2, '{design-branding,projects-research-startups}', 'public') id", [pb, P().lead]);
  await q("update mission_tasks set status = 'open' where mission_id = $1 and playbook_task_key = 'deck'", [id]);
  await signIn(page, "smoke-lead", `/command/missions?m=${id}`);
  const row = page.locator("li", { hasText: "Make the pitch deck" }).first();
  await row.locator("[data-open-seat]").click();
  await row.getByLabel("Skill").fill("Slides");
  await row.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByText("Seat opened.")).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, "smoke-comm", "/autopilot/open-seats");
  const seat = page.locator("[data-seat]").first();
  await seat.locator("[data-apply-seat]").click();
  await seat.getByLabel("Why you").fill("I made the decks for two college fests and can finish this in two days.");
  await seat.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Applied. The mission owner will decide.", { exact: true })).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, "smoke-lead", `/command/missions?m=${id}`);
  await page.locator("[data-seat-open]").getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Accepted. They have the task now.")).toBeVisible();
  expect((await one("select assignee_id from mission_tasks where mission_id = $1 and playbook_task_key = 'deck'", [id])).assignee_id).toBe(P().comm);
});

test("community member: sees only their own task and can take one community task", async ({ page }) => {
  await signIn(page, "smoke-comm");
  await expect(page.locator("[data-task]")).toHaveCount(1);
  const take = page.locator("[data-community-task]").first();
  if (await take.count()) {
    await take.locator("[data-take-task]").click();
    await expect(page.getByText("It is yours. Submit the proof when done.")).toBeVisible();
  }
});

test("pitch: submit, and another member votes", async ({ page }) => {
  await signIn(page, "smoke-comm", "/my-work#pitches");
  await page.locator("[data-pitch-form]").click();
  const form = page.locator("[data-pitch-open]");
  await form.getByLabel("Title").fill("Campus notes swap");
  await form.getByLabel("Pitch").fill("Juniors buy notes every semester; a swap board run by FusionX would save them money and time.");
  await form.getByLabel("Small version").fill("A shared sheet and a poster");
  await form.getByLabel("Full version").fill("A web board with search");
  await form.getByRole("button", { name: "Pitch it" }).click();
  await expect(page.getByText("Pitched. Voting is open.")).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, "smoke-d1", "/my-work#pitches");
  await page.locator("[data-pitch]", { hasText: "Campus notes swap" }).getByRole("button", { name: "Vote" }).last().click();
  await expect(page.getByText("Vote saved.")).toBeVisible();
  expect((await one("select count(*)::int n from pitch_votes v join pitches p on p.id = v.pitch_id where p.title = 'Campus notes swap'")).n).toBe(1);
});

test("project: created with a plan, a milestone done with proof sets the status", async ({ page }) => {
  await signIn(page, "smoke-d1", "/projects/new");
  await page.fill("#title", "Smoke Planner");
  await page.fill("#description", "A planner for club events, to test project tracking.");
  await page.selectOption("#plan", "lite");
  const target = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  await page.fill("#target_date", target);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/mine/);
  const card = page.locator("[data-project-card]", { hasText: "Smoke Planner" });
  await expect(card).toContainText("milestones");
  await card.getByRole("link", { name: "Milestones and tasks" }).click();
  const first = page.locator("[data-milestones] li").first();
  await first.getByLabel("Proof link").fill("https://github.com/fusionx/planner");
  await first.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  expect((await one("select status from projects where title = 'Smoke Planner'")).status).toBe("building");
});
