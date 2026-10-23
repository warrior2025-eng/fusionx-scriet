import { createHmac } from "node:crypto";

/**
 * LiveKit (livekit.com, free "Build" plan, no card) for the FusionX Interview
 * Room. SERVER ONLY: LIVEKIT_API_SECRET is read here and never leaves the
 * server; this file is imported only by server actions and server components.
 *
 * One room per interview slot, named after the slot; LiveKit creates it on the
 * first join. Access is the token: a short-lived JWT, signed with the API
 * secret, scoped to that one room and to what the person may send.
 *  - candidate: their real name, camera + microphone only (no screen share,
 *    no chat / data), valid from the early-join time until the slot ends plus grace
 *  - panel: room admin, camera + microphone + screen share + data
 *  - phone camera: camera only (no microphone, no screen share, no data)
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

/** "fx-" and the slot id without dashes: the same room every time for a slot. */
export function roomNameFor(slotId: string): string {
  return `fx-${slotId.replace(/-/g, "")}`;
}

export type TokenKind = "candidate" | "panel" | "phone";

const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");
const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

/**
 * A LiveKit access token for one room, usable to connect between `opensAt`
 * and `closesAt` (LiveKit checks it when connecting).
 */
export function accessToken(input: { slotId: string; kind: TokenKind; identity: string; name: string; opensAt: string; closesAt: string }): {
  serverUrl: string;
  token: string;
} {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) throw new Error("The interview room is not set up yet (LiveKit keys are missing).");

  const sources =
    input.kind === "panel" ? ["camera", "microphone", "screen_share", "screen_share_audio"] : input.kind === "phone" ? ["camera"] : ["camera", "microphone"];
  const claims = {
    iss: key,
    sub: input.identity.slice(0, 64),
    jti: input.identity.slice(0, 64),
    name: input.name.slice(0, 80),
    nbf: unix(input.opensAt),
    exp: unix(input.closesAt),
    metadata: JSON.stringify({ kind: input.kind }),
    video: {
      room: roomNameFor(input.slotId),
      roomJoin: true,
      canSubscribe: true,
      canPublish: true,
      canPublishData: input.kind === "panel",
      canPublishSources: sources,
      roomAdmin: input.kind === "panel",
    },
  };
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const signature = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return { serverUrl: url, token: `${head}.${body}.${signature}` };
}
