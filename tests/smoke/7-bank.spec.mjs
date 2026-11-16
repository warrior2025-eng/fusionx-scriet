// The idea bank: ideas made ahead of time are delivered at once, even when no AI can answer now. Local stack only.
import { test, expect } from "@playwright/test";
import { one, q } from "./db.mjs";

const BASE = process.env.FX_BASE ?? "http://127.0.0.1:3100";
const cron = (job, force = false) => fetch(`${BASE}/api/cron/autopilot?job=${job}${force ? "&force=1" : ""}`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? "local-cron-secret"}` } }).then((r) => r.json());
const WORDS = ["Amber", "Basil", "Cedar", "Delta", "Ember", "Fable", "Garnet", "Harbor", "Indigo", "Juniper", "Krypton", "Lantern", "Meadow", "Nimbus", "Orchid"];

test("with no AI available, Run now delivers 15 ideas from the idea bank", async () => {
  await q("update autopilot_settings set numbers = numbers || '{\"idea_daily_cap\":0}'"); // no AI call is allowed
  await q("delete from idea_drafts where data->>'bank' = 'true'"); // only this test's bank
  const levels = [...Array(8).fill(1), ...Array(5).fill(2), ...Array(2).fill(3)];
  for (const [i, level] of levels.entries()) {
    await q("insert into idea_drafts (kind, title, pitch, level, learn, score, data, status) values ('project', $1, $2, $3, 'How to ship it', 8, $4, 'draft')",
      [WORDS[i], WORDS[i], level, JSON.stringify({ problem: "p", users: "u", solution: "s", mvp: "m", stack: "Next.js", bank: true })]);
  }
  const r = await cron("ideas", true);
  expect(r.result.state).toBe("delivered");
  expect(r.result.from_bank).toBe(15);
  const delivered = await q("select title, status, data from idea_drafts where title = any($1)", [WORDS]);
  expect(delivered.length).toBe(15);
  expect(delivered.every((d) => d.status === "published" && !d.data.bank)).toBe(true);
  expect((await one("select count(*)::int n from automation_log where action like 'Delivered 15 project ideas%' and reason like '%15 from the idea bank%'")).n).toBeGreaterThan(0);
  await q("update autopilot_settings set numbers = numbers - 'idea_daily_cap'");
});
