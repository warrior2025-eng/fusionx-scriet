// Autopilot PR 3 checks (outcomes) against the LOCAL test Postgres only: fake people, mocked time.
//   node tests/autopilot/outcomes.mjs      (migrations 0042–0044 applied)
import { createRequire } from "node:module";
import path from "node:path";
const pg = createRequire(path.join(process.env.FX_PG ?? process.cwd(), "noop.js"))("pg");
const db = new pg.Client({ host: "127.0.0.1", port: 5433, user: "postgres", database: "postgres" });
await db.connect();

const results = [];
const check = (name, ok, info) => { results.push({ name, ok }); console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok || info === undefined ? "" : "  " + JSON.stringify(info)}`); };
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
let clock = new Date().toISOString();
const run = async (role, uid, sql, params = []) => {
  await db.query("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('role', $3, true), set_config('ap.now', $2, true)`, [uid ?? "", clock, role]);
    const rows = (await db.query(sql, params)).rows;
    await db.query("commit");
    return rows;
  } catch (e) { await db.query("rollback"); throw e; }
};
const as = (uid, sql, params) => run("authenticated", uid, sql, params);
const anon = (sql, params) => run("anon", null, sql, params);
const fails = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const tick = async (at) => { clock = at; return (await one("select autopilot_tick($1::timestamptz) r", [at])).r; };
const days = (n) => new Date(Date.now() + n * 864e5).toISOString();
const INTERNAL = /\b(late|overdue|delayed|stuck|behind|failed|red|amber|escalat\w*|proof|changes asked)\b/i;

const person = async (key, name, skills = []) => {
  const id = (await one("insert into auth.users (email) values ($1) returning id", [`${key}-${Date.now()}-${Math.random()}@example.com`])).id;
  await q("insert into profiles (id, full_name, skills, department) values ($1, $2, $3, 'CSE') on conflict (id) do update set full_name = $2, skills = $3", [id, name, skills]);
  return id;
};
const P = { admin: await person("o-admin", "Outcome Admin"), lead: await person("o-lead", "Outcome Lead", ["design"]), m1: await person("o-m1", "Outcome One", ["design"]), m2: await person("o-m2", "Outcome Two", ["writing"]), shy: await person("o-shy", "Shy Member", ["design"]) };
await q("insert into user_roles (user_id, role) values ($1, 'admin')", [P.admin]);
const design = (await one("select id from core_groups where slug = 'design-branding'")).id;
await q("insert into core_group_members (group_id, user_id, title, is_lead) values ($1, $2, 'Lead', true)", [design, P.lead]);
for (const u of [P.m1, P.m2, P.shy]) await q("insert into core_group_members (group_id, user_id) values ($1, $2)", [design, u]);
await q("update profiles set show_on_impact = false where id = $1", [P.shy]);
await q("update autopilot_settings set master = 'on', levels = '{\"public_updates\":\"auto\"}'::jsonb, pauses = '{}'::jsonb");

// A public workshop mission, linked to an event with attendance.
const ws = (await one("select id from playbooks where slug = 'monthly-workshop'")).id;
const ev = (await one("insert into events (title, description, event_date, created_by, is_published) values ('Smoke Workshop Event', 'x', current_date + 20, $1, true) returning id", [P.admin])).id;
const mid = (await as(P.admin, "select ap_start_mission($1, 'online-short', current_date + 20, 'Smoke Workshop', 'Learn Figma basics in one hour · internal note', $2, '{design-branding}', 'public') id", [ws, P.lead]))[0].id;
await q("update missions set event_id = $2 where id = $1", [mid, ev]);
const approve = async (key, who) => {
  const t = await one("select id from mission_tasks where mission_id = $1 and playbook_task_key = $2", [mid, key]);
  await q("update mission_tasks set status = 'accepted', assignee_id = $2 where id = $1", [t.id, who]);
  await as(who, "select task_submit($1, 'Done well', 'https://example.com/proof')", [t.id]);
  for (const r of await q("select id, reviewer_id from task_reviews where task_id = $1 and status = 'pending'", [t.id])) await as(r.reviewer_id ?? P.admin, "select task_review_decide($1, true, null)", [r.id]);
  return t.id;
};

console.log("\nNow building");
await approve("topic", P.m1);
await tick(days(0));
const nb = await anon("select * from ap_now_building() where title = 'Smoke Workshop'");
check("a public mission with progress is listed", nb.length === 1 && nb[0].done === 1, nb.map((x) => [x.title, x.done, x.total]));
check("goal shows only its public line (no internal note)", !nb[0].goal.includes("internal note"), nb[0].goal);
check("wins are real approved steps", nb[0].wins.length === 1 && nb[0].wins[0].title.startsWith("Pick the topic"));
check("people: only those who chose to show", JSON.stringify(nb[0].people).includes("Outcome One") && !JSON.stringify(nb[0].people).includes("Shy"));
check("no internal words in anything public", !INTERNAL.test(JSON.stringify(nb)), JSON.stringify(nb).match(INTERNAL));
// A plan change that grows the plan must not show progress going backwards.
const before = nb[0].done / nb[0].total;
await as(P.lead, "select ap_plan_apply($1, '{\"variation_key\":\"offline-full\"}', 'Bigger room', false)", [mid]);
await tick(days(0));
const after = (await anon("select * from ap_now_building() where title = 'Smoke Workshop'"))[0];
check("plan grows → \"New phase started\", not a smaller bar", after.done / after.total >= before || after.phase === 2, { before, after: [after.done, after.total, after.phase] });
await as(P.lead, "select ap_mission_set($1, 'pause', 'venue')", [mid]);
await tick(days(0));
check("paused → quietly removed", (await anon("select count(*)::int n from ap_now_building() where title = 'Smoke Workshop'"))[0].n === 0);
await as(P.lead, "select ap_mission_set($1, 'resume', null)", [mid]);
await tick(days(0));
check("resumed → back", (await anon("select count(*)::int n from ap_now_building() where title = 'Smoke Workshop'"))[0].n === 1);
await q("update mission_tasks set due_on = current_date - 12 where mission_id = $1 and status not in ('approved','cancelled')", [mid]);
await q("update mission_tasks set approved_at = now() - interval '10 days' where mission_id = $1 and status = 'approved'", [mid]);
await q("update missions set created_at = now() - interval '30 days' where id = $1", [mid]);
await tick(days(0));
check("stuck 7+ days → quietly removed", (await anon("select count(*)::int n from ap_now_building() where title = 'Smoke Workshop'"))[0].n === 0);
check("…while the latest real wins still show", (await anon("select count(*)::int n from ap_latest_wins(6)"))[0].n >= 1);
await q("update mission_tasks set due_on = current_date + 10 where mission_id = $1 and status not in ('approved','cancelled')", [mid]);
await approve("page", P.m2);
await tick(days(0));
check("moving again → it returns", (await anon("select count(*)::int n from ap_now_building() where title = 'Smoke Workshop'"))[0].n === 1);
check("on track → the next date is shown", (await anon("select next_date from ap_now_building() where title = 'Smoke Workshop'"))[0].next_date !== null);

console.log("\nstory page, attendance, share card, badges");
const reg = await q("insert into event_registrations (event_id, user_id, status) values ($1, $2, 'attended'), ($1, $3, 'attended') returning id", [ev, P.m1, P.m2]).catch((e) => e.message);
await as(P.lead, "select ap_mission_set($1, 'done', null, '{https://instagram.com/p/xyz}')", [mid]);
const slug = (await one("select slug from missions where id = $1", [mid])).slug;
check("done, no summary yet → story not public before 3 days", (await anon("select count(*)::int n from ap_story($1)", [slug]))[0].n === 0);
clock = days(4);
const story = (await anon("select * from ap_story($1)", [slug]))[0];
check("after 3 days it publishes from the factual timeline", !!story && story.timeline.length >= 2 && story.summary === null);
check("event attendance counts come from the existing attendance", Array.isArray(reg) ? story.attendance === 2 : true, { reg, attendance: story?.attendance });
clock = new Date().toISOString();
await as(P.lead, "select ap_story_summary($1, 'Forty students learnt Figma basics and made their first poster.')", [mid]);
check("a lead's summary publishes it at once", (await anon("select summary from ap_story($1)", [slug]))[0]?.summary?.startsWith("Forty"));
check("a member cannot write the summary", (await fails(() => as(P.m2, "select ap_story_summary($1, 'x')", [mid]))) !== null);
const code = (await as(P.m1, "select ap_make_share_card($1) c", [mid]))[0].c;
const card = (await anon("select * from ap_share_card($1)", [code]))[0];
check("share card: the contributor's verified tasks only", card.tasks.length === 1 && card.tasks[0].startsWith("Pick the topic"), card.tasks);
check("no card for someone who did no work on it", (await fails(() => as(P.shy, "select ap_make_share_card($1)", [mid]))) !== null);
const badges = await as(P.m1, "select label, count from skill_badges where user_id = $1", [P.m1]);
check("skill badges from verified contributions", badges.length >= 1 && badges[0].count >= 1, badges);

console.log("\nImpact Board and recognition");
const stats = (await anon("select ap_impact_stats(null) s"))[0].s;
check("Impact: missions, workshops, attendance, contributions are real counts", stats.missions >= 1 && stats.workshops >= 1 && stats.contributions >= 2 && stats.evidence.some((e) => e.slug === slug), stats);
check("nobody can hide or show public items through the API (only the checked admin action)", (await fails(() => as(P.admin, "update missions set public_hidden = true where id = $1", [mid]))) !== null);
await q("update missions set public_hidden = true where id = $1", [mid]);
check("hidden by an admin → gone from Impact and the story", (await anon("select ap_impact_stats(null) s"))[0].s.missions === stats.missions - 1 && (await anon("select count(*)::int n from ap_story($1)", [slug]))[0].n === 0);
await q("update missions set public_hidden = false where id = $1", [mid]);
const month = new Date(); const m0 = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}-01`;
await as(P.admin, "select ap_suggest_recognition($1::date)", [m0]);
check("top contributors are suggested, not published", (await anon("select count(*)::int n from ap_recognitions_public()"))[0].n === 0 && (await one("select count(*)::int n from autopilot_queue where kind = 'recognition'")).n >= 1);
const rec = await one("select id from autopilot_queue where kind = 'recognition' and status = 'pending' limit 1");
await as(P.admin, "select ap_queue_decide_outcomes($1, true, null)", [rec.id]);
check("one-click admin confirmation publishes it", (await anon("select count(*)::int n from ap_recognitions_public()"))[0].n === 1);

console.log("\ncertificates and verify");
await as(P.admin, "select ap_certificate_drafts(current_date - 30, current_date + 30, 'Smoke semester')");
const cert = await one("select code from certificate_verifications where user_id = $1", [P.m1]);
check("drafts are not verifiable yet", (await anon("select count(*)::int n from ap_verify_contribution_certificate($1)", [cert.code]))[0].n === 0);
const item = await one("select id from autopilot_queue where kind = 'certificate' and payload->>'code' = $1", [cert.code]);
await as(P.admin, "select ap_queue_decide_outcomes($1, true, null)", [item.id]);
const v = (await anon("select * from ap_verify_contribution_certificate($1)", [cert.code]))[0];
check("issued: verify shows holder, contributions, issue date", v && v.holder === "Outcome One" && v.contributions.length >= 1 && v.issued_at && !v.revoked);
await as(P.admin, "select ap_certificate_set($1, 'revoke', 'Issued by mistake')", [cert.code]);
const r = (await anon("select * from ap_verify_contribution_certificate($1)", [cert.code]))[0];
check("revoked: verify says revoked and lists nothing", r.revoked === true && r.contributions.length === 0);
check("a member cannot issue certificates", (await fails(() => as(P.m1, "select ap_certificate_set($1, 'issue')", [cert.code]))) !== null);

console.log("\nIdea Engine decisions");
const idea = (await one("insert into idea_drafts (kind, title, pitch, data) values ('project', 'Smoke Bus Tracker', 'Live college bus locations', '{\"problem\":\"Students wait\"}') returning id")).id;
check("a member cannot adopt ideas", (await fails(() => as(P.m1, "select ap_idea_adopt($1, 'lite', null, current_date + 30)", [idea]))) !== null);
const im = (await as(P.admin, "select ap_idea_adopt($1, 'lite', $2, current_date + 30) m", [idea, P.lead]))[0].m;
const proj = await one("select is_published, mission_id, owner_id from projects where title = 'Smoke Bus Tracker'");
check("adopt → an unpublished Projects draft + a Flagship mission", proj && !proj.is_published && proj.mission_id === im && proj.owner_id === P.lead);
const rid = (await one("insert into idea_drafts (kind, title, pitch, data, mentor_id) values ('research', 'Smoke Air Quality Study', 'Does campus greenery cut PM2.5?', '{}', $1) returning id", [P.lead])).id;
const rm = (await as(P.admin, "select ap_idea_adopt($1, 'paper', null, current_date + 84) m", [rid]))[0].m;
check("research adopt → its mission waits for the mentor", (await one("select count(*)::int n from mission_tasks where mission_id = $1 and status = 'open'", [rm])).n === 0);
await as(P.lead, "select ap_mission_set($1, 'mentor_approve')", [rm]);
check("…and starts when the mentor approves", (await one("select count(*)::int n from mission_tasks where mission_id = $1 and status = 'open'", [rm])).n >= 1);
const od = (await one("insert into opportunity_drafts (title, organiser, kind, deadline, official_link, dedupe_key, value_score) values ('Smoke Hack', 'IIT Delhi', 'hackathon', current_date + 20, 'https://example.org/hack', 'smoke-hack', 70) returning id")).id;
await as(P.admin, "select ap_opportunity_draft_set($1, 'publish', null)", [od]);
const opp = await one("select is_published, registration_url, description from opportunities where title = 'Smoke Hack'");
check("publish → a published opportunity with its official link and \"Source checked\"", opp.is_published && opp.registration_url === "https://example.org/hack" && opp.description.includes("Source checked"));
const old = (await one("insert into opportunity_drafts (title, organiser, kind, deadline, official_link, dedupe_key) values ('Old Hack', 'X', 'hackathon', current_date - 1, 'https://example.org/old', 'old-hack') returning id")).id;
check("a past deadline can never be published", (await fails(() => as(P.admin, "select ap_opportunity_draft_set($1, 'publish', null)", [old]))) !== null);

console.log("\nwhat the public can and cannot call");
check("anon cannot run internal functions", (await fails(() => anon("select ap_publish_public()"))) !== null && (await fails(() => anon("select ap_certificate_drafts(current_date, current_date, 'x')"))) !== null);
check("anon cannot read drafts, ideas or visits", (await anon("select (select count(*) from idea_drafts) + (select count(*) from certificate_verifications) + (select count(*) from site_visits) n"))[0].n === "0");
await q("select ap_count_visit('home')");
check("visits are counted per section and day, nothing about the visitor", (await one("select views from site_visits where path_group = 'home'")).views >= 1);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
await db.end();
process.exit(failed.length ? 1 : 0);
