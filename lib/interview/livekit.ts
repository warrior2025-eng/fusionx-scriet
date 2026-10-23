import { createHmac } from "node:crypto";

/**
 * LiveKit (livekit.com, free "Build" plan, no card) for the FusionX Interview
 * Room. SERVER ONLY: LIVEKIT_API_SECRET is read here and never leaves the
 * server; this file is imported only by server actions and server components.
 *
 * One room per interview DAY ("fx-day-<day id>"), created by LiveKit on the
 * first join. The panel stays in it all day; each candidate (and their phone)
 * may connect only during their own slot. Access is the token: a short-lived
 * JWT, signed with the API secret, scoped to that one room and to what the
 * person may send.
 *  - candidate: their real name, camera + microphone only (no screen share,
 *    no chat / data), valid from their slot's join time until it ends
 *  - panel: room admin, camera + microphone + screen share + data, all day
 *  - phone camera: camera only (no microphone, no screen share, no data)
 * LiveKit checks a token only when connecting, so whoever is still in the
 * room after their slot is removed through the server API (see day-room.ts).
 *
 * Env: LIVEKIT_URL (wss://<project>.livekit.cloud; the browser connects to it,
 * so it is not secret), LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
 */

if (typeof window !== "undefined") {
  throw new Error("lib/interview/livekit.ts is server-only");
}

export function roomConfigured(): boolean {
  return Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
}

/** "fx-" and the slot id without dashes: the per-slot room of the first version (kept for compatibility). */
export function roomNameFor(slotId: string): string {
  return `fx-${slotId.replace(/-/g, "")}`;
}

/** "fx-day-" and the day id without dashes: the one room of an interview day (the same name as interview_day_room_name in the database). */
export function roomNameForDay(dayId: string): string {
  return `fx-day-${dayId.replace(/-/g, "")}`;
}

export type TokenKind = "candidate" | "panel" | "phone";

/** What the server and the panel read from a participant's metadata (set in the token; participants cannot change it). */
export type ParticipantMeta = { kind: TokenKind; booking_id?: string; slot_id?: string; slot_ends_at?: string };

const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");
const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function keys() {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) throw new Error("The interview room is not set up yet (LiveKit keys are missing).");
  return { url, key, secret };
}

function sign(claims: Record<string, unknown>, secret: string): string {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const signature = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${signature}`;
}

/**
 * A LiveKit access token for one room, usable to connect between `opensAt`
 * and `closesAt` (LiveKit checks it when connecting).
 */
export function accessToken(input: {
  room: string;
  kind: TokenKind;
  identity: string;
  name: string;
  opensAt: string;
  closesAt: string;
  meta?: Omit<ParticipantMeta, "kind">;
}): { serverUrl: string; token: string } {
  const { url, key, secret } = keys();
  const sources =
    input.kind === "panel" ? ["camera", "microphone", "screen_share", "screen_share_audio"] : input.kind === "phone" ? ["camera"] : ["camera", "microphone"];
  const meta: ParticipantMeta = { kind: input.kind, ...input.meta };
  const claims = {
    iss: key,
    sub: input.identity.slice(0, 64),
    jti: input.identity.slice(0, 64),
    name: input.name.slice(0, 80),
    nbf: unix(input.opensAt),
    exp: unix(input.closesAt),
    metadata: JSON.stringify(meta),
    video: {
      room: input.room,
      roomJoin: true,
      canSubscribe: true,
      canPublish: true,
      canPublishData: input.kind === "panel",
      canPublishSources: sources,
      canUpdateOwnMetadata: false,
      roomAdmin: input.kind === "panel",
    },
  };
  return { serverUrl: url, token: sign(claims, secret) };
}

// ── the server API (RoomService), for removing people from the day room ──
export type RoomParticipant = { identity: string; name: string; metadata: string; joinedAt: number; meta: ParticipantMeta | null };

async function roomService<T>(method: "ListParticipants" | "RemoveParticipant", room: string, body: Record<string, unknown>): Promise<T | null> {
  const { url, key, secret } = keys();
  const now = Math.floor(Date.now() / 1000);
  const token = sign({ iss: key, sub: "fusionx-server", nbf: now - 10, exp: now + 60, video: { room, roomAdmin: true } }, secret);
  const base = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/+$/, "");
  const res = await fetch(`${base}/twirp/livekit.RoomService/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ room, ...body }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null; // the room (or the person) is not there
  if (!res.ok) throw new Error(`LiveKit ${method}: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return (await res.json().catch(() => ({}))) as T;
}

function parseMeta(metadata: string | undefined): ParticipantMeta | null {
  try {
    const v = JSON.parse(metadata || "null") as ParticipantMeta | null;
    return v && typeof v.kind === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Everyone in the room now (empty when nobody has opened it yet). */
export async function listParticipants(room: string): Promise<RoomParticipant[]> {
  const data = await roomService<{ participants?: { identity: string; name?: string; metadata?: string; joined_at?: string | number }[] }>(
    "ListParticipants",
    room,
    {},
  );
  return (data?.participants ?? []).map((p) => ({
    identity: p.identity,
    name: p.name ?? "",
    metadata: p.metadata ?? "",
    joinedAt: Number(p.joined_at ?? 0),
    meta: parseMeta(p.metadata),
  }));
}

/** Disconnects one person from the room (no error if they already left). */
export async function removeParticipant(room: string, identity: string): Promise<void> {
  await roomService("RemoveParticipant", room, { identity });
}
