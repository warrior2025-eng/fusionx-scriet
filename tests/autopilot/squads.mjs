// Squad Match checks (migration 0047) against the LOCAL test Postgres only.
//   node tests/autopilot/squads.mjs      (every migration applied)
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

const person = async (key, name, skills = [], dept = null, year = null) => {
  const id = (await one("insert into auth.users (email) values ($1) returning id", [`${key}-${Date.now()}-${Math.random()}@example.com`])).id;
  await q("insert into profiles (id, full_name, skills, department, year) values ($1, $2, $3, $4, $5) on conflict (id) do update set full_name = $2, skills = $3, department = $4, year = $5", [id, name, skills, dept, year]);
  return id;
};
const P = {
  lead: await person("s-lead", "Lata Lead", ["react", "node"], "CSE", "2nd"),
  des: await person("s-des", "Dev Designer", ["figma", "react"], "CSE", "2nd"),
  back: await person("s-back", "Bina Backend", ["node", "sql"], "IT", "3rd"),
  pitch: await person("s-pitch", "Pari Pitch", ["canva"], "ME", "1st"),
  extra: await person("s-extra", "Ekta Extra", ["python"], "CSE", "4th"),
  gone: await person("s-gone", "Gopal Gone"),
};
await q("update profiles set is_active = false where id = $1", [P.gone]);
const opp = (await one("insert into opportunities (title, organizer, category, description, deadline, registration_url, status, is_published, created_by, team_mode) values ('Squad Test Hack', 'IIT Test', 'hackathon', 'Test', current_date + 10, 'https://example.com', 'open', true, $1, 'team') returning id", [P.lead])).id;
const past = (await one("insert into opportunities (title, organizer, category, description, deadline, registration_url, status, is_published, created_by) values ('Squad Past Hack', 'Org', 'hackathon', 'Test', current_date - 1, 'https://example.com', 'open', true, $1) returning id", [P.lead])).id;

console.log("\nstart a squad, pool, privacy");
const sid = (await as(P.lead, "select ap_squad_create($1, 'Byte Busters', 'Free lab slots app', 'Frontend', array['Design (UI/UX)','Backend'], 4) id", [opp]))[0].id;
check("a member starts a squad and is its lead and first member", (await one("select lead_id, status from opp_squads where id = $1", [sid])).lead_id === P.lead
  && (await one("select state, role from opp_squad_members where squad_id = $1 and user_id = $2", [sid, P.lead])).state === "member");
check("a second squad by the same person for the same opportunity is refused", /already in a squad/.test(await fails(() => as(P.lead, "select ap_squad_create($1, 'Again', '', 'Frontend', '{}', 3)", [opp])) ?? ""));
check("no squad for a closed (past-deadline) opportunity", /closed/.test(await fails(() => as(P.des, "select ap_squad_create($1, 'Late', '', 'Frontend', '{}', 3)", [past])) ?? ""));
check("an inactive member cannot take part", /sign in as a member/.test(await fails(() => as(P.gone, "select ap_squad_pool_join($1, 'Backend', '')", [opp])) ?? ""));
await as(P.des, "select ap_squad_pool_join($1, 'Design (UI/UX)', 'Figma + React')", [opp]);
await as(P.back, "select ap_squad_pool_join($1, 'Backend', '')", [opp]);
await as(P.pitch, "select ap_squad_pool_join($1, 'Pitch & business', '')", [opp]);
check("visitors (signed out) see no squads or pool", (await anon("select count(*)::int n from opp_squads"))[0].n === 0 && (await anon("select count(*)::int n from opp_squad_pool"))[0].n === 0);
check("members see the pool", (await as(P.extra, "select count(*)::int n from opp_squad_pool where opportunity_id = $1", [opp]))[0].n === 3);
check("direct writes are refused (only the functions change data)", (await fails(() => as(P.extra, "insert into opp_squad_pool (opportunity_id, user_id, role) values ($1, $2, 'X')", [opp, P.extra]))) !== null
  && (await fails(() => as(P.extra, "update opp_squads set name = 'Hacked' where id = $1", [sid]))) === null && (await one("select name from opp_squads where id = $1", [sid])).name === "Byte Busters");

console.log("\nsmart picks, invite, ask");
const board = (await as(P.lead, "select ap_squad_board($1) b", [opp]))[0].b;
const pickIds = board.picks.map((p) => p.user_id);
check("smart picks fill the open slots with pool members of that role", pickIds.includes(P.des) && pickIds.includes(P.back) && !pickIds.includes(P.pitch), board.picks);
check("the best pick shares skills and department (designer: react + CSE)", board.picks[0].user_id === P.des, board.picks.map((p) => [p.name, p.score]));
check("the board shows names, roles, department, year and skills, never an email", !JSON.stringify(board).includes("@example.com") && board.pool[0].name);
await as(P.lead, "select ap_squad_invite($1, $2, 'Design (UI/UX)')", [sid, P.des]);
check("the invited person gets a notification", (await one("select count(*)::int n from notifications where user_id = $1 and title like '%invited you to the squad Byte Busters%'", [P.des])).n === 1);
check("only the lead can invite", /Only the squad lead/.test(await fails(() => as(P.extra, "select ap_squad_invite($1, $2, 'Backend')", [sid, P.back])) ?? ""));
check("only the invited person can answer an invite", /Only the invited person/.test(await fails(() => as(P.lead, "select ap_squad_respond($1, $2, true)", [sid, P.des])) ?? ""));
check("the invite is hidden from other members", (await as(P.extra, "select count(*)::int n from opp_squad_members where squad_id = $1 and state = 'invited'", [sid]))[0].n === 0
  && (await as(P.des, "select count(*)::int n from opp_squad_members where squad_id = $1 and state = 'invited'", [sid]))[0].n === 1);
await as(P.des, "select ap_squad_respond($1, $2, true)", [sid, P.des]);
check("accepting → member of the squad, out of the pool, the lead is told", (await one("select state from opp_squad_members where squad_id = $1 and user_id = $2", [sid, P.des])).state === "member"
  && (await one("select count(*)::int n from opp_squad_pool where user_id = $1", [P.des])).n === 0
  && (await one("select count(*)::int n from notifications where user_id = $1 and title like 'Dev Designer joined your squad%'", [P.lead])).n === 1);
const b2 = (await as(P.back, "select ap_squad_board($1) b", [opp]))[0].b;
check("a pool member sees the squads that need their role", b2.squads.find((s) => s.id === sid)?.needs_me === true);
await as(P.back, "select ap_squad_ask($1, 'Backend', 'Node + SQL')", [sid]);
check("asking notifies the lead", (await one("select count(*)::int n from notifications where user_id = $1 and title like 'Bina Backend wants to join%'", [P.lead])).n === 1);
await as(P.lead, "select ap_squad_respond($1, $2, true)", [sid, P.back]);
const after = (await as(P.lead, "select ap_squad_board($1) b", [opp]))[0].b.squads.find((s) => s.id === sid);
check("the lead accepts → 3 members, no open slots left", after.size === 3 && after.open_roles.length === 0, after);

console.log("\nstart with pool people, full, registered, leave");
await as(P.extra, "select ap_squad_pool_join($1, 'AI / ML', '')", [opp]);
const comp = (await as(P.extra, "select ap_squad_board($1) b", [opp]))[0].b.complements;
check("complements: pool members with a different role", comp.some((p) => p.user_id === P.pitch) && !comp.some((p) => p.user_id === P.extra), comp);
const sid2 = (await as(P.extra, "select ap_squad_from_pool($1, 'Data Dragons', '', array[$2]::uuid[]) id", [opp, P.pitch]))[0].id;
check("start a squad with pool people → they are invited", (await one("select state from opp_squad_members where squad_id = $1 and user_id = $2", [sid2, P.pitch])).state === "invited");
await as(P.pitch, "select ap_squad_respond($1, $2, true)", [sid2, P.pitch]);
check("2 of 2 → the squad is full", (await one("select status from opp_squads where id = $1", [sid2])).status === "full");
check("one squad per person per opportunity", /already in a squad/.test(await fails(() => as(P.pitch, "select ap_squad_ask($1, 'Pitch & business', '')", [sid])) ?? ""));
await as(P.lead, "select ap_squad_set($1, 'registered', null)", [sid]);
const counts = (await anon("select * from ap_squad_counts(array[$1]::uuid[])", [opp]))[0];
check("public cards: 1 squad forming or full, 1 registered (counts only)", counts.forming === 1 && counts.going === 1, counts);
check("members are told the squad is registered", (await one("select count(*)::int n from notifications where user_id = $1 and title like 'Your squad Byte Busters is registered%'", [P.des])).n === 1);
await as(P.lead, "select ap_squad_leave($1)", [sid]);
check("when the lead leaves, the next member leads", [P.des, P.back].includes((await one("select lead_id from opp_squads where id = $1", [sid])).lead_id));
const mine = (await as(P.des, "select ap_squad_my() m", []))[0].m;
check("My work lists my squads", mine.squads.some((s) => s.squad_id === sid));
check("execute rights: visitors cannot call member functions", (await fails(() => anon("select ap_squad_board($1)", [opp]))) !== null && (await fails(() => anon("select ap_squad_create($1, 'x', '', 'y', '{}', 2)", [opp]))) !== null);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
await db.end();
process.exit(failed ? 1 : 0);
