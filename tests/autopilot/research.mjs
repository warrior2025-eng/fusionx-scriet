// Research topics start without a mentor (migration 0050), against the LOCAL test Postgres only.
//   node tests/autopilot/research.mjs      (every migration applied)
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
const P = { r: await person("r-r", "Riya Researcher"), t: await person("r-t", "Tara Teammate") };
const topic = async (title) => (await one("insert into idea_drafts (kind, title, pitch, data, status, published_at, batch_date) values ('research', $1, 'Does greenery cut PM2.5?', '{\"question\":\"Q\",\"method\":\"Survey\",\"tools\":\"Python, Excel\"}', 'published', now(), current_date - 50) returning id", [title])).id;

console.log("\nresearch starts without a mentor");
const t1 = await topic("Research Air Quality");
const pid = (await as(P.r, "select ap_idea_accept($1, 'paper') id", [t1]))[0].id;
const p = await one("select owner_id, is_published, status, idea_id, domain, tracked, target_date - current_date as days, technologies from projects where id = $1", [pid]);
check("Accept and start → a published project of the member at once (no mentor, no waiting mission)", p.owner_id === P.r && p.is_published && p.status === "building" && p.idea_id === t1 && p.domain === "Research", p);
check("…tracked, with a 12-week target", p.tracked && p.days === 84 && p.technologies.includes("Python"), p);
const ms = await q("select title, due_on - current_date as days from project_milestones where project_id = $1 order by sort", [pid]);
check("…and 5 fixed, dated research steps (weeks 2, 3, 8, 10, 12)", ms.length === 5 && ms.map((m) => m.days).join(",") === "14,21,56,70,84", ms);
check("no mission is created for it", (await one("select count(*)::int n from missions where title = 'Research Air Quality'")).n === 0);
const t2 = await topic("Research Patent Idea");
const pid2 = (await as(P.r, "select ap_idea_accept($1, 'patent') id", [t2]))[0].id;
check("\"Idea to patent\" → its own 4 dated steps", (await q("select due_on - current_date as days from project_milestones where project_id = $1 order by sort", [pid2])).map((m) => m.days).join(",") === "14,35,63,84");
const t3 = await topic("Research Third");
check("the active-project limit still applies", /already track/.test(await fails(() => as(P.r, "select ap_idea_accept($1, 'paper')", [t3])) ?? ""));
await as(P.t, "select ap_join_project($1)", [pid]);
await as(P.r, "select ap_project_join_decide($1, $2, true)", [pid, P.t]);
check("a teammate can ask to join and the owner accepts", (await one("select count(*)::int n from project_members where project_id = $1 and user_id = $2", [pid, P.t])).n === 1);
check("project ideas still work as before (4-week Flagship plan)", await (async () => {
  const idea = (await one("insert into idea_drafts (kind, title, pitch, data, level, learn, score, status, published_at, batch_date) values ('project', 'Research Test Project', 'p', '{\"stack\":\"Next.js\"}', 1, 'x', 8, 'published', now(), current_date - 50) returning id")).id;
  const x = (await as(P.t, "select ap_idea_accept($1, 'lite') id", [idea]))[0].id;
  return (await one("select target_date - current_date as d from projects where id = $1", [x])).d === 28;
})());

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
await db.end();
process.exit(failed ? 1 : 0);
