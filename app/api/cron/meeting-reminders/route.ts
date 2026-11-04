import { timingSafeEqual } from "node:crypto";
import { deliverPendingEmails } from "@/lib/email/outbox";
import { roomConfigured } from "@/lib/interview/livekit";
import { closeRoom, roomHasPeople } from "@/lib/meetings/livekit";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * The meeting reminder job (migration 0032), called every minute by Supabase
 * pg_cron through pg_net (supabase/setup/meeting_reminders_cron.sql), with the
 * CRON_SECRET as a Bearer token. Writes the reminders due 10 minutes before a
 * start, closes meetings nobody ended or whose room has been empty for 5 minutes
 * (migration 0037), and sends the waiting emails. Safe to call any number of times.
 *
 * Before anything is ended, LiveKit is asked about every room nobody has checked in to
 * for a minute: one with someone connected is marked as occupied, so it stays live.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 503 });

  const admin = createAdminClient();
  if (roomConfigured()) {
    const { data: ids } = await admin.rpc("meeting_rooms_to_check");
    const occupied: string[] = [];
    for (const id of (ids ?? []) as string[]) if (await roomHasPeople(id)) occupied.push(id);
    if (occupied.length) await admin.rpc("meeting_mark_occupied", { p_ids: occupied });
  }
  const { data, error } = await admin.rpc("send_meeting_reminders");
  if (error) {
    console.error("meeting reminders failed:", error.message);
    return Response.json({ error: "The job could not run. Has migration 0032 been run?" }, { status: 500 });
  }
  if (roomConfigured()) for (const id of ((data as { emptied?: string[] } | null)?.emptied ?? [])) await closeRoom(id);
  const email = await deliverPendingEmails().catch((e: unknown) => ({ state: "failed", sent: 0, error: e instanceof Error ? e.message : "crashed" }));
  return Response.json({ ok: true, ran_at: new Date().toISOString(), result: data, email: { state: email.state, sent: email.sent } });
}
