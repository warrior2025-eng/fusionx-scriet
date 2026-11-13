// Autopilot engine checks against the LOCAL test Postgres (127.0.0.1:5433) only: fake people, mocked time.
// Needs the migrations applied (tests/meetings-polish/local/apply.mjs) and FX_PG = a folder whose node_modules has "pg".
//   node tests/autopilot/engine.mjs
import { createRequire } from "node:module";
import path from "node:path";
const pg = createRequire(path.join(process.env.FX_PG ?? process.cwd(), "noop.js"))("pg");
const db = new pg.Client({ host: "127.0.0.1", port: 5433, user: "postgres", database: "postgres" });
await db.connect();

const results = [];
const check = (name, ok, info) => { results.push({ name, ok }); console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok || info === undefined ? "" : "  " + JSON.stringify(info)}`); };
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
// Runs SQL as a signed-in person (as PostgREST would: role authenticated, the token's sub).
// One mocked clock for the engine and for what people do.
let clock = "2026-11-02T04:00:00Z";
const as = async (uid, sql, params = []) => {
  await db.query("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('role', 'authenticated', true), set_config('ap.now', $2, true)`, [uid, clock]);
    const rows = (await db.query(sql, params)).rows;
    await db.query("commit");
    return rows;
  } catch (e) { await db.query("rollback"); throw e; }
};
const fails = async (uid, sql, params = []) => { try { await as(uid, sql, params); return null; } catch (e) { return e.message; } };
const tick = async (at) => { clock = at; return one("select autopilot_tick($1::timestamptz) r", [at]); };

// ── People: a super admin, the Head of Execution, a design lead, three design members, a competitions member.
const person = async (key, name, skills = []) => {
  const id = (await one("insert into auth.users (email) values ($1) returning id", [`${key}@example.com`])).id;
  await q("insert into profiles (id, full_name, skills) values ($1, $2, $3) on conflict (id) do update set full_name = $2, skills = $3", [id, name, skills]);
  return id;
};
const P = {
  boss: await person("boss", "Super Admin"), hoe: await person("hoe", "Head Execution"), lead: await person("lead", "Design Lead", ["design"]),
  d1: await person("d1", "Designer One", ["design", "canva"]), d2: await person("d2", "Designer Two", ["writing"]), d3: await person("d3", "Designer Three", ["video"]),
  c1: await person("c1", "Comp One", ["research"]), out: await person("out", "Outsider"),
};
await q("insert into user_roles (user_id, role) values ($1, 'super_admin')", [P.boss]);
const group = async (slug) => (await one("select id from core_groups where slug = $1", [slug])).id;
const core = await group("fusionx-core"), design = await group("design-branding"), comp = await group("competitions-opportunities");
await q("insert into core_group_members (group_id, user_id, title) values ($1, $2, 'Head of Execution')", [core, P.hoe]);
await q("insert into core_group_members (group_id, user_id, title, is_lead) values ($1, $2, 'Lead', true)", [design, P.lead]);
for (const u of [P.d1, P.d2, P.d3]) await q("insert into core_group_members (group_id, user_id) values ($1, $2)", [design, u]);
await q("insert into core_group_members (group_id, user_id) values ($1, $2)", [comp, P.c1]);

console.log("\nseed and defaults");
check("8 playbooks seeded, all active", (await one("select count(*)::int n from playbooks where status = 'active'")).n === 8);
check("every playbook has 2–3 variations", (await one("select count(*)::int n from playbooks p where (select count(*) from playbook_variations v where v.playbook_id = p.id) not between 2 and 3")).n === 0);
check("4 calendar rules, all on", (await one("select count(*)::int n from autopilot_rules where is_on")).n === 4);
check("master switch On; every area in Suggest", (await one("select ap_on() o, ap_level('assignment') a, ap_level('missions_rules') r")).o === true
  && (await one("select ap_level('assignment') a")).a === "suggest");
check("server_secrets: no access for members", (await fails(P.boss, "select * from server_secrets")) !== null);

console.log("\nsuggest mode: rules prepare missions in Today");
const T0 = "2026-11-02T04:00:00Z"; // Monday 09:30 IST
await tick(T0);
const pending = await q("select kind, title from autopilot_queue where status = 'pending' order by created_at");
check("rules prepared 'create mission' items (weekly posts and digests, workshop, Build Night)", pending.filter((p) => p.kind === "create_mission").length >= 6, pending.map((p) => p.title));
check("nothing was created on its own", (await one("select count(*)::int n from missions")).n === 0);
check("a member cannot read the queue", (await as(P.d1, "select count(*)::int n from autopilot_queue"))[0].n === 0);
check("the Head of Execution can read the queue", (await as(P.hoe, "select count(*)::int n from autopilot_queue"))[0].n > 0);
const post = await one("select id, payload from autopilot_queue where kind = 'create_mission' and title like 'Create \"Weekly social post\"%' order by payload->>'date' limit 1");
check("a member cannot approve it", (await fails(P.d1, "select ap_queue_decide($1, true, null)", [post.id])) !== null);
check("one click in Today creates the mission", (await as(P.hoe, "select ap_queue_decide($1, true, null) m", [post.id]))[0].m === "Mission created.");
const mission = await one("select * from missions where rule_id = $1", [post.payload.rule_id]);
const tasks = await q("select * from mission_tasks where mission_id = $1 order by sort", [mission.id]);
check("tasks generated from the Single variation (no reel task)", tasks.length === 3 && !tasks.some((t) => t.playbook_task_key === "reel"), tasks.map((t) => t.playbook_task_key));
check("real dates: caption 4 days before, publish on the day", tasks[0].due_on.getTime() === new Date(mission.mission_date.getTime() - 4 * 864e5).getTime());
check("dependencies: only the first task is open, the rest wait", tasks.map((t) => t.status).join() === "open,waiting,waiting", tasks.map((t) => t.status));
check("the design lead owns it", mission.owner_id === P.lead);

console.log("\nassignment");
await tick(T0);
const offerItem = await one("select * from autopilot_queue where kind = 'offer_task' and status = 'pending' and payload->>'task_id' = $1", [tasks[0].id]);
check("Suggest: an offer is prepared, marked safe", !!offerItem && offerItem.safe);
check("best fit by skills: caption (writing) goes to Designer Two", offerItem?.payload.user_id === P.d2, offerItem?.payload);
await q("update autopilot_settings set levels = levels || '{\"assignment\":\"auto\"}'");
check("Approve all safe items carries it out", (await as(P.hoe, "select ap_queue_approve_safe() n"))[0].n >= 1);
const offer = await one("select * from task_offers where task_id = $1", [tasks[0].id]);
check("the offer exists and the member is told", !!offer && (await one("select count(*)::int n from notifications where user_id = $1 and title like 'Task offered%'", [P.d2])).n === 1);
check("someone else cannot answer it", (await fails(P.d1, "select task_offer_respond($1, 'accept')", [offer.id])) !== null);
await as(P.d2, "select task_offer_respond($1, 'cant')", [offer.id]);
const next = await one("select user_id from task_offers where task_id = $1 and status = 'offered'", [tasks[0].id]);
check("Can't do → offered to the next best person at once", !!next && next.user_id !== P.d2, next);
// Re-offer after 24 h without an answer.
await q("update autopilot_settings set levels = levels || '{\"re_offers\":\"auto\"}'");
await tick("2026-11-03T05:00:00Z");
const third = await q("select user_id, status from task_offers where task_id = $1 order by offered_at", [tasks[0].id]);
check("no answer in 24 h → expired and offered to the next person", third.length === 3 && third[1].status === "expired" && third[2].status === "offered", third);
const doer = third[2].user_id;
await as(doer, "select task_offer_respond($1, 'accept')", [(await one("select id from task_offers where task_id = $1 and status = 'offered'", [tasks[0].id])).id]);
check("accepted: assigned, mission Active", (await one("select status, assignee_id from mission_tasks where id = $1", [tasks[0].id])).assignee_id === doer
  && (await one("select status from missions where id = $1", [mission.id])).status === "active");

console.log("\nload cap, busy dates and exam periods");
await q("insert into availability (user_id, starts_on, ends_on) values ($1, '2026-11-01', '2026-11-30')", [P.d1]);
check("a busy member is not picked", (await one("select ap_best_person($1) u", [tasks[1].id])).u !== P.d1);
await q("delete from availability where user_id = $1", [P.d1]);
check("load cap 2 is a Control number", Number((await one("select ap_num('load_cap') n")).n) === 2);

console.log("\nproof, peer review, contribution");
check("submit without proof is refused", (await fails(doer, "select task_submit($1, '', null)", [tasks[0].id])) !== null);
await as(doer, "select task_submit($1, 'Caption: Build Night is back', null)", [tasks[0].id]);
const review = await one("select * from task_reviews where task_id = $1 and status = 'pending'", [tasks[0].id]);
check("a peer reviewer was picked, never the doer", !!review && review.reviewer_id !== doer && review.kind === "peer");
check("the doer cannot review it", (await fails(doer, "select task_review_decide($1, true, null)", [review.id])) !== null);
check("asking for changes needs a note", (await fails(review.reviewer_id, "select task_review_decide($1, false, '')", [review.id])) !== null);
await as(review.reviewer_id, "select task_review_decide($1, false, 'Shorter please')", [review.id]);
check("changes needed → back to the doer", (await one("select status from mission_tasks where id = $1", [tasks[0].id])).status === "changes");
await as(doer, "select task_submit($1, 'Caption: Build Night is back, Friday 6 pm', null)", [tasks[0].id]);
const review2 = await one("select * from task_reviews where task_id = $1 and status = 'pending'", [tasks[0].id]);
await as(review2.reviewer_id, "select task_review_decide($1, true, null)", [review2.id]);
const contrib = await one("select * from contributions where task_id = $1", [tasks[0].id]);
check("approved → a contribution for the doer, with the reviewer", !!contrib && contrib.user_id === doer && contrib.reviewer_id === review2.reviewer_id);
check("a member cannot write contributions themselves", (await fails(doer, "insert into contributions (user_id, title, contributed_on) values ($1, 'x', current_date)", [doer])) !== null);
check("the next task unlocked", (await one("select status from mission_tasks where id = $1", [tasks[1].id])).status === "open");

console.log("\nreminders and escalations (mocked time)");
await q("update autopilot_settings set levels = levels || '{\"reminders\":\"auto\",\"escalations\":\"auto\"}'");
const visual = tasks[1];
await q("update mission_tasks set assignee_id = $2, status = 'accepted' where id = $1", [visual.id, P.d1]);
const dueMinus2 = new Date(visual.due_on.getTime() - 2 * 864e5 + 5 * 36e5).toISOString();
await tick(dueMinus2);
check("reminder 2 days before", (await one("select count(*)::int n from notifications where user_id = $1 and title like 'Due in 2 days%'", [P.d1])).n === 1);
await tick(new Date(visual.due_on.getTime() + 5 * 36e5).toISOString());
check("reminder on the due day", (await one("select count(*)::int n from notifications where user_id = $1 and title like 'Due today%'", [P.d1])).n === 1);
await tick(new Date(visual.due_on.getTime() + 1 * 864e5 + 5 * 36e5).toISOString());
check("1 day late → the lead is told", (await one("select count(*)::int n from notifications where user_id = $1 and title like 'Late:%'", [P.lead])).n >= 1);
await tick(new Date(visual.due_on.getTime() + 5 * 864e5 + 5 * 36e5).toISOString());
check("5 days late → a line in Command Center", (await one("select count(*)::int n from autopilot_queue where kind = 'red_task' and payload->>'task_id' = $1", [visual.id])).n === 1);
check("the mission shows red", (await one("select ap_mission_health($1) h", [mission.id])).h === "red");

console.log("\nchange plan: preview, apply, restore");
const preview = (await as(P.lead, "select ap_plan_preview($1, '{\"variation_key\":\"reel\"}') p", [mission.id]))[0].p;
check("preview: switching to Reel adds the reel task and removes the visual", preview.added.some((a) => a.title.includes("reel")) && preview.removed.some((x) => x.title.includes("visual")), preview);
check("preview keeps finished work", !preview.removed.some((x) => x.title.includes("caption")));
check("an outsider cannot change it", (await fails(P.out, "select ap_plan_apply($1, '{\"variation_key\":\"reel\"}', 'x', false)", [mission.id])) !== null);
check("…nor pretend to be the system", (await fails(P.out, "select ap_plan_apply($1, '{\"variation_key\":\"reel\"}', 'x', true)", [mission.id])) !== null);
await as(P.lead, "select ap_plan_apply($1, '{\"variation_key\":\"reel\"}', 'Reels do better', false)", [mission.id]);
const afterApply = await q("select playbook_task_key k, status from mission_tasks where mission_id = $1 order by sort", [mission.id]);
check("applied: reel added, visual cancelled, caption still approved", afterApply.some((t) => t.k === "reel" && t.status !== "cancelled") && afterApply.find((t) => t.k === "visual").status === "cancelled" && afterApply.find((t) => t.k === "topic").status === "approved", afterApply);
check("version history has the reason", (await one("select reason from mission_versions where mission_id = $1 order by version desc limit 1", [mission.id])).reason === "Reels do better");
await as(P.lead, "select ap_plan_restore($1, 1, false)", [mission.id]);
const afterRestore = await q("select playbook_task_key k, status from mission_tasks where mission_id = $1 order by sort", [mission.id]);
check("restore: visual back, reel removed, caption still approved", afterRestore.find((t) => t.k === "visual").status !== "cancelled" && afterRestore.find((t) => t.k === "reel").status === "cancelled" && afterRestore.find((t) => t.k === "topic").status === "approved", afterRestore);
const moved = (await as(P.lead, "select ap_plan_preview($1, jsonb_build_object('mission_date', ($2::date + 7)::text)) p", [mission.id, mission.mission_date]))[0].p;
check("moving the date shows the tasks that shift", moved.moved.length >= 1, moved);

console.log("\nexam periods");
const ws = await one("select id from playbooks where slug = 'monthly-workshop'");
const wm = (await as(P.hoe, "select ap_start_mission($1, 'online-short', '2026-12-12', null, null, null, '{event-crew,design-branding}', null) id", [ws.id]))[0].id;
await q("insert into club_exam_periods (name, starts_on, ends_on) values ('End-sems', '2026-12-01', '2026-12-20')");
await q("update autopilot_settings set levels = levels || '{\"exam_shifts\":\"auto\"}'");
await tick("2026-11-20T04:00:00Z");
check("a workshop in club exams moves to after them", (await one("select mission_date::text d from missions where id = $1", [wm])).d === "2026-12-21");
check("…with a Change-plan entry", (await one("select reason from mission_versions where mission_id = $1 order by version desc limit 1", [wm])).reason.startsWith("Club exams"));
check("exam-safe weekly posts are still prepared during exams", (await one("select ap_in_exams('2026-12-04') e")).e === true);

console.log("\ncontrol");
await as(P.boss, "select ap_settings_update('{\"master\":\"paused\"}')");
const before = (await one("select count(*)::int n from automation_log")).n;
check("paused: the run does nothing", (await tick("2026-11-21T04:00:00Z")).r.paused === true && (await one("select count(*)::int n from automation_log")).n === before);
await as(P.boss, "select ap_settings_update('{\"master\":\"on\"}')");
check("only the super admin can change Control", (await fails(P.hoe, "select ap_settings_update('{\"master\":\"paused\"}')")) !== null);
check("Control changes are audit-logged", (await one("select count(*)::int n from audit_logs where action = 'autopilot.control'")).n >= 2);
await q("insert into user_roles (user_id, role) values ($1, 'admin')", [P.lead]);
check("an admin may switch only their own exam mode", (await fails(P.lead, "select ap_settings_update(jsonb_build_object('founder_exam_mode', jsonb_build_array($1::text)))", [P.lead])) === null
  && (await fails(P.lead, "select ap_settings_update(jsonb_build_object('founder_exam_mode', jsonb_build_array($1::text, $2::text)))", [P.lead, P.boss])) !== null);
await q("select ap_notify($1, 'x', null, null)", [P.lead]);
check("founder exam mode: no notifications except the weekly email", (await one("select count(*)::int n from notifications where user_id = $1 and title = 'x'", [P.lead])).n === 0);
await as(P.lead, "select ap_settings_update(jsonb_build_object('founder_exam_mode', '[]'::jsonb))");
const dry = (await as(P.hoe, "select ap_dry_run(7) d"))[0].d;
const logAfterDry = (await one("select count(*)::int n from automation_log")).n;
check("Dry run lists the next 7 days and changes nothing", Array.isArray(dry) && dry.length > 0 && logAfterDry === (await one("select count(*)::int n from automation_log")).n, dry.length);
const undoable = await one("select id from automation_log where undo->>'type' = 'restore_plan' and undone_at is null order by at desc limit 1");
check("Undo restores the plan before a change", (await as(P.hoe, "select ap_undo($1) m", [undoable.id]))[0].m === "Undone.");
check("the permissions matrix can only be changed by the super admin", (await fails(P.hoe, "select ap_permissions_update('plans.change', '{admin}')")) !== null);
check("a member cannot see a mission they are not in", (await as(P.out, "select count(*)::int n from missions"))[0].n === 0);
check("a member sees the mission they work on", (await as(doer, "select count(*)::int n from missions where id = $1", [mission.id]))[0].n === 1);
check("anon cannot run the engine", (await fails(P.out, "select autopilot_tick(now())")) !== null);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
await db.end();
process.exit(failed.length ? 1 : 0);
