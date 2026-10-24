"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { cleanUpDayRoom } from "@/lib/interview/day-room";
import { accessToken, roomNameForDay } from "@/lib/interview/livekit";
import { EVENT_TYPES, type RevealedQuestion } from "@/lib/interview/shared";
import { qrSvgPath } from "@/lib/events/qr";
import { friendlyDbError } from "@/lib/recruitment/data";
import { createClient } from "@/lib/supabase/server";

/**
 * The candidate's side of the FusionX Interview Room. Every call goes through
 * a database function that checks the booking is the caller's own, live, and
 * inside its time window (migrations 0023 and 0024); the LiveKit API secret
 * stays here on the server.
 */

const uuid = z.string().uuid();
type Result<T> = ({ ok: true } & T) | { ok: false; message: string };

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** "I agree" on the monitoring notice. */
export async function giveConsent(bookingId: string): Promise<Result<object>> {
  if (!uuid.safeParse(bookingId).success) return { ok: false, message: "Interview not found." };
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, message: "Please sign in." };
  const agent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const { error } = await supabase.rpc("give_interview_consent", { p_booking: bookingId, p_agent: agent });
  if (error) return { ok: false, message: friendlyDbError(error.message, "Could not save. Please try again.") };
  return { ok: true };
}

/**
 * The video server and the candidate's own short-lived token for the day's
 * room: valid from their slot's join time until it ends, refused outside it.
 * Each join also runs the day room's clean-up once (after the response), so
 * the previous slot's candidates are gone even if no panel screen is open.
 */
export async function joinInterview(bookingId: string): Promise<Result<{ serverUrl: string; token: string }>> {
  if (!uuid.safeParse(bookingId).success) return { ok: false, message: "Interview not found." };
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, message: "Please sign in." };
  const { data, error } = await supabase.rpc("interview_join_info", { p_booking: bookingId });
  if (error || !data) return { ok: false, message: friendlyDbError(error?.message ?? "", "You can't join this interview.") };
  const info = data as { slot_id: string; day_id?: string; ends_at: string; opens_at: string; closes_at: string; name: string };
  if (!info.day_id) return { ok: false, message: "The interview room is being updated (database migration 0024). Please wait for the panel." };
  const dayId = info.day_id;
  try {
    const { serverUrl, token } = accessToken({
      room: roomNameForDay(dayId),
      kind: "candidate",
      identity: bookingId,
      name: info.name,
      opensAt: info.opens_at,
      closesAt: info.closes_at,
      meta: { booking_id: bookingId, slot_id: info.slot_id, slot_ends_at: info.ends_at },
    });
    after(async () => {
      try {
        await cleanUpDayRoom(await createClient(), dayId);
      } catch (e) {
        console.error("day room clean-up failed:", e instanceof Error ? e.message : e);
      }
    });
    return { ok: true, serverUrl, token };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not open the interview room." };
  }
}

const eventSchema = z
  .array(
    z.object({
      type: z.enum(EVENT_TYPES),
      at: z.string().datetime(),
      detail: z.record(z.string(), z.union([z.string().max(120), z.number(), z.boolean()])).optional(),
    }),
  )
  .min(1)
  .max(50);

type Removal = { reason: "left_screen" | "panel"; day_id: string } | null;

/**
 * A batch of integrity events (the database rate-limits per person). When the
 * day removes candidates for leaving the screen (migration 0025) and this
 * batch reached the limit, the answer says so and they are taken out of the
 * call at once.
 */
export async function logInterviewEvents(bookingId: string, events: unknown): Promise<Result<{ saved: number; removed: "left_screen" | "panel" | null }>> {
  if (!uuid.safeParse(bookingId).success) return { ok: false, message: "Interview not found." };
  const parsed = eventSchema.safeParse(events);
  if (!parsed.success) return { ok: false, message: "Invalid events." };
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, message: "Please sign in." };
  const { data, error } = await supabase.rpc("log_interview_events", { p_booking: bookingId, p_events: parsed.data });
  if (error) return { ok: false, message: friendlyDbError(error.message, "Could not save.") };
  const counted = parsed.data.some((e) => e.type === "left_screen" || e.type === "returned_screen");
  const removal = counted ? (((await supabase.rpc("my_room_removal", { p_booking: bookingId })).data ?? null) as Removal) : null;
  if (removal) {
    after(async () => {
      try {
        await cleanUpDayRoom(await createClient(), removal.day_id);
      } catch (e) {
        console.error("day room clean-up failed:", e instanceof Error ? e.message : e);
      }
    });
  }
  return { ok: true, saved: Number(data ?? 0), removed: removal?.reason ?? null };
}

/** Whether the candidate was taken out of their slot (for leaving the screen, or by the panel). */
export async function myRemoval(bookingId: string): Promise<"left_screen" | "panel" | null> {
  if (!uuid.safeParse(bookingId).success) return null;
  const { supabase, user } = await signedIn();
  if (!user) return null;
  const { data } = await supabase.rpc("my_room_removal", { p_booking: bookingId });
  return ((data ?? null) as Removal)?.reason ?? null;
}

/** The questions the panel has revealed to the candidate's slot (never the others). */
export async function myInterviewQuestions(bookingId: string): Promise<RevealedQuestion[]> {
  if (!uuid.safeParse(bookingId).success) return [];
  const { supabase, user } = await signedIn();
  if (!user) return [];
  const { data, error } = await supabase.rpc("my_interview_questions", { p_booking: bookingId });
  return error || !Array.isArray(data) ? [] : (data as RevealedQuestion[]);
}

/** A 10-minute link (and its QR code) for the phone camera. Only the token's hash is stored. */
export async function phoneCameraLink(bookingId: string): Promise<Result<{ url: string; expiresAt: string; qr: { path: string; size: number } }>> {
  if (!uuid.safeParse(bookingId).success) return { ok: false, message: "Interview not found." };
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, message: "Please sign in." };
  const token = randomBytes(24).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await supabase.rpc("create_phone_link", { p_booking: bookingId, p_hash: hash });
  if (error) return { ok: false, message: friendlyDbError(error.message, "Could not make the phone link.") };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  // The site the candidate is on (a Vercel preview links to itself); http only for a local machine.
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host ?? "") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? "");
  const url = `${origin}/recruitment/interview/phone?t=${token}`;
  return { ok: true, url, expiresAt: String(data), qr: qrSvgPath(url, 2) };
}

/** Whether the candidate's day is still in the website room (the admin can switch it back to Google Meet at any time). */
export async function roomStillOn(bookingId: string): Promise<boolean> {
  if (!uuid.safeParse(bookingId).success) return false;
  const { supabase, user } = await signedIn();
  if (!user) return false;
  const { error } = await supabase.rpc("interview_join_info", { p_booking: bookingId });
  return !(error && /not in the website room/.test(error.message));
}
