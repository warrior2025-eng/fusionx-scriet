// Cancel a started idea in its first 4 days (migration 0051), against the LOCAL test Postgres only.
//   node tests/autopilot/cancel.mjs      (every migration applied)
import { createRequire } from "node:module";
import path from "node:path";
const pg = createRequire(path.join(process.env.FX_PG ?? process.cwd(), "noop.js"))("pg");
const db = new pg.Client({ host: "127.0.0.1", port: 5433, user: "postgres", database: "postgres" });
await db.connect();

const results = [];
const check = (name, ok, info) => { results.push({ name, ok }); console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok || info === undefined ? "" : "  " + JSON.stringify(info)}`); };
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const as = async (uid, sql, params = []) => {
  await db.query("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('role', 'authenticated', true)`, [uid]);
    const rows = (await db.query(sql, params)).rows;
    await db.query("commit");
    return rows;
  } catch (e) { await db.query("rollback"); throw e; }
};
const fails = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const person = async (key, name) => {
  const id = (await one("insert into auth.users (email) values ($1) returning id", [`${key}-${Date.now()}-${Math.random()}@example.com`])).id;
  await q("insert into profiles (id, full_name) values ($1, $2) on conflict (id) do update set full_name = $2", [id, name]);
  return id;
};
const P = { o: await person("c-o", "Ovi Owner"), m: await person("c-m", "Mona Member"), x: await person("c-x", "Xavi Other"), admin: await person("c-a", "Ada Admin") };
await q("insert into user_roles (user_id, role) values ($1, 'admin')", [P.admin]);
const idea = (await one("insert into idea_drafts (kind, title, pitch, data, level, learn, score, status, published_at, batch_date) values ('project', 'Cancel Test Idea', 'p', '{\"stack\":\"Next.js\"}', 1, 'x', 8, 'published', now(), current_date - 50) returning id")).id;

console.log("\ncancel in the first 4 days");
const pid = (await as(P.o, "select ap_idea_accept($1, 'lite') id", [idea]))[0].id;
await as(P.m, "select ap_join_project($1)", [pid]);
await as(P.o, "select ap_project_join_decide($1, $2, true)", [pid, P.m]);
await as(P.x, "select ap_join_project($1)", [pid]); // waiting request
check("someone else cannot cancel it", /Only the project owner/.test(await fails(() => as(P.m, "select ap_project_cancel($1, null)", [pid])) ?? ""));
const msg = (await as(P.o, "select ap_project_cancel($1, 'Exams') m", [pid]))[0].m;
const p = await one("select deleted_at, is_published, tracked from projects where id = $1", [pid]);
check("the owner cancels → out of Projects, no longer counted as active", /cancelled/.test(msg) && p.deleted_at && !p.is_published && !p.tracked, p);
check("the team member is told (with the reason) and leaves the team", (await one("select body from notifications where user_id = $1 and title like 'Cancel Test Idea was cancelled%'", [P.m])).body === "Exams"
  && (await one("select count(*)::int n from project_members where project_id = $1", [pid])).n === 0);
check("the waiting join request ends", (await one("select status from project_join_requests where project_id = $1 and user_id = $2", [pid, P.x])).status === "cancelled");
check("the idea is still delivered, so it can be started again", (await one("select count(*)::int n from idea_drafts where id = $1 and status = 'published' and deleted_at is null", [idea])).n === 1);
check("…and the owner can start it again (the limit is free again)", Boolean((await as(P.o, "select ap_idea_accept($1, 'lite') id", [idea]))[0].id));

console.log("\nafter 4 days");
const pid2 = (await one("select id from projects where idea_id = $1 and deleted_at is null and owner_id = $2", [idea, P.o])).id;
await q("update projects set created_at = now() - interval '5 days' where id = $1", [pid2]);
check("after 4 days the owner can no longer cancel", /first 4 days/.test(await fails(() => as(P.o, "select ap_project_cancel($1, null)", [pid2])) ?? ""));
check("staff still can", /cancelled/.test((await as(P.admin, "select ap_project_cancel($1, null) m", [pid2]))[0].m));
const plain = (await one("insert into projects (title, slug, description, owner_id, status, is_published) values ('Plain Project', 'plain-project-x', 'd', $1, 'building', true) returning id", [P.o])).id;
check("a project not started from an idea is not cancelled here", /started from an idea/.test(await fails(() => as(P.o, "select ap_project_cancel($1, null)", [plain])) ?? ""));

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
await db.end();
process.exit(failed ? 1 : 0);
