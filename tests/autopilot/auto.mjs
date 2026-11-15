// Autopilot PR 4 checks (automatic ideas, opportunities, tools, pauses, deletes) against the LOCAL test Postgres only.
//   node tests/autopilot/auto.mjs      (migrations 0042–0045 applied)
import { createRequire } from "node:module";
import path from "node:path";
const pg = createRequire(path.join(process.env.FX_PG ?? process.cwd(), "noop.js"))("pg");
const db = new pg.Client({ host: "127.0.0.1", port: 5433, user: "postgres", database: "postgres" });
await db.connect();

const results = [];
const check = (name, ok, info) => { results.push({ name, ok }); console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok || info === undefined ? "" : "  " + JSON.stringify(info)}`); };
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const run = async (role, uid, sql, params = []) => {
  await db.query("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('role', $2, true)`, [uid ?? "", role]);
    const rows = (await db.query(sql, params)).rows;
    await db.query("commit");
    return rows;
  } catch (e) { await db.query("rollback"); throw e; }
};
const as = (uid, sql, params) => run("authenticated", uid, sql, params);
const anon = (sql, params) => run("anon", null, sql, params);
const fails = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

const person = async (key, name) => {
  const id = (await one("insert into auth.users (email) values ($1) returning id", [`${key}-${Date.now()}-${Math.random()}@example.com`])).id;
  await q("insert into profiles (id, full_name) values ($1, $2) on conflict (id) do update set full_name = $2", [id, name]);
  return id;
};
const P = { admin: await person("a-admin", "Auto Admin"), m1: await person("a-m1", "Asha Member"), m2: await person("a-m2", "Bilal Member"), out: await person("a-out", "Chetan Outsider") };
await q("insert into user_roles (user_id, role) values ($1, 'admin')", [P.admin]);
await q("update autopilot_settings set master = 'on', feature_pauses = '{}'::jsonb");

console.log("\nControl defaults");
const lv = (await one("select levels from autopilot_settings")).levels;
check("ideas to members, opportunities and tools start on Auto", lv.ideas_members === "auto" && lv.opportunities_publish === "auto" && lv.tools_daily === "auto", lv);

console.log("\nideas delivered to everyone");
const batch = new Date().toISOString().slice(0, 10);
const ins = async (title, level) => (await one("insert into idea_drafts (kind, title, pitch, data, level, learn, score, batch_date, status, published_at) values ('project', $1, 'A pitch', '{\"stack\":\"Next.js, Supabase\",\"problem\":\"p\",\"solution\":\"s\"}', $2, 'You learn X', 8, $3, 'published', now()) returning id", [title, level, batch])).id;
const i1 = await ins("Auto Idea One", 1), i2 = await ins("Auto Idea Two", 2), i3 = await ins("Auto Idea Three", 1);
await q("insert into idea_drafts (kind, title, pitch, data, status) values ('project', 'Undelivered draft', 'x', '{}', 'draft')");
check("every member sees delivered ideas (not drafts)", (await as(P.out, "select count(*)::int n from idea_drafts where batch_date = $1", [batch]))[0].n === 3
  && (await as(P.out, "select count(*)::int n from idea_drafts where title = 'Undelivered draft'"))[0].n === 0);
check("visitors (signed out) see none", (await anon("select count(*)::int n from idea_drafts"))[0].n === 0);
await as(P.m1, "select ap_idea_choice($1, 'hidden')", [i3]);
check("\"Not for me\" hides it for that member only", (await as(P.m1, "select state from idea_member_states where idea_id = $1", [i3]))[0].state === "hidden"
  && (await as(P.m2, "select count(*)::int n from idea_member_states where idea_id = $1", [i3]))[0].n === 0);

console.log("\naccept and start, join, open projects");
const pid = (await as(P.m1, "select ap_idea_accept($1, 'lite') id", [i1]))[0].id;
const proj = await one("select owner_id, is_published, status, idea_id from projects where id = $1", [pid]);
check("Accept and start → a published project owned by the member, in progress, linked to the idea", proj.owner_id === P.m1 && proj.is_published && proj.status === "building" && proj.idea_id === i1, proj);
check("…with a plan (milestones)", (await one("select count(*)::int n from project_milestones where project_id = $1", [pid])).n >= 4);
const meta = (await anon("select * from ap_public_project_meta(array[$1]::uuid[])", [pid]))[0];
check("Projects shows \"Started by <name>\"", meta.started_by === "Asha" && meta.from_idea === true, meta);
const pid2 = (await as(P.m2, "select ap_idea_accept($1, 'standard') id", [i1]))[0].id;
check("a second member can start their own → \"2 teams are building this\"", (await anon("select teams from ap_public_project_meta(array[$1]::uuid[])", [pid2]))[0].teams === 2);
await as(P.out, "select ap_join_project($1)", [pid]);
check("…or join an existing one", (await one("select count(*)::int n from project_members where project_id = $1 and user_id = $2", [pid, P.out])).n === 1);
check("members cannot publish ideas to Projects", (await fails(() => as(P.m1, "select ap_idea_publish_open($1, null)", [i2]))) !== null);
const open = (await as(P.admin, "select ap_idea_publish_open($1, $2) id", [i2, P.admin]))[0].id;
check("admin \"Publish to Projects\" → \"Open project · looking for a team\"", (await anon("select open_for_team from ap_public_project_meta(array[$1]::uuid[])", [open]))[0].open_for_team === true);
await as(P.m2, "select ap_join_project($1)", [open]);
check("members can join the open project", (await one("select count(*)::int n from project_members where project_id = $1", [open])).n === 1);

console.log("\npause, delete, restore");
check("members cannot pause automations", (await fails(() => as(P.m1, "select ap_feature_pause('ideas', true)"))) !== null);
await as(P.admin, "select ap_feature_pause('ideas', true)");
const fp = (await one("select feature_pauses from autopilot_settings")).feature_pauses;
check("an admin pauses only that automation (who and when kept)", fp.ideas?.name === "Auto Admin" && !fp.tools, fp);
await as(P.admin, "select ap_feature_pause('ideas', false)");
check("…and resumes it", !(await one("select feature_pauses from autopilot_settings")).feature_pauses.ideas);
check("audit-logged", (await one("select count(*)::int n from audit_logs where action like 'autopilot.automation.%'")).n >= 2);
check("members cannot delete", (await fails(() => as(P.m1, "select ap_content_action('idea', array[$1]::uuid[], 'delete', null)", [i1]))) !== null);
const v0 = (await one("select knowledge_version v from ai_settings")).v;
await as(P.admin, "select ap_content_action('idea', array[$1]::uuid[], 'delete', 'Bad idea')", [i1]);
check("deleted idea leaves everyone's My work at once", (await as(P.m2, "select count(*)::int n from idea_drafts where id = $1", [i1]))[0].n === 0);
check("…projects started from it stay with their owners", (await one("select count(*)::int n from projects where idea_id = $1 and is_published", [i1])).n === 2);
check("FusionX AI is told to refresh right away", (await one("select knowledge_version v from ai_settings")).v > v0);
await as(P.admin, "select ap_content_action('idea', array[$1]::uuid[], 'restore', null)", [i1]);
check("Restore within 7 days brings it back", (await as(P.m2, "select count(*)::int n from idea_drafts where id = $1", [i1]))[0].n === 1);
await as(P.admin, "select ap_delete_batch('ideas', $1, 'Bad batch')", [batch]);
check("a whole Sunday batch can be deleted", (await as(P.m2, "select count(*)::int n from idea_drafts where batch_date = $1", [batch]))[0].n === 0);
await q("update idea_drafts set deleted_at = now() - interval '8 days' where batch_date = $1", [batch]);
await q("select ap_purge_deleted()");
check("after 7 days deleted ideas go for good; projects stay", (await one("select count(*)::int n from idea_drafts where batch_date = $1", [batch])).n === 0 && (await one("select count(*)::int n from projects where id = $1", [pid])).n === 1);

console.log("\nopportunities");
const draft = async (title, deadline, link) => (await one("insert into opportunity_drafts (title, organiser, kind, deadline, official_link, dedupe_key, value_score, mode, city, distance_km, hubs) values ($1, 'IIT Delhi', 'hackathon', $2, $3, $4, 70, 'offline', 'Delhi', 76, '{projects-research-startups}') returning id", [title, deadline, link, title + deadline])).id;
const runId = "11111111-1111-4111-8111-111111111111";
const d1 = await draft("Auto Hack One", new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10), "https://example.org/a");
const o1 = (await one("select ap_publish_radar_item($1, $2, '{\"category\":\"hackathon\",\"region\":\"near\",\"cost\":\"free\",\"team_mode\":\"team\",\"eligibility_level\":\"first_year\",\"has_prize\":true}'::jsonb) id", [d1, runId])).id;
const opp = await one("select section, source, region, cost, description, is_published, first_published_at from opportunities where id = $1", [o1]);
check("published in the right section with every filter field", opp.section === "hackathons" && opp.source === "auto" && opp.region === "near" && opp.cost === "free" && opp.is_published && opp.first_published_at, opp);
check("labelled \"Source checked automatically\" and auto", opp.description.includes("Source checked automatically") && opp.description.includes("auto"));
const dup = await draft("Auto Hack One ", new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10), "https://example.org/a2");
check("same name and date → merged, not published twice", (await one("select ap_publish_radar_item($1, $2, '{}'::jsonb) id", [dup, runId])).id === null);
const pastDraft = (await one("insert into opportunity_drafts (title, organiser, kind, deadline, official_link, dedupe_key) values ('Old', 'X', 'fest', current_date - 1, 'https://example.org/o', 'old-x') returning id")).id;
check("a past deadline is never published", (await one("select ap_publish_radar_item($1, $2, '{}'::jsonb) id", [pastDraft, runId])).id === null);
check("sections map from categories (no mixing)", (await one("select ap_opp_section('scholarship', 'auto') a, ap_opp_section('tech_fest', 'auto') b, ap_opp_section('conference', 'auto') c, ap_opp_section('workshop', 'scriet') d")).a === "fellowships");
await q("update opportunities set deadline = current_date where id = $1", [o1]);
await q("select ap_close_past_opportunities()");
check("still visible on its deadline day", (await anon("select count(*)::int n from opportunities where id = $1", [o1]))[0].n === 1);
await q("update opportunities set deadline = current_date - 1 where id = $1", [o1]);
await q("select ap_close_past_opportunities()");
check("the day after its deadline: closed and unpublished", (await anon("select count(*)::int n from opportunities where id = $1", [o1]))[0].n === 0);
check("…and listed under Past opportunities", (await anon("select count(*)::int n from ap_past_opportunities() where id = $1", [o1]))[0].n === 1);
check("members cannot add college opportunities", (await fails(() => as(P.m1, "select ap_add_college_opportunity('{\"title\":\"x\",\"deadline\":\"2030-01-01\"}')"))) !== null);
const col = (await as(P.admin, "select ap_add_college_opportunity(jsonb_build_object('title', 'SCRIET Coding Day', 'deadline', (current_date + 5)::text, 'category', 'competition')) id"))[0].id;
check("college form → published in At SCRIET", (await anon("select section from opportunities where id = $1", [col]))[0]?.section === "scriet");
check("without a deadline, only as Rolling", (await fails(() => as(P.admin, "select ap_add_college_opportunity('{\"title\":\"No date\"}')"))) !== null);
const d2 = await draft("Auto Hack Two", new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10), "https://example.org/b");
const run2 = "22222222-2222-4222-8222-222222222222";
await q("select ap_publish_radar_item($1, $2, '{\"category\":\"hackathon\"}'::jsonb)", [d2, run2]);
await as(P.admin, "select ap_delete_batch('opportunities', $1, 'Bad morning')", [run2]);
check("\"Delete all from this run\" removes that morning's items", (await anon("select count(*)::int n from opportunities where run_id = $1", [run2]))[0].n === 0);

console.log("\ntools");
check("12 tools seeded, public", (await anon("select count(*)::int n from tools"))[0].n === 12);
const seed = await q("select official_url, docs_url, free_label, steps, uses, tips, why, what from tools");
check("seeded pages: no prices, 5 steps, 3 uses, 3 tips", seed.every((t) => !/(₹|\$|per month)/.test(JSON.stringify(t)) && t.steps.length === 5 && t.uses.length === 3 && t.tips.length === 3));
const gh = (await one("select id from tools where slug = 'github'")).id;
await as(P.admin, "select ap_content_action('tool', array[$1]::uuid[], 'delete', 'test')", [gh]);
check("a deleted tool disappears and goes on the \"do not add\" list", (await anon("select count(*)::int n from tools where slug = 'github'"))[0].n === 0 && (await one("select count(*)::int n from tool_blocklist where slug = 'github'")).n === 1);
await as(P.admin, "select ap_content_action('tool', array[$1]::uuid[], 'restore', null)", [gh]);
check("restore puts it back and takes it off the list", (await anon("select count(*)::int n from tools where slug = 'github'"))[0].n === 1 && (await one("select count(*)::int n from tool_blocklist where slug = 'github'")).n === 0);
check("members cannot edit tools", (await fails(() => as(P.m1, "select ap_tool_save($1, '{\"name\":\"X\"}')", [gh]))) !== null);
check("nobody writes tools through the API", (await fails(() => as(P.admin, "update tools set name = 'X' where id = $1", [gh]))) !== null);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
await db.end();
process.exit(failed.length ? 1 : 0);
