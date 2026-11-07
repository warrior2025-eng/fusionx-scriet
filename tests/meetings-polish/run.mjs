// The meeting room polish tests (menus, tile menus, inviting during a meeting, floating chat)
// against the app running locally, with fake data only. Never against production.
//
// What has to be running first (see tests/meetings-polish/local/README.txt):
//   - PostgreSQL 16 on 127.0.0.1:5433, with local/stubs.sql and every migration applied (node local/apply.mjs)
//   - PostgREST on 127.0.0.1:3055, and node local/stack.mjs (a stand-in for Supabase auth on :54321)
//   - a LiveKit dev server on 127.0.0.1:7880 with the key "fxkey" (LIVEKIT_KEYS in local/README.txt)
//   - node local/bots.mjs <project> (extra participants on :3077)
//   - the app: next build && next start -p 3100, with the env in local/README.txt
// Then: node tests/meetings-polish/run.mjs <project dir> <output dir for the GIFs>
// It needs Google Chrome and the "pg" client (FX_PG: a folder whose node_modules has it; it is not a project dependency).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const [project, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const require = createRequire(path.join(project, "package.json"));
// "pg" is not a project dependency: FX_PG is a folder whose node_modules has it.
const pg = createRequire(path.join(process.env.FX_PG ?? process.cwd(), "noop.js"))("pg");
const { createServerClient } = require("@supabase/ssr");
const keys = JSON.parse(fs.readFileSync(process.env.FX_STACK_KEYS ?? path.join(os.tmpdir(), "fx-stack-keys.json"), "utf8"));
const LK_KEY = "fxkey", LK_SECRET = "fx-local-livekit-secret-NEVER-IN-CLIENT-0123456789";
const lkAdmin = (room) => {
  const b = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = b({ alg: "HS256", typ: "JWT" }), body = b({ iss: LK_KEY, sub: "test", exp: Math.floor(Date.now() / 1000) + 600, video: { room, roomAdmin: true, roomList: true } });
  return head + "." + body + "." + createHmac("sha256", LK_SECRET).update(head + "." + body).digest("base64url");
};
const BASE = "http://localhost:3100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = new pg.Client({ host: "127.0.0.1", port: 5433, user: "postgres", database: "postgres" });
await db.connect();
const q = async (s, p) => (await db.query(s, p)).rows;
const results = [];
const check = (test, n, c, d) => { results.push({ test, n, ok: !!c }); console.log(`  ${c ? "ok  " : "FAIL"} [${test}] ${n}${c ? "" : ` -> ${JSON.stringify(d)?.slice(0, 400)}`}`); };

const jars = {}, tokens = {};
async function cookies(role) {
  if (jars[role]) return jars[role];
  const jar = new Map();
  const client = createServerClient(keys.url, keys.anon, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach((c) => jar.set(c.name, c.value)) } });
  const { data, error } = await client.auth.signInWithPassword({ email: `test-${role}@example.com`, password: "test-password" });
  if (error) throw new Error(`sign in ${role}: ${error.message}`);
  tokens[role] = data.session.access_token;
  for (let i = 0; i < 20 && jar.size === 0; i++) await sleep(100);
  return (jars[role] = [...jar].map(([name, value]) => ({ name, value })));
}
const rpc = async (role, fn, args) => {
  await cookies(role);
  const res = await fetch(`${keys.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: keys.anon, Authorization: `Bearer ${tokens[role]}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
// ── browser ──
// The fake microphone plays a steady tone, so speaking can be detected.
const TONE = path.join(os.tmpdir(), "fx-meetings-tone.wav");
{
  const rate = 16000, secs = 10, data = Buffer.alloc(rate * secs * 2);
  for (let i = 0; i < rate * secs; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 300 * i) / rate) * 9000), i * 2);
  const wavHead = Buffer.alloc(44);
  wavHead.write("RIFF", 0); wavHead.writeUInt32LE(36 + data.length, 4); wavHead.write("WAVEfmt ", 8); wavHead.writeUInt32LE(16, 16); wavHead.writeUInt16LE(1, 20); wavHead.writeUInt16LE(1, 22);
  wavHead.writeUInt32LE(rate, 24); wavHead.writeUInt32LE(rate * 2, 28); wavHead.writeUInt16LE(2, 32); wavHead.writeUInt16LE(16, 34); wavHead.write("data", 36); wavHead.writeUInt32LE(data.length, 40);
  fs.writeFileSync(TONE, Buffer.concat([wavHead, data]));
}
const port = 9200 + Math.floor(Math.random() * 300);
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "fx-meetings-chrome-" + port)}`, "--no-first-run", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=" + TONE.replace(/\\/g, "/"), "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
let ws; for (let i = 0; i < 60 && !ws; i++) { await sleep(200); try { ws = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise((r) => (sock.onopen = r));
let id = 0; const pend = new Map(); const errors = []; const listeners = new Set();
sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push((m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 200)); for (const l of listeners) l(m); };
const send = (method, params = {}, s) => new Promise((r) => { const i = ++id; pend.set(i, r); sock.send(JSON.stringify({ id: i, method, params, sessionId: s })); });
async function open(role, url, { width = 1440, theme = "light", capture = false, mobile = false, wait = 3500, ua = null, inject = "" } = {}) {
  const { browserContextId } = await send("Target.createBrowserContext");
  const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId: S } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Network.enable", { maxResourceBufferSize: 20_000_000, maxTotalBufferSize: 100_000_000 }, S); await send("Page.enable", {}, S); await send("Runtime.enable", {}, S);
  const bodies = [];
  if (capture) {
    const rids = new Set();
    listeners.add(async (m) => {
      if (m.sessionId !== S) return;
      if (m.method === "Network.responseReceived") rids.add(m.params.requestId);
      if (m.method === "Network.loadingFinished" && rids.has(m.params.requestId)) {
        const b = await send("Network.getResponseBody", { requestId: m.params.requestId }, S);
        if (b?.body) bodies.push(b.base64Encoded ? Buffer.from(b.body, "base64").toString("latin1") : b.body);
      }
    });
  }
  if (role) await send("Network.setCookies", { cookies: (await cookies(role)).map((c) => ({ ...c, url: BASE })) }, S);
  await send("Emulation.setDeviceMetricsOverride", { width, height: mobile ? 800 : 900, deviceScaleFactor: 1, mobile }, S);
  await send("Emulation.setFocusEmulationEnabled", { enabled: true }, S);
  if (ua) await send("Emulation.setUserAgentOverride", { userAgent: ua }, S);
  if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, S);
  if (inject) await send("Page.addScriptToEvaluateOnNewDocument", { source: inject }, S);
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `try{localStorage.setItem('theme','${theme}');sessionStorage.setItem('fx-lowend-v2','1')}catch(e){}` }, S);
  await send("Page.navigate", { url: BASE + url }, S); await sleep(wait);
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true, userGesture: true }, S)).result?.value;
  const click = async (selectorJs) => {
    const box = await ev(`(() => { const el = ${selectorJs}; if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; const top = document.elementFromPoint(x, y); if (!top || !(el === top || el.contains(top))) { el.click(); return { clicked: true }; } return { x, y }; })()`);
    if (!box) return false;
    if (box.clicked) return true;
    for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 }, S);
    return true;
  };
  const shot = async (name, full = true) => { const { cssContentSize: c } = await send("Page.getLayoutMetrics", {}, S); const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full, clip: { x: 0, y: 0, width: c.width, height: full ? Math.min(c.height, 5000) : (mobile ? 800 : 900), scale: 1 } }, S); fs.writeFileSync(path.join(out, name + ".png"), Buffer.from(data, "base64")); };
  const text = () => ev("document.body.innerText");
  return { browserContextId, S, ev, click, shot, bodies, text, close: () => send("Target.disposeBrowserContext", { browserContextId }) };
}


const lkList = async (room) => {
  const res = await fetch("http://127.0.0.1:7880/twirp/livekit.RoomService/ListParticipants", { method: "POST", headers: { Authorization: "Bearer " + lkAdmin(room), "Content-Type": "application/json" }, body: JSON.stringify({ room }) });
  return res.ok ? ((await res.json()).participants ?? []) : [];
};
const PHOTO = (who) => `${keys.url}/storage/v1/object/public/avatars/demo/${who}.svg`;
const person = async (key, name, { role, department, year, photo } = {}) => {
  const id = (await q("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id", [`test-${key}@example.com`, JSON.stringify({ full_name: name })]))[0].id;
  await q("update profiles set department=$2, year=$3, avatar_url=$4, bio='Fake.' where id=$1", [id, department ?? null, year ?? null, photo ? PHOTO(key) : null]);
  if (role) await q("insert into user_roles (user_id, role) values ($1, $2)", [id, role]);
  return id;
};
const U = {
  admin: await person("admin", "Aarav Admin", { role: "super_admin", photo: true }),
  riya: await person("riya", "Riya Sharma", { department: "IT", year: "2nd yr", photo: true }),
  kabir: await person("kabir", "Kabir Khan", { department: "CS", year: "3rd yr" }),
  meera: await person("meera", "Meera Singh", { department: "ECE", year: "2nd yr", photo: true }),
  neha: await person("neha", "Neha Gupta", { department: "Civil", year: "1st yr" }),
  sam: await person("sam", "Sam Roy", { department: "IT", year: "4th yr", photo: true }),
  tara: await person("tara", "Tara Bose", { department: "ME", year: "2nd yr" }),
  vikas: await person("vikas", "Vikas Rana", { department: "IT", year: "2nd yr" }),
  late: await person("late", "Late Joiner", { department: "IT", year: "1st yr" }),
};
const G = Object.fromEntries((await q("select slug, id from core_groups")).map((g) => [g.slug, g.id]));
await q("insert into core_group_members (group_id, user_id, title, is_lead) values ($1,$2,'Member',true), ($1,$3,'Member',false), ($1,$4,'Designer',false), ($1,$5,'Member',false), ($6,$7,'Member',false), ($8,$9,'Head of Execution',false)",
  [G["design-branding"], U.riya, U.kabir, U.meera, U.neha, G["event-crew"], U.tara, G["fusionx-core"], U.sam]);
await q("insert into core_group_members (group_id, user_id, title) values ($1,$2,'Member')", [G["design-branding"], U.sam]);

const dlg = `document.querySelector('dialog[open]')`;
const waitFor = async (p, js, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await p.ev(`!!(${js})`)) return true; await sleep(150); } return false; };
const btn = (scope, label) => `[...${scope}.querySelectorAll('button')].find((b) => [b.getAttribute('aria-label'), b.title, b.textContent.trim()].some((x) => x?.startsWith(${JSON.stringify(label)})))`;
const setVal = (p, sel, value) => p.ev(`(() => { const i = ${sel}; const proto = i.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : i.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return i.value; })()`);
const notes = (u, like) => q("select title, body, link from notifications where user_id=$1 and title like $2", [u, like]);
const api = async (role, path, body) => {
  const jar = role ? await cookies(role) : [];
  const res = await fetch(BASE + path, { method: "POST", headers: { Cookie: jar.map((c) => `${c.name}=${c.value}`).join("; "), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const room = `nav[aria-label="Meeting controls"]`;
const enterRoom = async (role, id, opts = {}) => {
  const p = await open(role, `/meetings/${id}?enter=1`, { wait: 2000, ...opts });
  await waitFor(p, btn("document", "Join meeting"), 15000);
  await sleep(600);
  await p.ev(`${btn("document", "Join meeting")}.click()`);
  const inRoom = await waitFor(p, `!!document.querySelector('${room}')`, 25000);
  if (!inRoom) console.log(`  (could not enter as ${role}: ${(await p.text()).slice(0, 300)})`);
  return p;
};
const tiles = (p) => p.ev(`[...document.querySelectorAll('[data-tile]')].map((t) => t.dataset.tile)`);
const tab = (p, name) => p.ev(`[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent.startsWith('${name}')).click()`);
const confirmIt = async (p, label) => { await waitFor(p, `!!${dlg}`, 4000); await p.ev(`${btn(dlg, label)}.click()`); await sleep(400); };

// ── the tests ──
const AsyncFunction = (async () => {}).constructor;
const body = fs.readFileSync(path.join(here, "body.mjs"), "utf8");
const scope = { fs, path, createHmac, project, out, keys, listeners, send, sleep, q, rpc, api, check, results, errors, open, enterRoom, btn, room, waitFor, setVal, notes, tiles, tab, confirmIt, lkList, person, U, G, LK_KEY, LK_SECRET, BASE };
try {
  await new AsyncFunction(...Object.keys(scope), body)(...Object.values(scope));
} finally {
  chrome.kill();
  await db.end();
}
const failed = results.filter((r) => !r.ok);
process.exit(failed.length ? 1 : 0);
