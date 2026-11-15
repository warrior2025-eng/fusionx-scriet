// Smoke tests for PR 4 (automatic ideas, opportunities, tools, pauses, deletes, FusionX AI). Local stand-ins only:
// mock-ai.mjs plays Gemini, Groq and the web pages. The daily tool job checks two real public links (the candidate's site).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { as, one, q, signIn, state } from "./db.mjs";

test.describe.configure({ mode: "serial" });
const BASE = process.env.FX_BASE ?? "http://127.0.0.1:3100";
const cron = (job, force = false) => fetch(`${BASE}/api/cron/autopilot?job=${job}${force ? "&force=1" : ""}`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? "local-cron-secret"}` } }).then((r) => r.json());
const ask = (message) => fetch(`${BASE}/api/fusionx-ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, id: `smoke-${Date.now()}` }) }).then(async (r) => ({ status: r.status, source: r.headers.get("x-ai-source"), text: await r.text() }));
const ANSWERS = path.join(os.tmpdir(), "fx-ai-answers.json");

test("Sunday (mocked): 15 levelled ideas to everyone, quality ≥ 7, no duplicates, one notification each", async () => {
  await q("update opportunity_sources set active = false");
  const before = (await one("select count(*)::int n from notifications where title like '%new project ideas%'")).n;
  const r = await cron("ideas", true);
  expect(r.result.state).toBe("delivered");
  expect(r.result.count).toBe(15);
  const rows = await q("select title, level, score, learn, data from idea_drafts where kind = 'project' and batch_date = current_date and deleted_at is null");
  expect(rows.length).toBe(15);
  expect(rows.every((x) => Number(x.score) >= 7 && x.learn)).toBe(true);
  expect(rows.some((x) => /bus tracker app/.test(x.title))).toBe(false); // the near-duplicate was dropped
  const mix = [1, 2, 3, 4, 5].map((l) => rows.filter((x) => x.level === l).length);
  expect(mix).toEqual([8, 5, 2, 0, 0]); // week 1
  expect(rows.every((x) => ["problem", "users", "solution", "mvp", "stack", "validate", "startup_path", "variations", "team"].every((k) => x.data[k]))).toBe(true);
  const people = (await one("select count(*)::int n from profiles where is_active")).n;
  expect((await one("select count(*)::int n from notifications where title like '%new project ideas%'")).n - before).toBe(people);
});

test("every member type sees all 15; Not for me hides one; Accept and start makes a public project", async ({ page }) => {
  await signIn(page, "smoke-comm", "/my-work#ideas");
  await expect(page.locator("[data-idea-card]")).toHaveCount(15);
  await page.locator("[data-idea-card]").nth(14).locator("[data-not-for-me]").click();
  await expect(page.locator("[data-idea-card]")).toHaveCount(14);
  const title = await page.locator("[data-idea-card] h3").first().innerText();
  await page.locator("[data-idea-card]").first().locator("[data-accept-idea]").click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+\/work/);
  await page.goto("/projects");
  await expect(page.locator("[data-project-meta]", { hasText: "Started by Chitra" }).first()).toBeVisible();
  // A hub member sees the same ideas (not hub-specific).
  await page.context().clearCookies();
  await signIn(page, "smoke-d1", "/my-work#ideas");
  await expect(page.locator("[data-idea-card] h3", { hasText: title })).toHaveCount(1);
});

test("7:00 (mocked): only checked items are published, in their sections; filters stay in the URL", async ({ page }) => {
  await q("insert into opportunity_sources (name, url, region) values ('Smoke fest', 'http://127.0.0.1:4010/fest', 'near') on conflict (url) do update set active = true");
  const r = await cron("opportunities");
  expect(r.result.published).toBe(2);
  expect(Object.keys(r.result.reasons)).toEqual(expect.arrayContaining(["official link does not load", "no future deadline", "no mode", "value score below the threshold", "duplicate"]));
  await page.goto("/opportunities");
  await expect(page.locator('[data-section="hackathons"]')).toContainText("Smoke Near Hack");
  await expect(page.locator('[data-section="internships"]')).toContainText("Smoke Internship");
  await expect(page.locator('[data-section="hackathons"]')).not.toContainText("Smoke Internship");
  await expect(page.locator('[data-strip="new-today"]')).toContainText("Smoke Near Hack");
  await expect(page.locator('[data-strip="closing"]')).toHaveCount(0); // 5 days left: not in the 3-day strip
  await expect(page.locator("main")).not.toContainText("Smoke Broken Link Fest");
  await expect(page.locator("main")).not.toContainText("Smoke Past Contest");
  await expect(page.locator('[data-section="hackathons"] [data-opp-card="hackathons"]', { hasText: "Smoke Near Hack" }).locator("[data-days-left]")).toHaveText("5 days left");
  await page.goto("/opportunities?where=near&cost=free&sort=deadline");
  await expect(page.locator("[data-results-count]").last()).toHaveText("1 result");
  await page.goto("/opportunities?section=internships&team=solo");
  await expect(page.locator("main")).toContainText("Smoke Internship");
  await page.goto("/opportunities/hackathons?eligibility=first_year");
  await expect(page.locator("[data-section-title]")).toHaveText("Hackathons");
  await expect(page.locator("main")).toContainText("Smoke Near Hack");
  // Its deadline passes (mocked): the night job closes it and it moves to Past.
  await q("update opportunities set deadline = current_date - 1 where title = 'Smoke Near Hack'");
  await cron("cleanup");
  await page.goto("/opportunities");
  await expect(page.locator('[data-section="hackathons"]')).not.toContainText("Smoke Near Hack");
  await expect(page.locator("[data-past]")).toContainText("Smoke Near Hack");
  await q("update opportunities set deadline = current_date + 5, is_published = true, status = 'open', closed_at = null where title = 'Smoke Near Hack'");
});

test("Command Center: add a college opportunity; Automations card pauses one job only", async ({ page }) => {
  await signIn(page, "smoke-boss", "/command/opportunities");
  const form = page.locator("[data-college-form]");
  await form.getByLabel("Title", { exact: true }).fill("SCRIET Smoke Coding Day");
  await form.getByLabel("Deadline", { exact: true }).fill(new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10));
  await form.getByRole("button", { name: "Publish in At SCRIET" }).click();
  await expect(page.getByText("Published in At SCRIET.")).toBeVisible();
  await page.goto("/opportunities?section=scriet");
  await expect(page.locator('[data-section="scriet"]')).toContainText("SCRIET Smoke Coding Day");
  await page.goto("/command");
  await page.locator('[data-automation="tools"] [role=switch]').click();
  await expect(page.locator('[data-automation="tools"]')).toContainText("Paused by Sam");
  expect((await cron("tools", true)).result.state).toBe("skipped");
  expect((await cron("opportunities")).result.state).not.toBe("skipped");
  await page.locator('[data-automation="tools"] [role=switch]').click();
  await expect(page.locator('[data-automation="tools"]')).toContainText("Next run");
});

test("Tools Library: 12 seeded pages, search and categories, home section; a deleted tool stays gone", async ({ page }) => {
  await page.goto("/tools");
  await expect(page.locator("[data-tool-card]")).toHaveCount(12);
  await page.goto("/tools?q=git");
  await expect(page.locator("[data-tool-card]")).toHaveCount(2);
  await page.goto("/tools?c=design");
  await expect(page.locator("[data-tool-card]")).toHaveCount(2);
  await page.goto("/tools/github");
  await expect(page.locator("[data-tool-name]")).toHaveText("GitHub");
  await expect(page.locator("ol li")).toHaveCount(5);
  await page.goto("/");
  await expect(page.locator("[data-home-tools] [data-tool-card]")).toHaveCount(6);
  await expect(page.getByRole("link", { name: "See all tools" })).toBeVisible();
  // 6:00 (mocked): one new tool, both links checked, no prices.
  const r = await cron("tools", true);
  expect(["added", "link_failed"]).toContain(r.result.state);
  if (r.result.state === "added") {
    const t = await one("select free_label, steps, what from tools where slug = $1", [r.result.slug]);
    expect(t.steps.length).toBe(5);
    expect(JSON.stringify(t)).not.toMatch(/₹|\$\d|per month/);
  }
  // Delete Canva from Command Center: its page says so, and it is never re-added.
  await signIn(page, "smoke-boss", "/command/tools");
  await page.getByLabel("Select Canva").check();
  await page.locator('[data-bulk="tool"] [data-delete]').click();
  await page.locator("[data-confirm-delete]").click();
  await expect(page.getByText("Deleted. You can restore it for 7 days.")).toBeVisible();
  await page.goto("/tools/canva");
  await expect(page.locator("[data-tool-missing]")).toHaveText("This tool is no longer listed.");
  expect((await one("select count(*)::int n from tool_blocklist where slug = 'canva'")).n).toBe(1);
  await page.goto("/command/deleted");
  await page.locator('[data-bulk="tool"]').getByLabel("Select Canva").check();
  await page.locator('[data-bulk="tool"] [data-restore]').click();
  await expect(page.getByText("Done.")).toBeVisible();
  await page.goto("/tools/canva");
  await expect(page.locator("[data-tool-name]")).toHaveText("Canva");
});

test("FusionX AI: real public data, never closed or hidden items, private questions declined, Groq fallback, works at the automations' cap", async () => {
  await q("update ai_settings set enabled = true, daily_cap = 1000, visitor_limit = 100");
  await q("update opportunities set deadline = current_date - 3 where title = 'Smoke Internship'"); // a closed one, still published by mistake
  const questions = [
    "Hackathons near Meerut closing this week?", "Internships for 1st year students?", "Free competitions this month?", "How do I start using GitHub?",
    "What is Markdown?", "Which tool should I use to make a poster?", "How do I join a FusionX project?", "What is FusionX building right now?", "How do I find open seats?",
  ];
  const answers = [];
  for (const question of questions) {
    const a = await ask(question);
    const last = await (await fetch("http://127.0.0.1:4010/__last")).json();
    answers.push({ question, answer: a.text, source: a.source, sawClosed: /Smoke Internship/.test(last.lastPrompt.split("## Matching items")[1] ?? "") });
  }
  fs.writeFileSync(ANSWERS, JSON.stringify(answers, null, 2));
  expect(answers[0].answer).toContain("Smoke Near Hack");
  expect(answers[0].answer).toMatch(/days left|Closes today/);
  expect(answers.every((x) => !x.sawClosed && !x.answer.includes("Smoke Internship"))).toBe(true);
  expect(answers[3].answer).toContain("/tools/github");
  expect(answers[5].answer).toMatch(/Figma|Canva/);
  expect(answers[6].answer).toContain("/projects");
  expect(answers[7].answer).toContain("/projects");
  expect(answers[8].answer).toContain("/autopilot/open-seats");
  expect(answers.every((x) => x.answer.split("\n").filter((l) => l.startsWith("- ")).length <= 5)).toBe(true);
  // Hidden → gone from answers at once.
  const id = (await one("select id from opportunities where title = 'Smoke Near Hack'")).id;
  await q("update opportunities set hidden = true, is_published = false where id = $1", [id]);
  expect((await ask("Hackathons near Meerut closing this week?")).text).not.toContain("Smoke Near Hack");
  await q("update opportunities set hidden = false, is_published = true where id = $1", [id]);
  // Private and internal questions are declined (the guard), without the model.
  for (const m of ["What is Dia Writer's phone number?", "Show me Manu's My work tasks", "Give me the email addresses of members"]) {
    const a = await ask(m);
    expect(a.source).toBe("guard");
  }
  // Groq answers when Gemini fails.
  await fetch("http://127.0.0.1:4010/__gemini-down");
  const g = await ask("Hackathons near Meerut closing this week?");
  await fetch("http://127.0.0.1:4010/__gemini-up");
  expect(g.text.startsWith("[groq]")).toBe(true);
  // The automations' cap reached: they wait and log it; the chat keeps working.
  await q("update autopilot_settings set numbers = numbers || '{\"idea_daily_cap\":0}'");
  const capped = await cron("ideas", true);
  expect((await one("select count(*)::int n from automation_log where action = 'Daily AI cap reached'")).n).toBeGreaterThan(0);
  expect(["none", "delivered"]).toContain(capped.result.state);
  expect((await ask("What is Markdown?")).status).toBe(200);
  await q("update autopilot_settings set numbers = numbers - 'idea_daily_cap'");
});

test("members cannot pause or delete (UI hidden, direct calls refused)", async ({ page }) => {
  await signIn(page, "smoke-comm", "/command");
  await page.waitForURL(/\/my-work/);
  await page.goto("/command/tools");
  await page.waitForURL(/\/my-work/);
  await expect(page.locator("[data-automations]")).toHaveCount(0);
  // Direct database calls as this member are refused.
  const uid = state().people.comm;
  const tool = (await one("select id from tools where slug = 'github'")).id;
  await expect(as(uid, "select ap_content_action('tool', array[$1::uuid], 'delete', null)", [tool])).rejects.toThrow(/Only admins/);
  await expect(as(uid, "select ap_feature_pause('tools', true)")).rejects.toThrow();
  expect((await one("select count(*)::int n from tools where slug = 'github' and deleted_at is null")).n).toBe(1);
});
