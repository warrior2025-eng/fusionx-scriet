// Squad Match (migration 0047): find a team from an opportunity card, by role, without codes. Local stack only.
import { test, expect } from "@playwright/test";
import { one, q, signIn } from "./db.mjs";

test.describe.configure({ mode: "serial" });

test("a lead starts a squad from the card; a member joins the pool; smart pick → invite → accept in My work", async ({ page, browser }) => {
  // A team hackathon, open for 5 more days.
  const opp = (await one("insert into opportunities (title, organizer, category, description, deadline, registration_url, status, is_published, created_by, team_mode, mode, section) values ('Smoke Squad Hack', 'IIT Delhi', 'hackathon', 'Smoke test', current_date + 5, 'http://127.0.0.1:4010/ok/squad', 'open', true, (select id from auth.users where email = 'smoke-boss@example.com'), 'team', 'online', 'hackathons') returning id")).id;

  // A visitor sees the button, and is asked to sign in.
  await page.goto("/opportunities/hackathons");
  const card = page.locator("[data-opp-card]", { hasText: "Smoke Squad Hack" });
  await expect(card.locator("[data-find-team]")).toBeVisible();
  await card.locator("[data-find-team]").click();
  await page.waitForURL(/\/login/);

  // Dev (designer) joins the pool.
  const dev = await browser.newContext();
  const devPage = await dev.newPage();
  await signIn(devPage, "smoke-d1", `/opportunities/squad/${opp}`);
  await devPage.locator("[data-join-pool]").click();
  await devPage.getByLabel("I can do", { exact: true }).selectOption("Design (UI/UX)");
  await devPage.locator("[data-pool-submit]").click();
  await expect(devPage.locator("[data-in-pool]")).toContainText("Design (UI/UX)");

  // Chitra starts a squad that needs a designer and sees Dev as a smart pick.
  await signIn(page, "smoke-comm", `/opportunities/squad/${opp}`);
  await page.locator("[data-start-squad]").click();
  await page.getByLabel("Squad name", { exact: true }).fill("Smoke Squad");
  await page.getByLabel("Your role", { exact: true }).selectOption("Frontend");
  await page.getByRole("button", { name: "Design (UI/UX)", exact: true }).click();
  await page.locator("[data-create-squad]").click();
  await expect(page.locator("[data-my-squad]")).toContainText("Smoke Squad");
  await expect(page.locator("[data-open-slot]")).toContainText("Design (UI/UX)");
  const pick = page.locator("[data-smart-picks] li", { hasText: "Dev Designer" });
  await expect(pick).toBeVisible();
  await pick.locator("[data-invite]").click();
  await expect(page.getByText("Invited. They will get a notification.")).toBeVisible();

  // Dev accepts from My work: no code anywhere.
  await devPage.goto("/my-work#squads");
  await expect(devPage.locator("[data-my-squads]")).toContainText("Smoke Squad");
  await devPage.locator("[data-my-squads] [data-accept-invite]").click();
  await expect(devPage.getByText("Welcome to the squad.")).toBeVisible();
  expect((await one("select count(*)::int n from opp_squad_members m join opp_squads s on s.id = m.squad_id where s.name = 'Smoke Squad' and m.state = 'member'")).n).toBe(2);

  // The lead marks it registered; the card counts it.
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await page.locator("[data-mark-registered]").click();
  await expect(page.getByText("Marked as registered. All the best!")).toBeVisible();
  await page.goto("/opportunities/hackathons");
  await expect(page.locator("[data-opp-card]", { hasText: "Smoke Squad Hack" }).locator("[data-squad-count]")).toHaveText("1 going");
  await dev.close();
  await q("update opportunities set is_published = false where id = $1", [opp]);
});
