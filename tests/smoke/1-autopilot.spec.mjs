// The site's smoke tests (PR 1: Autopilot core). One story, in order: a mission is prepared and approved,
// a task is offered, accepted, proven, peer-reviewed and counted; Command Center and Control work;
// a meeting room and the home page load; the app installs and phone notifications arrive.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { test, expect, chromium } from "@playwright/test";
import { as, one, q, signIn, state, tick } from "./db.mjs";

test.describe.configure({ mode: "serial" });
const P = () => state().people;
const now = () => new Date().toISOString();

test("sign in and save the profile", async ({ page }) => {
  await signIn(page, "smoke-d2", "/profile");
  await page.fill("#department", "CSE");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText(/Profile saved at/)).toBeVisible();
  expect((await one("select department from profiles where id = $1", [P().d2])).department).toBe("CSE");
});

test("Today: a prepared mission is approved with one click, then the offer with Approve all safe items", async ({ page }) => {
  await tick(now());
  expect((await one("select count(*)::int n from autopilot_queue where kind = 'create_mission' and status = 'pending'")).n).toBeGreaterThan(0);
  await signIn(page, "smoke-hoe", "/command");
  const item = page.locator('[data-queue-item="create_mission"]', { hasText: "Weekly social post" }).first();
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Mission created.")).toBeVisible();
  const mission = await one("select id from missions where title like 'Weekly social post%' order by mission_date limit 1");
  expect(mission).toBeTruthy();
  await tick(now());
  await page.reload();
  await page.locator("[data-approve-safe]").click();
  await expect(page.getByText(/item.* done\./)).toBeVisible();
  const offer = await one("select o.user_id from task_offers o join mission_tasks t on t.id = o.task_id where t.mission_id = $1 and o.status = 'offered' and t.playbook_task_key = 'topic'", [mission.id]);
  expect(offer.user_id).toBe(P().d2); // writing skill → the caption task
  fs.writeFileSync(path.join(process.env.TEMP ?? "/tmp", "fx-smoke-mission.txt"), mission.id);
});

test("My work: accept the task and submit its proof", async ({ page }) => {
  await signIn(page, "smoke-d2");
  await page.locator("[data-offer]").first().getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Accepted. It is in your tasks now.")).toBeVisible();
  const task = page.locator("[data-task]").first();
  await task.getByRole("button", { name: "Submit proof" }).click();
  await task.getByLabel("What you did").fill("Caption: Build Night is back, Friday 6 pm. Bring your laptop.");
  await task.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Submitted. A reviewer has been asked.")).toBeVisible();
});

test("peer review approves it and it becomes a contribution", async ({ page }) => {
  const review = await one("select r.reviewer_id from task_reviews r join mission_tasks t on t.id = r.task_id where t.assignee_id = $1 and r.status = 'pending'", [P().d2]);
  expect(review.reviewer_id).not.toBe(P().d2);
  const key = Object.entries(P()).find(([, id]) => id === review.reviewer_id)[0];
  await signIn(page, { d1: "smoke-d1", lead: "smoke-lead", hoe: "smoke-hoe", boss: "smoke-boss" }[key]);
  await page.locator("[data-review]").first().getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Approved\. It counts as/)).toBeVisible();
  expect((await one("select count(*)::int n from contributions where user_id = $1", [P().d2])).n).toBe(1);
});

test("Command Center: every tab loads, the mission shows its plan, Change plan previews", async ({ page }) => {
  await signIn(page, "smoke-boss", "/command");
  for (const [tab, marker] of [["Today", "[data-health-strip]"], ["Missions", "[data-board]"], ["People", "[data-people]"], ["Calendar", "[data-calendar]"], ["Playbooks", "[data-playbooks]"], ["Outcomes", "[data-outcomes]"], ["Control", "[data-control]"]]) {
    await page.getByRole("navigation", { name: "Command Center" }).getByRole("link", { name: tab }).click();
    await expect(page.locator(marker).first()).toBeVisible();
  }
  const id = fs.readFileSync(path.join(process.env.TEMP ?? "/tmp", "fx-smoke-mission.txt"), "utf8");
  await page.goto(`/command/missions?m=${id}`);
  await expect(page.locator(`[data-mission-detail="${id}"]`)).toBeVisible();
  await page.locator("[data-change-plan]").click();
  await page.locator("[data-plan-variation]").selectOption("reel");
  await page.locator("[data-plan-preview-button]").click();
  await expect(page.locator("[data-plan-preview]")).toContainText("Tasks added");
  await page.locator("[data-plan-reason]").fill("Reels do better");
  await page.locator("[data-plan-apply]").click();
  await expect(page.getByText("Plan changed. Everyone affected was told.")).toBeVisible();
  expect((await one("select variation_key v from missions where id = $1", [id])).v).toBe("reel");
  expect((await one("select status from mission_tasks where mission_id = $1 and playbook_task_key = 'topic'", [id])).status).toBe("approved");
});

test("Control: the master switch pauses the jobs", async ({ page }) => {
  await signIn(page, "smoke-boss", "/command/control");
  await page.getByRole("button", { name: "Pause Autopilot" }).click();
  await expect(page.getByText(/Autopilot is paused/)).toBeVisible();
  const before = (await one("select count(*)::int n from automation_log")).n;
  const r = await tick(new Date(Date.now() + 3 * 864e5).toISOString()); // three days later (mocked)
  expect(r.paused).toBe(true);
  expect((await one("select count(*)::int n from automation_log")).n).toBe(before);
  await page.reload();
  await page.getByRole("button", { name: "Resume Autopilot" }).click();
  await expect(page.getByText("Autopilot is on.")).toBeVisible();
  await page.locator('[data-level="reminders:auto"]').click();
  await expect(page.locator('[data-level="reminders:auto"]')).toHaveAttribute("aria-checked", "true");
});

test("a meeting room loads", async ({ page }) => {
  const design = (await one("select id from core_groups where slug = 'design-branding'")).id;
  const [{ m }] = await as(P().boss, "select (meeting_save(null, $1::jsonb) ->> 'id') m", [JSON.stringify({
    title: "Smoke design sync", description: "", starts_at: new Date(Date.now() + 60_000).toISOString(), duration_min: 30,
    audience: [{ kind: "core_group", id: design }], cohosts: [], agenda: [], lobby_on: false, join_muted: true, join_camera_off: false,
    screen_share_all: true, chat_on: true, repeat_weeks: 1,
  })]);
  await signIn(page, "smoke-d1", `/meetings/${m}`);
  await expect(page.getByText("Smoke design sync").first()).toBeVisible();
});

test("the public home page has no internal words", async ({ page }) => {
  await page.goto("/");
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/\b(overdue|delayed|stuck|escalat\w*|automation log)\b/i);
});

test("the app installs: manifest and service worker", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.some((i) => i.sizes === "512x512")).toBe(true);
  expect(manifest.shortcuts?.[0]?.url).toBe("/my-work");
  await page.goto("/");
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe("/");
});

test("phone notifications: keys made by the server, never in the browser code; a push reaches this browser", async () => {
  // Chrome has no Push API in incognito, which is what test contexts are: this one uses a real (temporary) profile.
  // A new profile's first registration with Google's push service can take ~30 s.
  test.setTimeout(240_000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fx-push-"));
  const base = process.env.FX_BASE ?? "http://127.0.0.1:3100";
  const context = await chromium.launchPersistentContext(dir, { channel: "chrome", headless: true, baseURL: base });
  try {
    await context.grantPermissions(["notifications"], { origin: base });
    const page = await context.newPage();
    await signIn(page, "smoke-d2", "/my-work#settings");
    await page.locator('[data-push="off"]').click();
    await expect(page.getByText("Phone notifications are on for this device.")).toBeVisible({ timeout: 120_000 });
    expect((await one("select count(*)::int n from push_subscriptions where user_id = $1", [P().d2])).n).toBe(1);
    const keys = await q("select name, value from server_secrets order by name");
    expect(keys.map((k) => k.name)).toEqual(["vapid_private", "vapid_public"]);
    // The private key is in no file sent to browsers.
    const priv = keys.find((k) => k.name === "vapid_private").value;
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const project = path.resolve(import.meta.dirname, "../..");
    expect(walk(path.join(project, ".next/static")).filter((f) => fs.readFileSync(f, "utf8").includes(priv))).toEqual([]);
    // A notification for this member is pushed by the cron route and shown by the service worker.
    await q("insert into notifications (user_id, title, body, link) values ($1, 'Smoke push', 'Hello from the smoke test', '/my-work')", [P().d2]);
    const res = await fetch(`${base}/api/cron/autopilot`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? "local-cron-secret"}` } });
    expect((await res.json()).push).toBeGreaterThanOrEqual(1);
    await expect.poll(async () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => n.title)), { timeout: 60_000 }).toContain("Smoke push");
    await page.screenshot({ path: path.join(os.tmpdir(), "fx-smoke-push.png") });
  } finally {
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Today: the WhatsApp update is real text to copy", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, "smoke-hoe", "/command");
  await page.locator('[data-copy-whatsapp="Design & Branding"]').click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain("*FusionX · Design & Branding · this week*");
  expect(text).toContain("/my-work");
});
