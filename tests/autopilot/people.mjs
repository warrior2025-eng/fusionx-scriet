// Autopilot PR 2 checks (people) against the LOCAL test Postgres only: fake people, mocked time.
//   node tests/autopilot/people.mjs      (after engine.mjs or on its own, migrations 0042 + 0043 applied)
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
const tick = async (at) => { clock = at; return (await one("select autopilot_tick($1::timestamptz) r", [at])).r; };
const later = (days) => new Date(Date.now() + days * 864e5).toISOString();

const person = async (key, name, skills = []) => {
  const id = (await one("insert into auth.users (email) values ($1) returning id", [`${key}-${Date.now()}@example.com`])).id;
  await q("insert into profiles (id, full_name, skills) values ($1, $2, $3) on conflict (id) do update set full_name = $2, skills = $3", [id, name, skills]);
  return id;
};
const P = {
  admin: await person("p-admin", "People Admin"), lead: await person("p-lead", "Projects Lead", ["programming"]),
  m1: await person("p-m1", "Hub Member", ["programming"]), comm: await person("p-comm", "Community Kid", ["design"]),
  comm2: await person("p-comm2", "Second Community"), outsider: await person("p-out", "Total Outsider"),
};
await q("insert into user_roles (user_id, role) values ($1, 'admin')", [P.admin]);
const proj = (await one("select id from core_groups where slug = 'projects-research-startups'")).id;
const design = (await one("select id from core_groups where slug = 'design-branding'")).id;
await q("insert into core_group_members (group_id, user_id, title, is_lead) values ($1, $2, 'Lead', true)", [proj, P.lead]);
await q("insert into core_group_members (group_id, user_id) values ($1, $2)", [proj, P.m1]);
await q("update autopilot_settings set master = 'on', levels = '{}'::jsonb, pauses = '{}'::jsonb");

// A hackathon mission with open-seat tasks.
const pb = (await one("select id from playbooks where slug = 'hackathon-entry'")).id;
const missionId = (await as(P.admin, "select ap_start_mission($1, 'open-seat', (current_date + 30), 'Smoke Hack', null, $2, '{projects-research-startups,design-branding,competitions-opportunities}', 'public') id", [pb, P.lead]))[0].id;
await q("update mission_tasks set status = 'open' where mission_id = $1 and playbook_task_key = 'deck'", [missionId]);
const deck = await one("select id, title from mission_tasks where mission_id = $1 and playbook_task_key = 'deck'", [missionId]);

console.log("\nopen seats");
check("a member cannot open a seat", (await fails(P.m1, "select ap_open_seat($1, 'design', null)", [deck.id])) !== null);
const seat = (await as(P.lead, "select ap_open_seat($1, 'design', 'Pitch deck, 8 slides') id", [deck.id]))[0].id;
check("the lead opens a seat on an open-seat task", !!seat);
check("first 48 h: website members see it", (await as(P.comm, "select count(*)::int n from ap_visible_seats()"))[0].n === 1);
await q("update profiles set membership_type = 'alumni' where id = $1", [P.outsider]);
check("…others signed in do not yet", (await as(P.outsider, "select count(*)::int n from ap_visible_seats()"))[0].n === 0);
clock = later(3);
check("after the head start everyone signed in sees it", (await as(P.outsider, "select count(*)::int n from ap_visible_seats()"))[0].n === 1);
check("applying needs 2–3 lines", (await fails(P.comm, "select ap_seat_apply($1, 'hi', null)", [seat])) !== null);
await as(P.comm, "select ap_seat_apply($1, 'I design posters for my college fest and can do this deck in two days.', 'https://behance.net/example')", [seat]);
const app = await one("select id from seat_applications where seat_id = $1", [seat]);
check("Today has the application for the owner/lead", (await one("select count(*)::int n from autopilot_queue where kind = 'seat_application' and status = 'pending'")).n === 1);
check("an outsider cannot accept it", (await fails(P.outsider, "select ap_seat_decide($1, true)", [app.id])) !== null);
await as(P.lead, "select ap_seat_decide($1, true)", [app.id]);
check("accepted: the guest has the task", (await one("select assignee_id, status from mission_tasks where id = $1", [deck.id])).assignee_id === P.comm);
check("the guest sees only that mission", (await as(P.comm, "select count(*)::int n from missions"))[0].n === 1);
check("…and only their own task in it", (await as(P.comm, "select count(*)::int n from mission_tasks where mission_id = $1", [missionId]))[0].n === 1);
check("guests never see mission versions", (await as(P.comm, "select count(*)::int n from mission_versions"))[0].n === 0);
await as(P.comm, "select task_submit($1, null, 'https://figma.com/deck')", [deck.id]);
const rv = await one("select id, reviewer_id from task_reviews where task_id = $1 and status = 'pending'", [deck.id]);
await as(rv.reviewer_id, "select task_review_decide($1, true, null)", [rv.id]);
check("verified guest work enters the contribution record", (await one("select count(*)::int n from contributions where user_id = $1", [P.comm])).n === 1);
await as(P.lead, "select ap_mission_set($1, 'done', null, '{https://devfolio.co/x}')", [missionId]);
await tick(later(3));
const g = await one("select access_until from mission_guests where user_id = $1", [P.comm]);
check("mission done → guest access ends 7 days later", g.access_until !== null);
clock = later(20);
check("…after which the mission is gone for them", (await as(P.comm, "select count(*)::int n from missions where id = $1", [missionId]))[0].n === 0);
check("…their verified contribution stays", (await one("select count(*)::int n from contributions where user_id = $1", [P.comm])).n === 1);

console.log("\ncommunity tasks");
const post = (await one("select id from playbooks where slug = 'weekly-social-post'")).id;
clock = new Date().toISOString();
const m2 = (await as(P.admin, "select ap_start_mission($1, 'single', (current_date + 10), 'Community post', null, null, '{design-branding}', null) id", [post]))[0].id;
const ct = await one("select id from mission_tasks where mission_id = $1 and community_allowed and status = 'open' limit 1", [m2]);
check("community members see open community tasks", (await as(P.comm2, "select count(*)::int n from mission_tasks where community_allowed and status = 'open'"))[0].n >= 1);
check("…but not the hub's other tasks", (await as(P.comm2, "select count(*)::int n from mission_tasks where mission_id = $1 and not community_allowed", [m2]))[0].n === 0);
await as(P.comm2, "select ap_take_community_task($1)", [ct.id]);
check("taking one assigns it", (await one("select assignee_id from mission_tasks where id = $1", [ct.id])).assignee_id === P.comm2);
const ct2 = await q("select id from mission_tasks where community_allowed and status = 'open' and assignee_id is null limit 1");
check("limit: one open community task per person", ct2.length === 0 || (await fails(P.comm2, "select ap_take_community_task($1)", [ct2[0].id])) !== null);
await q("update community_settings set community_on = false");
check("Control: community off → no taking", ct2.length === 0 || (await fails(P.outsider, "select ap_take_community_task($1)", [ct2[0].id])) !== null);
await q("update community_settings set community_on = true");

console.log("\npitches");
const pid = (await as(P.comm2, "select ap_pitch_submit('Campus lost-and-found app', 'Students lose ID cards every week; a simple board with photos and QR codes would return them faster.', 'projects-research-startups', '[{\"key\":\"small\",\"name\":\"Small\",\"description\":\"A shared sheet and a poster\"},{\"key\":\"full\",\"name\":\"Full\",\"description\":\"A web app with photos\"}]') id"))[0].id;
check("own pitch: no self-vote", (await fails(P.comm2, "select ap_pitch_vote($1, 'full')", [pid])) !== null);
await as(P.m1, "select ap_pitch_vote($1, 'full')", [pid]);
await as(P.comm, "select ap_pitch_vote($1, 'full')", [pid]);
await as(P.comm, "select ap_pitch_vote($1, 'small')", [pid]);
check("one vote per person (changing it keeps one)", (await one("select count(*)::int n from pitch_votes where pitch_id = $1", [pid])).n === 2);
await tick(later(6));
check("voting ends → a line in Today", (await one("select count(*)::int n from autopilot_queue where kind = 'pitch' and payload->>'pitch_id' = $1", [pid])).n === 1);
const flagship = (await one("select id from playbooks where slug = 'flagship-project-sprint'")).id;
clock = new Date().toISOString();
const pm = (await as(P.lead, "select ap_pitch_approve($1, $2, 'lite', current_date + 40, '{projects-research-startups}') id", [pid, flagship]))[0].id;
check("a lead approves it as a mission: \"Pitched by <name>\"", (await one("select goal from missions where id = $1", [pm])).goal.includes("Pitched by Second Community"));

console.log("\nRising Talent");
// Three verified contributions for a community member, clean reviews.
for (let i = 0; i < 2; i++) {
  await q("insert into contributions (user_id, title, contributed_on) values ($1, $2, current_date)", [P.comm, `Extra verified work ${i}`]);
}
await tick(later(7));
check("suggested after 3 verified contributions (never access by itself)", (await one("select count(*)::int n from talent_suggestions where user_id = $1 and status = 'pending'", [P.comm])).n === 1
  && (await one("select count(*)::int n from collaborators where user_id = $1", [P.comm])).n === 0);
check("members never see suggestions", (await as(P.comm, "select count(*)::int n from talent_suggestions"))[0].n === 0);
check("a lead cannot approve Rising Talent (admins only)", (await fails(P.lead, "select ap_talent_decide($1, 'approve', array[$2]::uuid[], null, null)", [P.comm, pm])) !== null);
clock = new Date().toISOString();
await as(P.admin, "select ap_talent_decide($1, 'approve', array[$2]::uuid[], $3, (current_date + 56))", [P.comm, pm, design]);
check("approved: Core Collaborator for the chosen mission", (await as(P.comm, "select count(*)::int n from mission_tasks where mission_id = $1", [pm]))[0].n > 1);
check("in the Core team as \"Collaborator\", no lead rights", (await one("select title, is_lead from core_group_members where user_id = $1 and group_id = $2", [P.comm, design])).title === "Collaborator");
check("they sit in the assignment pool for that mission", (await one("select count(*)::int n from collaborators where user_id = $1 and $2 = any(mission_ids)", [P.comm, pm])).n === 1);
check("the decision is audit-logged", (await one("select count(*)::int n from audit_logs where action = 'autopilot.talent.approve'")).n === 1);
await q("update collaborators set ends_on = current_date + 2 where user_id = $1", [P.comm]);
await tick(new Date().toISOString());
check("near the end date: Extend / End / Shortlist in Today", (await one("select count(*)::int n from autopilot_queue where kind = 'collab_end' and status = 'pending'")).n === 1);
await q("update collaborators set ends_on = current_date - 1 where user_id = $1", [P.comm]);
await tick(new Date().toISOString());
check("no decision → access ends automatically", (await one("select status from collaborators where user_id = $1", [P.comm])).status === "ended"
  && (await one("select count(*)::int n from core_group_members where user_id = $1 and title = 'Collaborator'", [P.comm])).n === 0);

console.log("\nmember projects");
const prj = (await one("insert into projects (title, slug, description, owner_id) values ('Smoke Tracker', 'smoke-tracker-' || floor(random()*1e6), 'A test project', $1) returning id", [P.m1])).id;
await q("insert into project_members (project_id, user_id) values ($1, $2)", [prj, P.lead]);
const preview = (await as(P.m1, "select ap_project_set_plan($1, 'lite', current_date + 30, false) p", [prj]))[0].p;
check("plan preview lists the milestones it adds", preview.added.length >= 5, preview.added.length);
check("someone else cannot plan it", (await fails(P.lead, "select ap_project_set_plan($1, 'lite', current_date + 30, true)", [prj])) !== null);
await as(P.m1, "select ap_project_set_plan($1, 'lite', current_date + 30, true)", [prj]);
const ms = await q("select id, title from project_milestones where project_id = $1 order by due_on", [prj]);
check("plan applied: milestones with dates", ms.length >= 5);
await as(P.m1, "select ap_project_task($1, 'add', null, 'Wireframes', $2, $3, current_date + 5)", [prj, ms[0].id, P.lead]);
check("tasks go to project team members only", (await fails(P.m1, "select ap_project_task($1, 'add', null, 'x', null, $2, null)", [prj, P.outsider])) !== null);
check("a milestone needs a proof link", (await fails(P.m1, "select ap_project_milestone($1, 'done', $2, null, null, '')", [prj, ms[0].id])) !== null);
await as(P.m1, "select ap_project_milestone($1, 'done', $2, null, null, 'https://github.com/x/y')", [prj, ms[0].id]);
check("first milestone done → status building", (await one("select status from projects where id = $1", [prj])).status === "building");
const moved = (await as(P.m1, "select ap_project_set_plan($1, 'standard', current_date + 60, false) p", [prj]))[0].p;
check("Change plan on a project previews moves and keeps done work", moved.kept.length === 1 && moved.moved.length >= 1, { kept: moved.kept.length, moved: moved.moved.length });
check("personal project work is not counted", (await one("select count(*)::int n from contributions where user_id = $1", [P.lead])).n === 0);
await as(P.m1, "select ap_project_support_request($1, 'We want users from other colleges')", [prj]);
const req = await one("select id from project_support_requests where project_id = $1", [prj]);
check("a member cannot approve support", (await fails(P.comm2, "select ap_project_support_decide($1, true, true)", [req.id])) !== null);
await as(P.lead, "select ap_project_support_decide($1, true, true)", [req.id]);
const pr = await one("select mission_id from projects where id = $1", [prj]);
check("support approved → linked to a mission with its open tasks", !!pr.mission_id && (await one("select count(*)::int n from mission_tasks where mission_id = $1", [pr.mission_id])).n === 1);
const mt = await one("select id from mission_tasks where mission_id = $1", [pr.mission_id]);
await as(P.lead, "select task_submit($1, null, 'https://figma.com/wire')", [mt.id]);
const rv2 = await one("select id, reviewer_id from task_reviews where task_id = $1 and status = 'pending'", [mt.id]);
await as(rv2.reviewer_id, "select task_review_decide($1, true, null)", [rv2.id]);
check("supported work is reviewed and counts", (await one("select count(*)::int n from contributions where user_id = $1 and counts", [P.lead])).n === 1);
check("…and the project task follows it", (await one("select done_at is not null d from project_tasks where mission_task_id = $1", [mt.id])).d === true);
check("the recruitment box: admins read contributions", (await as(P.admin, "select count(*)::int n from ap_applicant_contributions($1)", [P.lead]))[0].n === 1);
check("…members do not", (await as(P.m1, "select count(*)::int n from ap_applicant_contributions($1)", [P.lead]))[0].n === 0);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
await db.end();
process.exit(failed.length ? 1 : 0);
