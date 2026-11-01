"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { qrSvgPath } from "@/lib/events/qr";
import { roomConfigured } from "@/lib/interview/livekit";
import { hashToken, makeQrToken } from "@/lib/meetings/qr";
import { friendlyDbError } from "@/lib/recruitment/shared";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
type Result = { ok: true } | { ok: false; error: string };
const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** "Can't make it", with a short reason to the host. An empty reason takes it back. */
export async function setCantMakeIt(meetingId: string, reason: string): Promise<Result> {
  const { supabase, user } = await signedIn();
  if (!user || !uuid.safeParse(meetingId).success) return { ok: false, error: "Please sign in." };
  const { error } = await supabase.rpc("meeting_cant_make_it", { p_meeting: meetingId, p_reason: reason.slice(0, 200) });
  if (error) return { ok: false, error: friendlyDbError(error.message, "That could not be saved.") };
  deliverEmailsAfterResponse();
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath("/meetings");
  return { ok: true };
}

export async function knock(meetingId: string, note: string): Promise<Result> {
  const { supabase, user } = await signedIn();
  if (!user || !uuid.safeParse(meetingId).success) return { ok: false, error: "Please sign in." };
  const { error } = await supabase.rpc("meeting_knock", { p_meeting: meetingId, p_note: note.slice(0, 140) });
  if (error) return { ok: false, error: friendlyDbError(error.message, "The knock did not go through.") };
  return { ok: true };
}

export async function setActionDone(itemId: string, done: boolean): Promise<Result> {
  const { supabase, user } = await signedIn();
  if (!user || !uuid.safeParse(itemId).success) return { ok: false, error: "Please sign in." };
  const { error } = await supabase.rpc("meeting_action_done", { p_item: itemId, p_done: done });
  if (error) return { ok: false, error: friendlyDbError(error.message, "That could not be saved.") };
  revalidatePath("/meetings");
  return { ok: true };
}

/**
 * The QR for joining on a phone: single use, 2 minutes, for this account and this
 * meeting. Only its hash is stored.
 */
export async function makeMeetingQr(meetingId: string, purpose: "join" | "move"): Promise<{ path: string; size: number; expiresAt: string } | { error: string }> {
  const { supabase, user } = await signedIn();
  if (!user || !uuid.safeParse(meetingId).success) return { error: "Please sign in." };
  if (!roomConfigured()) return { error: "The meeting room is not set up yet." };
  const { token, expiresAt } = makeQrToken(user.id, meetingId);
  const { error } = await supabase.rpc("meeting_qr_create", { p_meeting: meetingId, p_hash: hashToken(token), p_purpose: purpose, p_expires: expiresAt });
  if (error) return { error: "The QR could not be made." };
  const { path, size } = qrSvgPath(`${siteUrl()}/meetings/scan?t=${encodeURIComponent(token)}`);
  return { path, size, expiresAt };
}
