/**
 * Daily (daily.co) REST calls for the FusionX Interview Room. SERVER ONLY:
 * DAILY_API_KEY is read here and never leaves the server. Only server actions
 * and server components import this file (it is never in a "use client" tree).
 *
 * One private room per interview slot, named after the slot. Tokens are short
 * lived and scoped to that room:
 *  - candidate: their real name, no owner rights, no screen share, valid from
 *    the early-join time until the slot ends plus the grace minutes
 *  - panel: owner rights, same window
 *  - phone camera: camera only (no microphone, no screen share), same window
 * Rooms have chat, screen share and recording off, and close at the slot's end plus grace.
 */

const API = (process.env.DAILY_API_BASE || "https://api.daily.co/v1").replace(/\/$/, "");

if (typeof window !== "undefined") {
  throw new Error("lib/interview/daily.ts is server-only");
}

export function dailyConfigured(): boolean {
  return Boolean(process.env.DAILY_API_KEY);
}

async function call(path: string, init: { method: string; body?: unknown }) {
  const key = process.env.DAILY_API_KEY;
  if (!key) throw new Error("The interview room is not set up yet (DAILY_API_KEY is missing).");
  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

/** "fx-" and the slot id without dashes: the same name every time for a slot. */
export function roomNameFor(slotId: string): string {
  return `fx-${slotId.replace(/-/g, "")}`;
}

const unix = (iso: string | Date) => Math.floor(new Date(iso).getTime() / 1000);

/**
 * The slot's room, created if it does not exist yet. `closesAt` is the slot's
 * end plus the grace minutes; the room expires then (and ejects whoever is left).
 */
export async function ensureRoom(slotId: string, closesAt: string): Promise<{ name: string; url: string }> {
  const name = roomNameFor(slotId);
  const existing = await call(`/rooms/${name}`, { method: "GET" });
  if (existing.ok && typeof existing.data.url === "string") return { name, url: existing.data.url };
  const created = await call("/rooms", {
    method: "POST",
    body: {
      name,
      privacy: "private",
      properties: {
        exp: unix(closesAt),
        eject_at_room_exp: true,
        max_participants: 20,
        enable_chat: false,
        enable_screenshare: false,
        enable_prejoin_ui: false,
        enable_knocking: false,
        enable_emoji_reactions: false,
        enable_hand_raising: true,
      },
    },
  });
  if (created.ok && typeof created.data.url === "string") return { name, url: created.data.url };
  // Created by someone else a moment ago.
  const again = await call(`/rooms/${name}`, { method: "GET" });
  if (again.ok && typeof again.data.url === "string") return { name, url: again.data.url };
  throw new Error("Could not open the interview room. Please try again in a moment.");
}

export type TokenKind = "candidate" | "panel" | "phone";

/** A meeting token for one room, valid between `opensAt` and `closesAt`. */
export async function meetingToken(input: {
  room: string;
  kind: TokenKind;
  userName: string;
  userId: string;
  opensAt: string;
  closesAt: string;
}): Promise<string> {
  const base = {
    room_name: input.room,
    user_name: input.userName.slice(0, 80),
    user_id: input.userId.slice(0, 36),
    nbf: unix(input.opensAt),
    exp: unix(input.closesAt),
    eject_at_token_exp: true,
    enable_screenshare: false,
    enable_prejoin_ui: false,
  };
  const properties =
    input.kind === "panel"
      ? { ...base, is_owner: true }
      : input.kind === "phone"
        ? { ...base, is_owner: false, start_audio_off: true, permissions: { canSend: ["video"], canAdmin: false } }
        : { ...base, is_owner: false, permissions: { canSend: ["video", "audio"], canAdmin: false } };
  const res = await call("/meeting-tokens", { method: "POST", body: { properties } });
  if (!res.ok || typeof res.data.token !== "string") throw new Error("Could not open the interview room. Please try again in a moment.");
  return res.data.token;
}
