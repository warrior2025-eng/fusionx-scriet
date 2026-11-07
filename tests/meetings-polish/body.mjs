// ── Meeting room polish: menus, tile menus, inviting during a meeting, floating chat ──
// The test body. It runs inside the local meetings harness (Chrome with fake camera and
// microphone, a local Postgres + PostgREST, a fake auth service and a local LiveKit dev
// server, all with fake data); see run.mjs. Never against production.
const { pathToFileURL } = await import("node:url");
const { writeGif } = await import(pathToFileURL(path.join(project, "tests/meetings-polish/gif.mjs")).href);
const consoleErrors = [];
listeners.add((m) => {
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 240));
});

const size = async (p, w, h, mobile = false) => {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile }, p.S);
  await sleep(600);
};
const mouse = async (p, x, y) => {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }, p.S);
  for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }, p.S);
  await sleep(250);
};
const hover = (p, x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }, p.S);
const centre = (p, js) => p.ev(`(() => { const e = ${js}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const press = async (p, js) => {
  const c = await centre(p, js);
  if (!c) return false;
  await mouse(p, c.x, c.y);
  return true;
};
const KEYS = { Escape: 27, Enter: 13, Tab: 9, ArrowDown: 40, ArrowUp: 38 };
const key = async (p, k) => {
  for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: k, code: k, windowsVirtualKeyCode: KEYS[k], nativeVirtualKeyCode: KEYS[k], ...(k === "Enter" && type === "keyDown" ? { text: "\r" } : {}) }, p.S);
  await sleep(250);
};
const trig = (id) => `document.querySelector('[data-popup-trigger="${id}"]')`;
const tileTrig = (uid) => trig(`tile:${uid}:camera`);
let mostOpen = 0;
const openPopups = async (p) => {
  const ids = await p.ev(`[...document.querySelectorAll('[data-popup]')].map((e) => e.dataset.popup)`);
  mostOpen = Math.max(mostOpen, ids.length);
  return ids;
};
const item = (label) => `[...document.querySelectorAll('[data-popup] [role^=menuitem]')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}))`;
const menuFits = (p) =>
  p.ev(`(() => {
    const m = document.querySelector('[data-popup]'); if (!m) return { open: false, ok: false };
    const items = [...m.querySelectorAll('[role^=menuitem]')];
    const res = items.map((i) => { const r = i.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; const top = document.elementFromPoint(x, y);
      return { t: i.textContent.trim(), inside: r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, hit: !!top && (top === i || i.contains(top)) }; });
    return { open: true, n: items.length, ok: items.length > 0 && res.every((r) => r.inside && r.hit), bad: res.filter((r) => !r.inside || !r.hit) };
  })()`);
const attached = (p, id) =>
  p.ev(`(() => {
    const m = document.querySelector('[data-popup]'); const b = document.querySelector('[data-popup-trigger="${id}"]');
    if (!m) return { open: false, ok: true }; if (!b) return { open: true, ok: false };
    const a = m.getBoundingClientRect(), r = b.getBoundingClientRect();
    const vert = Math.abs(a.top - r.bottom) < 12 || Math.abs(a.bottom - r.top) < 12, horiz = a.left < r.right + 2 && a.right > r.left - 2;
    return { open: true, ok: vert && horiz && a.left >= 0 && a.right <= innerWidth && a.top >= 0 && a.bottom <= innerHeight };
  })()`);
const toastSeen = (p, text) => waitFor(p, `[...document.querySelectorAll('[role=status] p')].some((t) => t.textContent.includes(${JSON.stringify(text)}))`, 8000);
const recorder = (p) => {
  const frames = [], delays = [];
  return {
    async frame(ms = 700) {
      const [w, h] = await p.ev("[innerWidth, innerHeight]");
      const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: w, height: h, scale: 0.5 } }, p.S);
      frames.push(Buffer.from(data, "base64"));
      delays.push(ms);
    },
    save(name) {
      if (frames.length) fs.writeFileSync(path.join(out, `${name}.gif`), writeGif(frames, delays));
    },
  };
};

// ── the meeting: Design & Branding (Riya is its lead, so a co-host), with Aarav as host ──
const startNow = async (title) => {
  const r = await rpc("admin", "meeting_save", { p_id: null, p: { title, description: "", starts_at: new Date(Date.now() + 60000).toISOString(), duration_min: 60, audience: [{ kind: "core_group", id: G["design-branding"] }], cohosts: [], agenda: [], lobby_on: false, join_muted: true, join_camera_off: false, screen_share_all: true, chat_on: true, repeat_weeks: 1 } });
  await q("set session_replication_role = replica");
  await q("update meetings set starts_at = now() - interval '1 minute' where id=$1", [r.body.id]);
  await q("set session_replication_role = origin");
  return r.body.id;
};
const MID = await startNow("Room polish");
const LKROOM = `fx-meet-${MID}`;
const nav = `document.querySelector('${room}')`;
const W = 1366, H = 768, PW = 390, PH = 844;

const host = await enterRoom("admin", MID);
await size(host, W, H);
const riya = await enterRoom("riya", MID);
await size(riya, W, H);
const kabir = await enterRoom("kabir", MID);
const meera = await enterRoom("meera", MID);
check("setup", "four people in the room", await waitFor(host, `document.querySelectorAll('[data-tile]').length === 4`, 25000), await tiles(host));
await sleep(3500);

// ═════ 1–3. Menus close by themselves (desktop) ═════
const lkMic = async (uid) => {
  const me = (await lkList(LKROOM)).find((x) => x.identity === uid);
  const t = me?.tracks?.find((x) => x.type === "AUDIO" || x.source === "MICROPHONE");
  return t ? (t.muted ? "muted" : "on") : "none";
};
const popupsFor = (p, who) => [
  {
    name: "React",
    id: "react",
    choose: () => press(p, `document.querySelector('[data-popup] [aria-label="React 👍"]')`),
    did: () => waitFor(who === "riya" ? kabir : kabir, `[...document.querySelectorAll('[data-float="👍"]')].length > 0`, 6000),
  },
  {
    name: "Host menu",
    id: "host",
    prepare: async () => {
      await rpc("kabir", "meeting_raise_hand", { p_meeting: MID, p_up: true });
      await sleep(3500);
    },
    choose: () => press(p, item("Lower all hands")),
    did: async () => {
      await sleep(800);
      return (await q("select hand_raised_at from meeting_attendance where meeting_id=$1 and user_id=$2", [MID, U.kabir]))[0]?.hand_raised_at === null;
    },
  },
  {
    name: "tile ⋯ menu",
    id: `tile:${U.kabir}:camera`,
    prepare: async () => {
      if ((await lkMic(U.kabir)) !== "on") await kabir.ev(`${btn(nav, "Unmute")}.click()`);
      for (let i = 0; i < 30 && (await lkMic(U.kabir)) !== "on"; i++) await sleep(300);
    },
    choose: () => press(p, item("Mute")),
    did: async () => {
      for (let i = 0; i < 30 && (await lkMic(U.kabir)) !== "muted"; i++) await sleep(300);
      return (await lkMic(U.kabir)) === "muted";
    },
  },
  {
    name: "device picker",
    id: "devices",
    choose: async () => {
      const label = await p.ev(`[...document.querySelectorAll('[data-popup] [role=group][aria-label=Microphone] [role=menuitemradio]')].find((b) => b.getAttribute('aria-checked') === 'false')?.textContent`);
      p.chosen = label;
      return press(p, `[...document.querySelectorAll('[data-popup] [role=menuitemradio]')].find((b) => b.textContent === ${JSON.stringify(label)})`);
    },
    did: async () => {
      await sleep(800);
      await press(p, trig("devices"));
      const ok = await p.ev(`[...document.querySelectorAll('[data-popup] [role=menuitemradio]')].find((b) => b.textContent === ${JSON.stringify(p.chosen ?? "")})?.getAttribute('aria-checked') === 'true' && !!sessionStorage.getItem('fx-microphone')`);
      await key(p, "Escape");
      return ok;
    },
  },
];

const closeWays = async (p, label, pops, outside, rec) => {
  for (const [i, P] of pops.entries()) {
    const other = pops[(i + 1) % pops.length].id;
    await press(p, trig(P.id));
    let o = await openPopups(p);
    const opened = o.length === 1 && o[0] === P.id && (await p.ev(`${trig(P.id)}.getAttribute('aria-expanded')`)) === "true";
    if (rec) await rec.frame(900);
    await mouse(p, outside.x, outside.y);
    const byOutside = (await openPopups(p)).length === 0 && (await p.ev(`${trig(P.id)}.getAttribute('aria-expanded')`)) === "false";
    if (rec) await rec.frame(600);
    await press(p, trig(P.id));
    await key(p, "Escape");
    const byEsc = (await openPopups(p)).length === 0 && (await p.ev(`document.activeElement === ${trig(P.id)}`));
    await press(p, trig(P.id));
    await press(p, trig(other));
    o = await openPopups(p);
    const byAnother = o.length === 1 && o[0] === other;
    if (rec) await rec.frame(900);
    await key(p, "Escape");
    await press(p, trig(P.id));
    await press(p, trig(P.id));
    const byToggle = (await openPopups(p)).length === 0;
    check("1", `${label}: ${P.name} closes on a press outside, Esc (focus back on its button), opening another popup, and its own button`, opened && byOutside && byEsc && byAnother && byToggle, { opened, byOutside, byEsc, byAnother, byToggle });
    if (P.prepare) await P.prepare();
    await press(p, trig(P.id));
    if (rec) await rec.frame(900);
    await P.choose();
    const closed = (await openPopups(p)).length === 0;
    if (rec) await rec.frame(900);
    check("1", `${label}: ${P.name} closes when an option is chosen`, closed);
    check("2", `${label}: ${P.name}: the chosen option is carried out`, await P.did());
  }
};
const asideAt = await centre(host, `document.querySelector('aside[aria-label="Meeting panel"] [role=tabpanel]')`);
const recMenus = recorder(host);
await closeWays(host, "desktop", popupsFor(host, "admin"), { x: asideAt.x, y: asideAt.y + 200 }, recMenus);
recMenus.save("gif-1-menus-close");
// a press on a video tile closes the popup and does nothing else (the pin button is not pressed)
await press(host, trig("host"));
const meeraPin = `document.querySelector('[data-tile="Meera Singh"] button[aria-label^="Pin"]')`;
await press(host, meeraPin);
const calm = { open: await openPopups(host), layout: await host.ev(`document.querySelector('[data-layout]').dataset.layout`), pin: await host.ev(`${meeraPin}?.getAttribute('aria-label')`) };
check("3", "a press on a tile closes the open popup and does nothing else", calm.open.length === 0 && calm.layout === "gallery" && calm.pin === "Pin Meera Singh", calm);
await press(host, `document.querySelector('[data-tile="Kabir Khan"]')`);
check("3", "a press on a video tile with nothing open does nothing", (await host.ev(`document.querySelector('[data-layout]').dataset.layout`)) === "gallery");
// keyboard: Tab / arrows reach every option, Enter runs it, Esc closes
await host.ev(`${tileTrig(U.meera)}.focus()`);
await key(host, "Enter");
const firstFocus = await host.ev(`document.activeElement?.closest('[data-popup]') ? document.activeElement.textContent.trim() : null`);
await key(host, "ArrowDown");
const secondFocus = await host.ev(`document.activeElement?.textContent.trim()`);
await key(host, "Tab");
const thirdFocus = await host.ev(`!!document.activeElement?.closest('[data-popup]')`);
await key(host, "Escape");
check("4", "keyboard: Enter opens a tile menu with the first option focused, arrows and Tab move inside, Esc closes", firstFocus === "Make co-host" && secondFocus && secondFocus !== firstFocus && thirdFocus && (await openPopups(host)).length === 0, { firstFocus, secondFocus, thirdFocus });

// ═════ 5. Tile menus fully visible: gallery with 3 participants ═════
for (const [name, uid] of [["Riya Sharma", U.riya], ["Kabir Khan", U.kabir], ["Meera Singh", U.meera]]) {
  await press(host, tileTrig(uid));
  const fit = await menuFits(host);
  check("5", `gallery, 3 participants: ${name}'s menu is fully on screen and every option can be pressed`, fit.ok, fit);
  await key(host, "Escape");
}

// ═════ 6. The menu follows its tile when the window changes, and goes when the tile goes ═════
await press(host, tileTrig(U.kabir));
const follow = [];
for (const [w, h] of [[1100, 700], [1600, 900], [W, H]]) {
  await size(host, w, h);
  follow.push(await attached(host, `tile:${U.kabir}:camera`));
}
check("6", "resizing with a tile menu open: it stays next to its tile, on screen", follow.every((f) => f.ok && f.open), follow);
await key(host, "Escape");
await press(host, tileTrig(U.meera));
await meera.close();
const gone = await waitFor(host, `!document.querySelector('[data-tile="Meera Singh"]')`, 20000);
await sleep(500);
check("6", "the tile leaves (they left the meeting): its menu closes, nothing left floating", gone && (await openPopups(host)).length === 0, { gone, open: await openPopups(host) });
const meera2 = await enterRoom("meera", MID);

// ═════ 4. Speaker view: every strip tile, the edges and the main tile ═════
const neha = await enterRoom("neha", MID);
const sam = await enterRoom("sam", MID);
await waitFor(host, `document.querySelectorAll('[data-tile]').length === 6`, 25000);
await sleep(2500);
await host.ev(`${btn(nav, "Speaker view")}.click()`);
await sleep(1500);
const recSpeaker = recorder(host);
const stripFit = async (label) => {
  const strip = await host.ev(`[...document.querySelectorAll('[data-layout="speaker"] [data-tile]')].map((t) => { const r = t.getBoundingClientRect(); const b = t.querySelector('[data-popup-trigger]'); return { name: t.dataset.tile, id: b?.dataset.popupTrigger, w: r.width, left: r.left, right: r.right, bottom: r.bottom }; }).filter((t) => t.id)`);
  const smallest = Math.min(...strip.map((t) => t.w));
  const results = [];
  for (const t of strip) {
    await press(host, trig(t.id));
    await sleep(200);
    const fit = await menuFits(host);
    results.push({ name: t.name, w: Math.round(t.w), ok: fit.ok, bad: fit.bad });
    if (results.length <= 2) await recSpeaker.frame(1100);
    await key(host, "Escape");
  }
  const left = strip.reduce((a, b) => (b.left < a.left ? b : a)), right = strip.reduce((a, b) => (b.right > a.right ? b : a)), low = strip.reduce((a, b) => (b.bottom > a.bottom ? b : a));
  const okFor = (t) => results.find((r) => r.name === t.name)?.ok;
  check("4", `speaker view (${label}): the smallest strip tile's menu (${Math.round(smallest)} px wide) is fully on screen and pressable`, strip.filter((t) => t.w === smallest).every(okFor), results);
  check("4", `speaker view (${label}): left edge, right edge and bottom tiles`, okFor(left) && okFor(right) && okFor(low), { left: left.name, right: right.name, low: low.name, results });
  check("4", `speaker view (${label}): every tile menu in the view`, results.length >= 4 && results.every((r) => r.ok), results);
};
await stripFit("panel open");
await host.ev(`document.querySelector('button[aria-label="Close the panel"]').click()`);
await sleep(1200);
await stripFit("panel closed, main tile at the right edge");
recSpeaker.save("gif-2-tile-menu-speaker-view");
// an option in a strip tile's menu works: Meera becomes a co-host
const meeraStrip = await host.ev(`!!document.querySelector('[data-layout="speaker"] [data-tile="Meera Singh"]')`);
await press(host, tileTrig(U.meera));
await press(host, item("Make co-host"));
check("4", "a strip tile's option can be pressed: Meera is made co-host", meeraStrip && (await toastSeen(meera2, "You are now a co-host")) && (await q("select 1 from meeting_cohosts where meeting_id=$1 and user_id=$2 and removed_at is null", [MID, U.meera])).length === 1);
await host.ev(`${btn(nav, "Gallery view")}.click()`);
await host.ev(`${btn(nav, "People")}.click()`);
await sleep(800);

// ═════ 5. Screen-share strip ═════
const LK = "ws://127.0.0.1:7880";
const jwt = (claims) => {
  const b = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = b({ alg: "HS256", typ: "JWT" }), body = b({ iss: LK_KEY, exp: Math.floor(Date.now() / 1000) + 3600, nbf: Math.floor(Date.now() / 1000) - 10, ...claims });
  return head + "." + body + "." + createHmac("sha256", LK_SECRET).update(head + "." + body).digest("base64url");
};
const botsP = await open(null, "/", { wait: 300 });
await send("Page.navigate", { url: "http://127.0.0.1:3077/" }, botsP.S);
await sleep(1500);
await botsP.ev(`addBot(${JSON.stringify(LK)}, ${JSON.stringify(jwt({ sub: "bot-share", name: "Slides", video: { room: LKROOM, roomJoin: true, canPublish: true, canSubscribe: true } }))}, "Slides", { share: true })`);
const shared = await waitFor(host, `document.querySelector('[data-layout]')?.dataset.layout === 'share'`, 15000);
await sleep(1200);
const shareStrip = await host.ev(`[...document.querySelectorAll('[data-layout="share"] [data-tile] [data-popup-trigger]')].map((b) => b.dataset.popupTrigger)`);
const shareRes = [];
for (const id of shareStrip) {
  await press(host, trig(id));
  shareRes.push(await menuFits(host));
  await key(host, "Escape");
}
check("5", "screen-share strip: every tile menu fully on screen and pressable", shared && shareRes.length >= 4 && shareRes.every((r) => r.ok), { shared, n: shareRes.length, bad: shareRes.filter((r) => !r.ok) });
await botsP.ev("leaveAll()");
await waitFor(host, `document.querySelector('[data-layout]')?.dataset.layout === 'gallery'`, 15000);

// ═════ 7–11. Inviting during the meeting ═════
const invitesFor = async (uid) => (await q("select source from meeting_invites where meeting_id=$1 and user_id=$2", [MID, uid])).map((r) => r.source);
const claimMail = async (fn, args) => {
  const res = await fetch(`${keys.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: keys.service, Authorization: `Bearer ${keys.service}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  return res.json();
};
await claimMail("claim_notification_emails", { p_limit: 100, p_force: false });
// 10 (first): a participant has no button, and the server refuses them
await kabir.ev(`${btn(nav, "People")}.click()`);
await sleep(800);
const kabirSees = await kabir.ev(`({ invite: !!document.querySelector('[data-invite-open]'), host: !!${btn(nav, "Host")} })`);
const asKabir = await api("kabir", `/api/meetings/${MID}/host`, { action: "invite", args: { users: [U.tara], ring: true } });
const searchKabir = await api("kabir", `/api/meetings/${MID}/host`, { action: "invite_search", args: { q: "Tara" } });
check("10", "a participant sees no Invite people (People tab or Host menu)", !kabirSees.invite && !kabirSees.host, kabirSees);
check("10", "a participant calling the invite API directly is refused, and nothing is written", asKabir.status === 403 && searchKabir.status === 403 && (await invitesFor(U.tara)).length === 0, { asKabir, searchKabir });
const riyaSees = await riya.ev(`({ people: !!document.querySelector('[data-invite-open]'), host: !!${btn(nav, "Host")} })`);
await press(riya, trig("host"));
const inHostMenu = !!(await riya.ev(`!!${item("Invite people")}`));
await key(riya, "Escape");
check("7", "a co-host sees Invite people at the top of People and in the Host menu", riyaSees.people && riyaSees.host && inHostMenu, { riyaSees, inHostMenu });

// 7: a co-host invites a website user by name
const recInvite = recorder(riya);
await press(riya, `document.querySelector('[data-invite-open]')`);
const dialogOpen = await waitFor(riya, `!!document.querySelector('[data-invite-dialog][open]')`, 4000);
await recInvite.frame(1000);
await setVal(riya, `document.getElementById('invite-search')`, "Vikas");
const found = await waitFor(riya, `!!document.querySelector('[data-invite-result="Vikas Rana"]')`, 6000);
await recInvite.frame(1000);
await press(riya, `document.querySelector('[data-invite-result="Vikas Rana"]')`);
await recInvite.frame(1000);
const ringOn = await riya.ev(`[...document.querySelectorAll('[data-invite-dialog] input[type=checkbox]')][0].checked`);
await press(riya, btn(`document.querySelector('[data-invite-dialog]')`, "Send invites"));
const toastOk = await toastSeen(riya, "Invited 1 person");
await recInvite.frame(1400);
check("7", "the dialog: search by name, pick, Ring them now on by default, Send → toast", dialogOpen && found && ringOn && toastOk, { dialogOpen, found, ringOn, toastOk });
const vNotes = await notes(U.vikas, "%invited you to%");
check("7", "they get a pass (one), a notification with the host's name", (await invitesFor(U.vikas)).join() === "live" && vNotes.length === 1 && vNotes[0].title === "Riya Sharma invited you to 'Room polish', happening now" && vNotes[0].link.startsWith(`/meetings/${MID}?for=`), vNotes);
const mailRows = (await claimMail("claim_notification_emails", { p_limit: 100, p_force: false })).filter((m) => m.full_name === "Vikas Rana");
const { notificationEmail, meetingSignupEmail } = await import(pathToFileURL(path.join(project, "lib/email/template.ts")).href);
const vMail = mailRows[0] && notificationEmail({ siteName: "FusionX@SCRIET", siteUrl: "https://fxscriet.com", name: "Vikas Rana", title: mailRows[0].title, body: mailRows[0].body, link: mailRows[0].link });
check("7", "an email row in the outbox: “… invited you to 'Room polish', happening now” with Open your pass", mailRows.length === 1 && vMail.html.includes(">Open your pass</a>"), mailRows);
check("7", "a ring for them", (await q("select 1 from meeting_rings where meeting_id=$1 and user_id=$2", [MID, U.vikas])).length === 1);
await riya.ev(`${btn(nav, "People")}.click()`);
await sleep(3500);
check("7", "People shows them as Invited · not joined yet, with Ring", await riya.ev(`(() => { const row = document.querySelector('[data-person="Vikas Rana"]'); const part = row?.closest('div')?.querySelector('p')?.textContent ?? ''; return part.startsWith('Invited · not joined yet') && !!row.querySelector('button')?.textContent.includes('Ring'); })()`));
const vik = await open("vikas", "/", { wait: 2500 });
await size(vik, W, H);
const banner = await waitFor(vik, `document.querySelector('[aria-label="Incoming meeting call"]')?.innerText.includes('Riya Sharma is calling you')`, 12000);
await recInvite.frame(1200);
await vik.ev(`document.querySelector('[aria-label="Incoming meeting call"]').scrollIntoView()`);
const recV = recorder(vik);
await recV.frame(1600);
check("7", "the ring banner appears for them on any page", banner);
await vik.close();
const vikRoom = await enterRoom("vikas", MID);
check("7", "and they can join", await waitFor(host, `!!document.querySelector('[data-tile="Vikas Rana"]')`, 20000));
recInvite.save("gif-3-invite-during-meeting");
recV.save("gif-3b-ring-banner");

// 8: no duplicates
const again = await api("riya", `/api/meetings/${MID}/host`, { action: "invite", args: { users: [U.vikas, U.kabir], emails: ["test-kabir@example.com"], ring: false } });
check("8", "inviting someone already invited or in the room: no new pass, notification or invite", again.status === 200 && again.body.users === 0 && again.body.emails === 0 && again.body.already === 2 && (await invitesFor(U.vikas)).length === 1 && (await notes(U.vikas, "%invited you to%")).length === 1 && (await q("select 1 from meeting_email_invites where meeting_id=$1", [MID])).length === 0, again);
await setVal(riya, `document.getElementById('invite-search')`, "");
await press(riya, `document.querySelector('[data-invite-open]')`);
await setVal(riya, `document.getElementById('invite-search')`, "Kabir");
await waitFor(riya, `!!document.querySelector('[data-invite-result="Kabir Khan"]')`, 6000);
check("8", "the search shows who is already in the room", await riya.ev(`document.querySelector('[data-invite-result="Kabir Khan"]').disabled && document.querySelector('[data-invite-result="Kabir Khan"]').textContent.includes('In the room')`));

// 9: by email: a website user's address becomes a user invite; a new one an email invite
await setVal(riya, `document.getElementById('invite-search')`, "");
await setVal(riya, `document.getElementById('invite-emails')`, "test-newbie@example.com, test-late@example.com bad@x ");
await sleep(300);
const chips = await riya.ev(`[...document.querySelectorAll('[data-email-chip]')].map((c) => c.dataset.emailChip + (c.hasAttribute('data-bad') ? '!' : ''))`);
await press(riya, btn(`document.querySelector('[data-invite-dialog]')`, "Send invites"));
const badShown = await riya.ev(`document.querySelector('[data-invite-dialog] [role=alert]')?.textContent.includes('bad@x')`);
await press(riya, `document.querySelector('[data-email-chip="bad@x"] button')`);
await press(riya, btn(`document.querySelector('[data-invite-dialog]')`, "Send invites"));
const emailToast = await toastSeen(riya, "Invited 2 people (1 by email)");
check("9", "emails as chips, a wrong one flagged and not sent; Send → “Invited 2 people (1 by email)”", chips.join() === "test-newbie@example.com,test-late@example.com,bad@x!" && badShown && emailToast, { chips, badShown, emailToast });
const ei = await q("select email, notice from meeting_email_invites where meeting_id=$1", [MID]);
check("9", "the website user's address became a user invite; the new address an email invite", ei.length === 1 && ei[0].email === "test-newbie@example.com" && ei[0].notice === "invite" && (await invitesFor(U.late)).join() === "live", { ei, late: await invitesFor(U.late) });
const signupMails = (await claimMail("claim_meeting_email_invites", { p_limit: 50 })).filter((m) => m.email === "test-newbie@example.com");
const sMail = signupMails[0] && meetingSignupEmail({ siteName: "FusionX@SCRIET", siteUrl: "https://fxscriet.com", email: signupMails[0].email, kind: signupMails[0].kind, title: signupMails[0].title, at: signupMails[0].at_time });
check("9", "the sign-up email: “You're invited to 'Room polish'… Sign up … with this email address to get your Meeting Pass”", signupMails.length === 1 && sMail.subject === "You're invited to 'Room polish' on FusionX" && sMail.text.includes("with this email address to get your Meeting Pass"), sMail?.text);
const other = await person("other", "Other Address");
check("9", "a different email signing up gets nothing", (await invitesFor(other)).length === 0);
await q("insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ('test-newbie@example.com', null, '{\"full_name\":\"New Bie\"}')");
const unconfirmed = (await q("select id from auth.users where email='test-newbie@example.com'"))[0].id;
check("9", "the same address not yet confirmed: no pass", (await invitesFor(unconfirmed)).length === 0);
await q("update auth.users set email_confirmed_at = now() where id=$1", [unconfirmed]);
check("9", "signing up with exactly that email while the meeting is live: the pass at once", (await invitesFor(unconfirmed)).length === 1 && (await notes(unconfirmed, "You're invited: Room polish")).length === 1);
const newbie = await enterRoom("newbie", MID);
check("9", "and they can join", await waitFor(host, `!!document.querySelector('[data-tile="New Bie"]')`, 20000));
await newbie.close();
await riya.ev(`document.querySelector('[data-invite-dialog][open]')?.close()`);

// 11: locked: the newly invited wait in the lobby
await press(host, trig("host"));
await press(host, item("Lock meeting"));
await sleep(800);
const locked = (await q("select locked from meetings where id=$1", [MID]))[0].locked;
const tInv = await api("riya", `/api/meetings/${MID}/host`, { action: "invite", args: { users: [U.tara], ring: true } });
const taraP = await open("tara", `/meetings/${MID}?enter=1`, { wait: 2000 });
await waitFor(taraP, btn("document", "Join meeting"), 15000);
await sleep(500);
await taraP.ev(`${btn("document", "Join meeting")}.click()`);
const inLobby = await waitFor(taraP, `document.body.innerText.includes('Waiting for the host to let you in')`, 15000);
const hostSees = await waitFor(host, `!!document.querySelector('[data-lobby]')?.innerText.includes('Tara Bose')`, 10000);
check("11", "locked meeting: the newly invited person waits in the lobby, the host sees them", locked && tInv.status === 200 && inLobby && hostSees, { locked, tInv, inLobby, hostSees });
await host.ev(`${btn(`document.querySelector('[data-lobby]')`, "Admit")}.click()`);
check("11", "and joins once the host admits them", await waitFor(taraP, `!!document.querySelector('${room}')`, 20000));
await press(host, trig("host"));
await press(host, item("Unlock meeting"));

// ═════ 12–15. Floating chat (desktop: the panel is on People, so the chat is closed) ═════
const say = async (role, body) => {
  const r = await rpc(role, "meeting_chat_send", { p_meeting: MID, p_body: body });
  return r.status < 300;
};
const cards = (p) => p.ev(`[...document.querySelectorAll('[data-chat-card]')].filter((c) => !c.className.includes('meeting-chat-card-out')).map((c) => c.innerText.split('\\n').pop())`);
const cardWith = (text) => `[...document.querySelectorAll('[data-chat-card]')].find((c) => c.innerText.includes(${JSON.stringify(text)}))`;
const lifetime = async (p, text) => {
  if (!(await waitFor(p, `!!${cardWith(text)}`, 8000))) return null;
  const t0 = Date.now();
  await waitFor(p, `!${cardWith(text)}`, 16000);
  return Date.now() - t0;
};
const chatSuite = async (p, label, phone) => {
  const rec = phone ? null : recorder(p);
  await say("kabir", "Hello from Kabir");
  if (rec) {
    await waitFor(p, `!!${cardWith("Hello from Kabir")}`, 8000);
    for (let i = 0; i < 9; i++) {
      await rec.frame(i < 1 ? 900 : 800);
      await sleep(450);
    }
  }
  const plain = rec ? 6000 : await lifetime(p, "Hello from Kabir");
  if (!rec) check("12", `${label}: a message from someone else floats in, gone by itself after about 6 s`, plain > 5000 && plain < 8000, plain);
  else {
    await waitFor(p, `!${cardWith("Hello from Kabir")}`, 8000);
    rec.save("gif-4-floating-chat");
    await say("kabir", "Second hello");
    const again = await lifetime(p, "Second hello");
    check("12", `${label}: a message from someone else floats in, gone by itself after about 6 s`, again > 5000 && again < 8000, again);
  }
  await say("kabir", `@${phone ? "Riya" : "Aarav"} can you check the agenda`);
  const mentionShown = await waitFor(p, `!!document.querySelector('[data-chat-card][data-mention]')`, 8000);
  const top = await p.ev(`(() => { const c = document.querySelector('[data-chat-cards]'); return c ? c.getBoundingClientRect().top : null; })()`);
  const mention = await lifetime(p, "can you check the agenda");
  check("12", `${label}: a message mentioning me is highlighted and gone after about 10 s`, mentionShown && mention > 8500 && mention < 12500, { mentionShown, mention });
  if (phone) check("12", `${label}: the cards sit at the top on a phone`, top !== null && top < 120, top);
  if (!phone) {
    await say("kabir", "Hover test");
    await waitFor(p, `!!${cardWith("Hover test")}`, 8000);
    const c = await centre(p, cardWith("Hover test"));
    await hover(p, c.x, c.y);
    await sleep(8000);
    const held = await p.ev(`!!${cardWith("Hover test")}`);
    await hover(p, 40, 40);
    const t0 = Date.now();
    await waitFor(p, `!${cardWith("Hover test")}`, 12000);
    const after = Date.now() - t0;
    check("13", `${label}: hovering a card pauses its timer; moving away starts it again`, held && after > 5000 && after < 8000, { held, after });
  }
  await say("kabir", "Close me early");
  await waitFor(p, `!!${cardWith("Close me early")}`, 8000);
  await sleep(500); // the card has finished sliding in
  await press(p, `${cardWith("Close me early")}.querySelector('[aria-label="Dismiss"]')`);
  check("13", `${label}: ✕ closes a card at once`, await waitFor(p, `!${cardWith("Close me early")}`, 1500));
  await say("kabir", `Open the chat here ${label}`);
  await waitFor(p, `!!${cardWith(`Open the chat here ${label}`)}`, 8000);
  await sleep(500);
  const msgId = (await q("select id from meeting_chat_messages where meeting_id=$1 and body=$2", [MID, `Open the chat here ${label}`]))[0].id;
  await press(p, `${cardWith(`Open the chat here ${label}`)}.querySelector('button')`);
  await sleep(900);
  const atMsg = await p.ev(`(() => { const tab = document.querySelector('[role=tab][aria-selected=true]')?.textContent; const li = document.querySelector('[data-chat-id="${msgId}"]'); if (!li) return { tab }; const r = li.getBoundingClientRect(), box = li.closest('ul').getBoundingClientRect(); return { tab, focus: li.classList.contains('meeting-chat-focus'), visible: r.top >= box.top - 1 && r.bottom <= box.bottom + 1 }; })()`);
  check("13", `${label}: pressing a card opens the Chat tab at that message`, atMsg.tab?.startsWith("Chat") && atMsg.focus && atMsg.visible, atMsg);
  // 14: five quick ones while the chat is closed
  if (phone) await p.ev(`document.querySelector('button[aria-label="Close the panel"]').click()`);
  else await tab(p, "People");
  await sleep(600);
  let most = 0;
  const watch = async (ms) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      most = Math.max(most, (await cards(p)).length);
      await sleep(150);
    }
  };
  for (const n of [1, 2, 3]) await say("kabir", `Quick ${n}`);
  await waitFor(p, `document.querySelectorAll('[data-chat-card]').length === 3`, 8000);
  most = Math.max(most, (await cards(p)).length);
  for (const n of [4, 5]) await say("kabir", `Quick ${n}`);
  await waitFor(p, `!!${cardWith("Quick 5")}`, 8000);
  // Read at once: each card also leaves by itself after its 6 s.
  const visible = await cards(p);
  await watch(800);
  const badge = await p.ev(`document.querySelector('[data-unread]')?.dataset.unread`);
  check("14", `${label}: five quick messages: at most 3 cards, the oldest left first`, most <= 3 && visible.join() === "Quick 3,Quick 4,Quick 5", { most, visible });
  check("14", `${label}: the Chat button shows 5 unread`, badge === "5", badge);
  await p.ev(`${btn(nav, "Chat")}.click()`);
  await sleep(700);
  check("14", `${label}: opening the Chat tab clears the badge and the cards`, !(await p.ev(`!!document.querySelector('[data-unread]')`)) && (await cards(p)).length === 0);
  // 15: no card for my own message, or with the chat open; a deleted message's card goes at once
  await say("kabir", "Chat is open now");
  await sleep(4500);
  check("15", `${label}: no card while the Chat tab is open`, !(await p.ev(`!!${cardWith("Chat is open now")}`)) && !(await p.ev(`!!document.querySelector('[data-unread]')`)));
  if (phone) await p.ev(`document.querySelector('button[aria-label="Close the panel"]').click()`);
  else await tab(p, "People");
  await say(phone ? "riya" : "admin", `My own words ${label}`);
  await sleep(4500);
  check("15", `${label}: no card for my own message`, !(await p.ev(`!!${cardWith(`My own words ${label}`)}`)));
  await say("kabir", `Delete me ${label}`);
  await waitFor(p, `!!${cardWith(`Delete me ${label}`)}`, 8000);
  const delId = (await q("select id from meeting_chat_messages where meeting_id=$1 and body=$2", [MID, `Delete me ${label}`]))[0].id;
  const del = await api("admin", `/api/meetings/${MID}/host`, { action: "chat_delete", args: { id: delId } });
  const t0 = Date.now();
  const removed = await waitFor(p, `!${cardWith(`Delete me ${label}`)}`, 6000);
  check("15", `${label}: deleting a message removes its card at once (with the next refresh)`, del.status === 200 && removed && Date.now() - t0 < 4500, { del: del.status, ms: Date.now() - t0 });
  await p.ev(`${btn(nav, "Chat")}.click()`);
  await sleep(500);
  if (phone) await p.ev(`document.querySelector('button[aria-label="Close the panel"]').click()`);
  else await tab(p, "People");
};
await chatSuite(host, "desktop", false);
await host.ev(`${btn(nav, "Chat")}.click()`);
await sleep(500);
const soundOff = await host.ev(`document.querySelector('[data-chat-sound]')?.getAttribute('aria-checked') === 'false'`);
await host.ev(`document.querySelector('[data-chat-sound]').click()`);
check("12", "the soft sound for new messages: off by default, a switch in the Chat tab", soundOff && (await host.ev(`document.querySelector('[data-chat-sound]').getAttribute('aria-checked') === 'true'`)));
await host.ev(`document.querySelector('[data-chat-sound]').click()`);
await tab(host, "People");

// ═════ Phone 390×844: menus, tile menus, floating chat (Riya, a co-host, on her phone) ═════
await riya.close();
const riyaP = await enterRoom("riya", MID, { width: PW, mobile: true });
await size(riyaP, PW, PH, true);
await sleep(3000);
const empty = await riyaP.ev(`(() => { const s = document.querySelector('[data-layout]').getBoundingClientRect(); return { x: s.left + s.width / 2, y: s.bottom - 12 }; })()`);
await closeWays(riyaP, "phone", popupsFor(riyaP, "riya"), empty, null);
await press(riyaP, trig("react"));
await press(riyaP, `document.querySelector('[data-tile="Kabir Khan"]')`);
check("3", "phone: a tap on a tile closes the open popup and does nothing else", (await openPopups(riyaP)).length === 0 && (await riyaP.ev(`document.querySelector('[data-layout]').dataset.layout`)) === "gallery");
const phoneTiles = await riyaP.ev(`[...document.querySelectorAll('[data-tile] [data-popup-trigger]')].map((b) => b.dataset.popupTrigger)`);
const phoneRes = [];
for (const id of phoneTiles) {
  await riyaP.ev(`${trig(id)}.scrollIntoView({ block: 'nearest' })`);
  await press(riyaP, trig(id));
  phoneRes.push(await menuFits(riyaP));
  await key(riyaP, "Escape");
}
check("5", "phone layout: every tile menu fully on screen and pressable", phoneRes.length >= 5 && phoneRes.every((r) => r.ok), { n: phoneRes.length, bad: phoneRes.filter((r) => !r.ok) });
await press(riyaP, `document.querySelector('[data-invite-open]') ?? ${btn(nav, "People")}`);
await sleep(600);
if (!(await riyaP.ev(`!!document.querySelector('[data-invite-dialog][open]')`))) await press(riyaP, `document.querySelector('[data-invite-open]')`);
const phoneDialog = await riyaP.ev(`(() => { const d = document.querySelector('[data-invite-dialog][open]'); if (!d) return null; const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()`);
check("7", "phone: the Invite people dialog fits the screen", phoneDialog === true, phoneDialog);
await riyaP.ev(`document.querySelector('[data-invite-dialog][open]')?.close()`);
await riyaP.ev(`document.querySelector('button[aria-label="Close the panel"]')?.click()`);
await sleep(400);
await chatSuite(riyaP, "phone", true);

// ═════ 16. Nothing else broke ═════
const guest = await person("guest", "Guest Person");
await rpc("guest", "meeting_knock", { p_meeting: MID, p_note: "Can I join?" });
const knockSeen = await waitFor(host, `!!document.querySelector('[data-knock="Guest Person"]')`, 10000);
await host.ev(`${btn(`document.querySelector('[data-knock="Guest Person"]')`, "Let in")}.click()`);
await sleep(1200);
const guestIn = await enterRoom("guest", MID);
check("16", "knock and Let in", knockSeen && (await q("select status from meeting_knocks where meeting_id=$1 and user_id=$2", [MID, guest]))[0]?.status === "let_in" && (await waitFor(host, `!!document.querySelector('[data-tile="Guest Person"]')`, 20000)));
await guestIn.close();
await sam.close();
await q("update meeting_attendance set left_at = now() where meeting_id=$1 and user_id=$2", [MID, U.sam]);
const rung = await api("admin", `/api/meetings/${MID}/host`, { action: "ring", args: { user: U.sam } });
const samPage = await open("sam", "/", { wait: 2500 });
check("16", "Ring", rung.status === 200 && rung.body.rung === 1 && (await waitFor(samPage, `!!document.querySelector('[aria-label="Incoming meeting call"]')`, 12000)), rung);
await samPage.close();
await tab(host, "People");
await press(host, trig(`person:${U.meera}`));
await press(host, item("Remove co-host"));
const removedCo = await toastSeen(meera2, "You are no longer a co-host");
await press(host, trig(`person:${U.kabir}`));
await press(host, item("Make co-host"));
const madeCo = await toastSeen(kabir, "You are now a co-host");
await press(host, trig(`person:${U.kabir}`));
await press(host, item("Remove co-host"));
check("16", "Make co-host / Remove co-host (from the People ⋯ popup)", removedCo && madeCo && (await toastSeen(kabir, "You are no longer a co-host")));
await press(kabir, trig("react"));
await press(kabir, `document.querySelector('[data-popup] [aria-label="React 🎉"]')`);
check("16", "reactions with names", await waitFor(host, `[...document.querySelectorAll('[data-float="🎉"] [data-float-names]')].some((e) => e.textContent.includes('Kabir'))`, 6000));
await botsP.ev(`addBot(${JSON.stringify(LK)}, ${JSON.stringify(jwt({ sub: "bot-talk", name: "Talker", video: { room: LKROOM, roomJoin: true, canPublish: true, canSubscribe: true } }))}, "Talker", {})`);
await waitFor(host, `!!document.querySelector('[data-tile="Talker"]')`, 15000);
await botsP.ev("speak(0, true)");
check("16", "the speaking highlight", await waitFor(host, `!!document.querySelector('[data-tile="Talker"][data-speaking]')`, 8000));
await botsP.ev("speak(0, false)");
const fit = await host.ev(`(() => { const s = document.querySelector('[data-layout]'); const b = s.getBoundingClientRect(); const t = [...document.querySelectorAll('[data-tile]')].map((e) => e.getBoundingClientRect()); return { layout: s.dataset.layout, n: t.length, inside: t.every((r) => r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1), scroll: document.documentElement.scrollHeight > innerHeight + 1 }; })()`);
check("16", "the one-screen gallery", fit.layout === "gallery" && fit.n >= 6 && fit.inside && !fit.scroll, fit);
await press(host, trig("host"));
await press(host, item("End meeting for all"));
await confirmIt(host, "End for all");
check("16", "End meeting for all", (await waitFor(kabir, `document.body.innerText.includes('The meeting has ended.')`, 15000)) && (await q("select status from meetings where id=$1", [MID]))[0].status === "ended");
await botsP.ev("leaveAll()");
for (const p of [host, kabir, meera2, neha, riyaP, vikRoom, taraP]) await p.close().catch(() => {});
// the empty room ends by itself
const M2 = await startNow("Empty room");
const h2 = await enterRoom("admin", M2);
await sleep(2500);
await h2.close();
await sleep(4000);
await q("update meeting_attendance set last_seen_at = now() - interval '6 minutes', left_at = now() - interval '6 minutes' where meeting_id=$1", [M2]);
await fetch(`${BASE}/api/cron/meeting-reminders`, { headers: { Authorization: "Bearer local-cron-secret" } });
check("16", "the empty room ends by itself", (await q("select status from meetings where id=$1", [M2]))[0].status === "ended");
await botsP.close();

// ═════ 17 and the audit ═════
check("7", "audit entries: invited_during_meeting", (await q("select metadata from audit_logs where action='invited_during_meeting' and resource_id=$1", [MID])).length >= 4);
check("3", "only one popup was ever open at a time", mostOpen <= 1, mostOpen);
check("17", "no page errors during the run", errors.length === 0, errors.slice(0, 5));
check("17", "no console errors during the run", consoleErrors.length === 0, consoleErrors.slice(0, 8));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
