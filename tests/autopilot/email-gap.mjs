// A gap between announcement emails (migration 0052); personal emails still go at once.
// LOCAL test Postgres only, on a fresh database:   node tests/autopilot/email-gap.mjs
import { createRequire } from "node:module";
import path from "node:path";
const pg = createRequire(path.join(process.env.FX_PG ?? process.cwd(), "noop.js"))("pg");
const connect = async () => { const c = new pg.Client({ host: "127.0.0.1", port: 5433, user: "postgres", database: "postgres" }); await c.connect(); return c; };
const db = await connect();

const results = [];
const check = (name, ok, info) => { results.push({ name, ok }); console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok || info === undefined ? "" : "  " + JSON.stringify(info)}`); };
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const run = async (role, uid, sql, params = [], client = db) => {
  await client.query("begin");
  try {
    await client.query("select set_config('request.jwt.claim.sub', $1, true), set_config('role', $2, true)", [uid ?? "", role]);
    const rows = (await client.query(sql, params)).rows;
    await client.query("commit");
    return rows;
  } catch (e) { await client.query("rollback"); throw e; }
};
const service = (sql, params, client) => run("service_role", null, sql, params, client);
const fails = async (fn) => { try { await fn(); return false; } catch { return true; } };

const stamp = Date.now();
let made = 0;
const person = async (active = true) => {
  const email = `gap-${++made}-${stamp}@example.com`;
  const id = (await one("insert into auth.users (email) values ($1) returning id", [email])).id;
  await q("insert into profiles (id, full_name) values ($1, 'Gap Test') on conflict (id) do nothing", [id]);
  await q("update profiles set is_active = $2 where id = $1", [id, active]);
  return { id, email };
};
const announce = (title, link = "/opportunities", client) => service("select ap_notify_everyone($1, 'See them', $2)", [title, link], client);
const claim = async (who) => (await service("select * from claim_notification_emails(100, false)")).filter((m) => !who || m.email === who.email);
const drain = async () => { while ((await claim()).length === 100); };
const waiting = (who) => q("select title, email_summary, email_after, to_char(email_after at time zone 'Asia/Kolkata', 'HH24:MI') as at, (email_after at time zone 'Asia/Kolkata')::date - (now() at time zone 'Asia/Kolkata')::date as days from notifications where user_id = $1 and emailed_at is null and email_summary is not null", [who.id]);
const makeDue = (who) => q("update notifications set email_after = now() - interval '1 minute' where user_id = $1 and emailed_at is null and email_summary is not null", [who.id]);

console.log("\nannouncements wait, as one email");
const a = await person(), daily = await person(), exams = await person(), off = await person(false);
await q("insert into work_preferences (user_id, delivery) values ($1, 'daily')", [daily.id]);
await q("update autopilot_settings set founder_exam_mode = $1 where id = 1", [[exams.id]]);
await drain();
await announce("41 new opportunities on FusionX");
check("on the website at once", (await one("select count(*)::int n from notifications where user_id = $1", [a.id])).n === 1);
check("no email at once", (await claim(a)).length === 0);
let w = await waiting(a);
check("the email is set for 9:30 IST, today or tomorrow", w.length === 1 && w[0].at === "09:30" && w[0].days <= 1, w);
const firstTime = w[0].email_after.getTime();
await announce("14 new project ideas are waiting in My work", "/my-work#ideas");
await announce("3 new research topics in My work", "/my-work#ideas");
w = await waiting(a);
check("three announcements: still one waiting email", w.length === 1, w);
check("a new announcement does not push the email back", w[0].email_after.getTime() === firstTime);
check("all three are separate on the website", (await one("select count(*)::int n from notifications where user_id = $1", [a.id])).n === 3);
check("exam mode and inactive members are left out", (await one("select count(*)::int n from notifications where user_id = any($1)", [[exams.id, off.id]])).n === 0);

console.log("\npersonal emails are not delayed");
await q("select ap_notify($1, 'Task offered: Make the poster', 'Answer within 24 hours', '/my-work')", [a.id]);
await q("insert into notifications (user_id, title, body, link) values ($1, 'Your interview is tomorrow', 'At 4 pm', '/recruitment/status')", [a.id]);
const urgent = await claim(a);
check("a task and an interview notice go at once", urgent.length === 2 && urgent.every((m) => !m.title.startsWith("What's new")), urgent);
await q("insert into notifications (user_id, title, link, email_after) values ($1, 'Role notice', '/core', now() + interval '1 minute')", [a.id]);
check("a role notice still waits its minute", (await claim(a)).length === 0);
await q("delete from notifications where user_id = $1 and title = 'Role notice'", [a.id]);

console.log("\nthe email itself");
await makeDue(a);
const mail = await claim(a);
check("one email, listing all three", mail.length === 1 && mail[0].title === "What's new on FusionX" && mail[0].link === "/notifications"
  && mail[0].body.split("\n").length === 3 && /opportunities/.test(mail[0].body) && /ideas/.test(mail[0].body) && /research/.test(mail[0].body), mail);
check("it is not sent twice", (await claim(a)).length === 0);
await announce("35 new opportunities on FusionX");
w = await waiting(a);
check("the next one is 3 days later, 9:30 IST", w.length === 1 && w[0].days === 3 && w[0].at === "09:30", w);
check("it starts a fresh list", w[0].email_summary === "35 new opportunities on FusionX", w);
await makeDue(a);
const single = await claim(a);
check("a single announcement keeps its own title and link", single.length === 1 && single[0].title === "35 new opportunities on FusionX" && single[0].link === "/opportunities", single);

console.log("\ndaily-digest members");
check("announcements stay out of the daily digest", (await one("select count(*)::int n from autopilot_digest where user_id = $1", [daily.id])).n === 0);
check("no instant push for them", (await one("select count(*)::int n from notifications where user_id = $1 and pushed_at is null", [daily.id])).n === 0);
check("instant members still get the push", (await one("select count(*)::int n from notifications where user_id = $1 and email_summary is not null and pushed_at is null", [a.id])).n === 4);
await q("select ap_notify($1, 'Task offered: Book the hall', '', '/my-work')", [daily.id]);
check("their personal news still waits for the digest", (await one("select count(*)::int n from autopilot_digest where user_id = $1", [daily.id])).n === 1);

console.log("\nnothing is lost");
const late = await person();
await announce("29 new opportunities on FusionX");
await q("update notifications set created_at = now() - interval '4 days', email_after = now() - interval '5 minutes' where user_id = $1", [late.id]);
check("an email delayed past 3 days is still sent", (await claim(late)).length === 1);
const retry = await person();
await announce("32 new opportunities on FusionX");
await makeDue(retry);
const tried = await claim(retry);
await service("select release_notification_emails($1::uuid[])", [tried.map((m) => m.id)]);
await announce("39 new opportunities on FusionX");
w = await waiting(retry);
check("a failed send is carried into the next email", w.length === 1 && w[0].email_summary.split("\n").length === 2, w);
const old = await person();
await q("insert into notifications (user_id, title, link, emailed_at, email_attempts) values ($1, '42 new opportunities on FusionX', '/opportunities', now(), 1)", [old.id]);
await announce("30 new opportunities on FusionX");
check("emails sent before this migration count for the gap", (await waiting(old))[0].days === 3);

console.log("\ntwo at the same moment (Run all now)");
const both = await person();
const c1 = await connect(), c2 = await connect();
await Promise.all([announce("Ideas at once", "/my-work#ideas", c1), announce("Opportunities at once", "/opportunities", c2)]);
await c1.end(); await c2.end();
w = await waiting(both);
check("still one waiting email, with both lines", w.length === 1 && w[0].email_summary.split("\n").length === 2, w);

console.log("\ntwo weeks of daily announcements");
const m = await person();
const sentOn = []; let listed = 0;
for (let day = 0; day < 14; day++) {
  await announce(`Day ${day} opportunities`);
  // That day's 9:30: whatever is set for today or earlier becomes due.
  await q("update notifications set email_after = now() - interval '1 minute' where user_id = $1 and emailed_at is null and (email_after at time zone 'Asia/Kolkata')::date <= (now() at time zone 'Asia/Kolkata')::date", [m.id]);
  const got = await claim(m);
  if (got.length) { sentOn.push(day); listed += got[0].title === "What's new on FusionX" ? got[0].body.split("\n").length : 1; }
  if (got.length > 1) sentOn.push(day);
  // One day passes.
  await q("update notifications set created_at = created_at - interval '1 day', emailed_at = emailed_at - interval '1 day', email_tried_at = email_tried_at - interval '1 day', email_after = email_after - interval '1 day' where user_id = $1", [m.id]);
}
const open = (await waiting(m))[0]?.email_summary.split("\n").length ?? 0;
check("at most 5 emails instead of 14", sentOn.length >= 4 && sentOn.length <= 5, sentOn);
check("always 3 days apart", sentOn.slice(1).every((d, i) => d - sentOn[i] === 3), sentOn);
check("every announcement is in exactly one email (or the waiting one)", listed + open === 14, { listed, open });

console.log("\nadmin count and rights");
const admin = await person();
await q("insert into user_roles (user_id, role) values ($1, 'admin')", [admin.id]);
await drain();
await announce("Waiting for its time");
const stats = (await run("authenticated", admin.id, "select notification_email_stats() s"))[0].s;
check("emails waiting for their time are not shown as stuck", stats.waiting === 0, stats);
check("visitors and members cannot announce or read the queue",
  (await fails(() => run("anon", null, "select ap_notify_everyone('x', 'y', '/')")))
  && (await fails(() => run("authenticated", a.id, "select ap_notify_everyone('x', 'y', '/')")))
  && (await fails(() => run("authenticated", a.id, "select * from claim_notification_emails(10, false)"))));

await q("update autopilot_settings set founder_exam_mode = '{}' where id = 1");
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
await db.end();
process.exit(failed ? 1 : 0);
