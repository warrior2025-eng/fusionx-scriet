// Leave a project team (migration 0048) against the LOCAL test Postgres only.
//   node tests/autopilot/leave.mjs      (every migration applied)
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
const P = { owner: await person("l-owner", "Anuj Owner"), m: await person("l-m", "Mira Member"), other: await person("l-other", "Om Other") };
const idea = (await one("insert into idea_drafts (kind, title, pitch, data, level, learn, score, batch_date, status, published_at) values ('project', 'Leave Test Idea', 'p', '{}', 1, 'x', 8, current_date - 30, 'published', now()) returning id")).id;
const pid = (await as(P.owner, "select ap_idea_accept($1, 'lite') id", [idea]))[0].id;
await as(P.m, "select ap_join_project($1)", [pid]);
const task = (await one("insert into project_tasks (project_id, title, assignee_id) values ($1, 'Make the map', $2) returning id", [pid, P.m])).id;
const doneTask = (await one("insert into project_tasks (project_id, title, assignee_id, done_at) values ($1, 'Done one', $2, now()) returning id", [pid, P.m])).id;

console.log("\nleave a project team");
check("the member is in the team", (await one("select count(*)::int n from project_members where project_id = $1 and user_id = $2", [pid, P.m])).n === 1);
check("the owner cannot leave their own project", /cannot leave/.test(await fails(() => as(P.owner, "select ap_leave_project($1)", [pid])) ?? ""));
check("someone not in the team cannot leave it", /not in this team/.test(await fails(() => as(P.other, "select ap_leave_project($1)", [pid])) ?? ""));
check("visitors cannot call it", (await fails(() => anon("select ap_leave_project($1)", [pid]))) !== null);
const msg = (await as(P.m, "select ap_leave_project($1) m", [pid]))[0].m;
check("the member leaves", msg === "You left the team." && (await one("select count(*)::int n from project_members where project_id = $1 and user_id = $2", [pid, P.m])).n === 0);
check("their open task is unassigned; a finished one keeps its name", (await one("select assignee_id from project_tasks where id = $1", [task])).assignee_id === null
  && (await one("select assignee_id from project_tasks where id = $1", [doneTask])).assignee_id === P.m);
check("the owner is told", (await one("select count(*)::int n from notifications where user_id = $1 and title like 'Mira Member left%'", [P.owner])).n === 1);
check("the activity log says so", (await one("select count(*)::int n from project_activity where project_id = $1 and text like '%left the team%'", [pid])).n >= 1);
await as(P.m, "select ap_join_project($1)", [pid]);
check("they can join again later", (await one("select count(*)::int n from project_members where project_id = $1 and user_id = $2", [pid, P.m])).n === 1);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
await db.end();
process.exit(failed ? 1 : 0);
