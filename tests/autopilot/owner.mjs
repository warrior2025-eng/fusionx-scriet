// Owner team controls (migration 0049): join requests need the owner's Accept; stop/allow joins; remove a member.
// LOCAL test Postgres only:   node tests/autopilot/owner.mjs      (every migration applied)
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
const P = { owner: await person("o-owner", "Anuj Owner"), a: await person("o-a", "Asha Asker"), b: await person("o-b", "Bilal Asker"), x: await person("o-x", "Xena Outsider") };
const idea = (await one("insert into idea_drafts (kind, title, pitch, data, level, learn, score, batch_date, status, published_at) values ('project', 'Owner Test Idea', 'p', '{}', 1, 'x', 8, current_date - 40, 'published', now()) returning id")).id;
const pid = (await as(P.owner, "select ap_idea_accept($1, 'lite') id", [idea]))[0].id;
const inTeam = async (u) => (await one("select count(*)::int n from project_members where project_id = $1 and user_id = $2", [pid, u])).n === 1;

console.log("\njoining needs the owner's Accept");
const m1 = (await as(P.a, "select ap_join_project($1) m", [pid]))[0].m;
check("Ask to join sends a request, not a join", /Request sent/.test(m1) && !(await inTeam(P.a)), m1);
check("the owner is told", (await one("select count(*)::int n from notifications where user_id = $1 and title like 'Asha Asker wants to join%'", [P.owner])).n === 1);
check("asking twice says it is waiting", /waiting for the owner/.test((await as(P.a, "select ap_join_project($1) m", [pid]))[0].m));
check("the request is visible to the asker and the owner, not to others", (await as(P.a, "select count(*)::int n from project_join_requests where project_id = $1", [pid]))[0].n === 1
  && (await as(P.owner, "select count(*)::int n from project_join_requests where project_id = $1", [pid]))[0].n === 1
  && (await as(P.x, "select count(*)::int n from project_join_requests where project_id = $1", [pid]))[0].n === 0
  && (await anon("select count(*)::int n from project_join_requests"))[0].n === 0);
check("only the owner can accept", /Only the project owner/.test(await fails(() => as(P.x, "select ap_project_join_decide($1, $2, true)", [pid, P.a])) ?? "")
  && /Only the project owner/.test(await fails(() => as(P.a, "select ap_project_join_decide($1, $2, true)", [pid, P.a])) ?? ""));
await as(P.owner, "select ap_project_join_decide($1, $2, true)", [pid, P.a]);
check("the owner accepts → in the team, and told", await inTeam(P.a) && (await one("select count(*)::int n from notifications where user_id = $1 and title like 'You are in the team%'", [P.a])).n === 1);
await as(P.b, "select ap_join_project($1)", [pid]);
await as(P.owner, "select ap_project_join_decide($1, $2, false)", [pid, P.b]);
check("the owner declines → not in the team, and told", !(await inTeam(P.b)) && (await one("select count(*)::int n from notifications where user_id = $1 and title like '%was declined%'", [P.b])).n === 1);
await as(P.b, "select ap_join_project($1)", [pid]);
await as(P.b, "select ap_project_join_cancel($1)", [pid]);
check("the asker can cancel a waiting request", (await one("select status from project_join_requests where project_id = $1 and user_id = $2", [pid, P.b])).status === "cancelled");
check("direct writes are refused", (await fails(() => as(P.x, "insert into project_join_requests (project_id, user_id, status) values ($1, $2, 'accepted')", [pid, P.x]))) !== null);

console.log("\nstop new joins, remove a member");
check("only the owner can stop joins", /Only the project owner/.test(await fails(() => as(P.a, "select ap_project_joins($1, true)", [pid])) ?? ""));
await as(P.owner, "select ap_project_joins($1, true)", [pid]);
check("joins stopped → asking is refused", /stopped taking new members/.test(await fails(() => as(P.x, "select ap_join_project($1)", [pid])) ?? ""));
await as(P.owner, "select ap_project_joins($1, false)", [pid]);
check("joins allowed again → asking works", /Request sent/.test((await as(P.x, "select ap_join_project($1) m", [pid]))[0].m));
const task = (await one("insert into project_tasks (project_id, title, assignee_id) values ($1, 'Design the map', $2) returning id", [pid, P.a])).id;
check("a member cannot remove another", /Only the project owner/.test(await fails(() => as(P.x, "select ap_project_remove_member($1, $2, null)", [pid, P.a])) ?? ""));
check("the owner cannot be removed", /cannot be removed/.test(await fails(() => as(P.owner, "select ap_project_remove_member($1, $2, null)", [pid, P.owner])) ?? ""));
await as(P.owner, "select ap_project_remove_member($1, $2, 'We need weekly calls')", [pid, P.a]);
check("the owner removes a member → out of the team, open task unassigned", !(await inTeam(P.a)) && (await one("select assignee_id from project_tasks where id = $1", [task])).assignee_id === null);
check("the removed member is told, with the note", (await one("select body from notifications where user_id = $1 and title like 'You were removed from%' order by created_at desc limit 1", [P.a])).body === "We need weekly calls");
check("visitors cannot call these", (await fails(() => anon("select ap_project_joins($1, true)", [pid]))) !== null && (await fails(() => anon("select ap_join_project($1)", [pid]))) !== null);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
await db.end();
process.exit(failed ? 1 : 0);
