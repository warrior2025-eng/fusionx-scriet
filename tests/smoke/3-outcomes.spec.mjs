// Smoke tests for PR 3 (outcomes): Now building and /impact (positive only), story page, share card, skill
// badges, verify page, the Impact Report, the Idea Engine (with the local AI stand-in) and analytics scope.
import { test, expect } from "@playwright/test";
import { as, one, q, signIn, state } from "./db.mjs";

test.describe.configure({ mode: "serial" });
const P = () => state().people;
const BASE = process.env.FX_BASE ?? "http://127.0.0.1:3100";
const INTERNAL = /\b(late|overdue|delayed|stuck|behind|failed|red|amber|escalat\w*)\b/i;
const cron = () => fetch(`${BASE}/api/cron/autopilot`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? "local-cron-secret"}` } }).then((r) => r.json());

test("a finished public mission: Now building, story page, share card, badges", async ({ page }) => {
  // The Smoke Hackathon from the people tests: its deck is approved, then it is done.
  const m = await one("select id, slug from missions where title = 'Smoke Hackathon'");
  const deck = await one("select id, assignee_id from mission_tasks where mission_id = $1 and playbook_task_key = 'deck'", [m.id]);
  await as(deck.assignee_id, "select task_submit($1, null, 'https://figma.com/deck')", [deck.id]);
  for (const r of await q("select id, reviewer_id from task_reviews where task_id = $1 and status = 'pending'", [deck.id])) await as(r.reviewer_id ?? P().boss, "select task_review_decide($1, true, null)", [r.id]);
  await q("update autopilot_settings set levels = levels || '{\"public_updates\":\"auto\"}'");
  await cron();
  await page.goto("/");
  const home = await page.locator("[data-now-building]").innerText();
  expect(home).toContain("Smoke Hackathon");
  expect(home).not.toMatch(INTERNAL);
  await page.goto("/impact");
  expect(await page.locator("main").innerText()).not.toMatch(INTERNAL);

  await as(P().lead, "select ap_mission_set($1, 'done', null, '{https://devfolio.co/smoke}')", [m.id]);
  await as(P().lead, "select ap_story_summary($1, 'Our first open-seat team submitted a working demo.')", [m.id]);
  await page.goto(`/impact/${m.slug}`);
  await expect(page.locator("[data-story-summary]")).toContainText("first open-seat team");
  expect(await page.locator("main").innerText()).not.toMatch(INTERNAL);

  await signIn(page, "smoke-comm", "/my-work#share");
  await page.locator("[data-make-card]").first().click();
  await expect(page.getByText("Your share card is ready.")).toBeVisible();
  const code = (await one("select code from share_cards where user_id = $1", [P().comm])).code;
  await page.goto(`/impact/card/${code}`);
  await expect(page.locator("[data-card-title]")).toContainText("I worked on Smoke Hackathon at FusionX");
  const img = await page.request.get(`/impact/card/${code}/image`);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toContain("image/png");
  await page.goto("/my-work");
  await expect(page.locator("[data-badges]")).toBeVisible();
});

test("certificate: issued in Today, valid on the verify page, then revoked", async ({ page }) => {
  await as(P().boss, "select ap_certificate_drafts(current_date - 60, current_date + 60, 'Smoke semester')");
  const code = (await one("select code from certificate_verifications where user_id = $1", [P().comm])).code;
  await signIn(page, "smoke-boss", "/command");
  await page.locator('[data-queue-item="certificate"]', { hasText: "Chitra Community" }).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Issued.")).toBeVisible();
  await page.goto(`/verify/${code}`);
  await expect(page.locator('[data-verify="valid"]')).toContainText("Chitra Community");
  await as(P().boss, "select ap_certificate_set($1, 'revoke', 'Test')", [code]);
  await page.goto(`/verify/${code}`);
  await expect(page.locator('[data-verify="revoked"]')).toBeVisible();
});

test("Outcomes tab and the Semester Impact Report PDF", async ({ page }) => {
  await signIn(page, "smoke-boss", "/command/outcomes");
  await expect(page.locator("[data-visitors]")).toBeVisible();
  const res = await page.request.get("/command/outcomes/report");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
});

test("Idea Engine: complete drafts, no invented DOIs, only valid radar items, sorted by value", async ({ page }) => {
  // Only the local fest page as a source; grounding switched on to check the logged fallback.
  await q("update opportunity_sources set active = false");
  await q("insert into opportunity_sources (name, url, region) values ('Smoke fest', 'http://127.0.0.1:4010/fest', 'near') on conflict (url) do update set active = true");
  await q("update autopilot_settings set numbers = numbers || '{\"radar_grounding\":1}', levels = levels || '{\"idea_projects\":\"suggest\",\"idea_research\":\"suggest\",\"idea_radar\":\"suggest\"}'");
  const r = await cron();
  expect(r.ideas.projects).toBe(3);
  expect(r.ideas.research).toBe(3);
  const projects = await q("select data from idea_drafts where kind = 'project'");
  expect(projects.every((p) => ["problem", "mvp", "validate", "startup_path", "variations", "team"].every((k) => p.data[k]))).toBe(true);
  const research = JSON.stringify(await q("select title, pitch, data from idea_drafts where kind = 'research'"));
  expect(research).not.toMatch(/10\.\d{4,9}\//);
  expect(research).not.toMatch(/et al\./);
  const drafts = await q("select title, official_link, deadline from opportunity_drafts order by value_score desc");
  expect(drafts.map((d) => d.title)).toEqual(["Smoke Near Hack", "Smoke Online Ideathon"]); // no link, past and duplicate dropped; nearest first
  expect((await one("select count(*)::int n from automation_log where action = 'Grounding skipped'")).n).toBe(1);

  await signIn(page, "smoke-boss", "/command/ideas");
  await expect(page.locator('[data-idea="project"]')).toHaveCount(3);
  await page.locator("[data-opportunity-draft]", { hasText: "Smoke Near Hack" }).locator("[data-publish-opp]").click();
  await expect(page.getByText('Published with "Source checked".')).toBeVisible();
  await page.goto("/opportunities?show=near");
  await expect(page.locator("main")).toContainText("Smoke Near Hack");
  await page.goto("/opportunities?show=closing");
  await expect(page.locator("main")).not.toContainText("Smoke Online Ideathon");
});

test("analytics: public pages counted, Command Center and My work not", async ({ page }) => {
  await q("delete from site_visits");
  await page.goto("/impact");
  await page.waitForTimeout(1500);
  await signIn(page, "smoke-boss", "/command");
  await page.waitForTimeout(1500);
  const groups = (await q("select path_group from site_visits")).map((x) => x.path_group);
  expect(groups).toContain("impact");
  expect(groups).not.toContain("command");
  expect(groups).not.toContain("my-work");
});
