import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { keys } from "@/lib/interview/livekit";

/**
 * The "Join on phone" token: bound to one person and one meeting, signed with an
 * HMAC, valid for 2 minutes and once. SERVER ONLY. The database keeps only its hash
 * and decides whether it was used. The key is derived from the LiveKit secret, so
 * there is no new secret to set up.
 */

export const QR_SECONDS = 120;

const key = () => createHmac("sha256", keys().secret).update("fx-meeting-qr").digest();
const mac = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function makeQrToken(userId: string, meetingId: string): { token: string; expiresAt: string } {
  const expiresAt = new Date(Date.now() + QR_SECONDS * 1000).toISOString();
  const payload = Buffer.from(JSON.stringify({ u: userId, m: meetingId, e: expiresAt, n: randomBytes(8).toString("hex") })).toString("base64url");
  return { token: `${payload}.${mac(payload)}`, expiresAt };
}

/** The token's contents if its signature is right, whatever its age: the database judges the rest. */
export function readQrToken(token: string): { userId: string; meetingId: string } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const wanted = Buffer.from(mac(payload));
  const given = Buffer.from(signature);
  if (wanted.length !== given.length || !timingSafeEqual(wanted, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u?: string; m?: string };
    return data.u && data.m ? { userId: data.u, meetingId: data.m } : null;
  } catch {
    return null;
  }
}
