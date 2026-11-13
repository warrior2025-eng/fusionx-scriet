import { timingSafeEqual } from "node:crypto";
import { deliverPendingEmails } from "@/lib/email/outbox";
import { sendPendingPushes } from "@/lib/push/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Autopilot's job (migration 0042), called by Supabase pg_cron through pg_net every 5 minutes
 * (supabase/setup/autopilot_cron.sql) with the CRON_SECRET the other jobs already use. Runs
 * autopilot_tick() (which obeys Control: the master switch, the levels and the pauses), then sends
 * the waiting emails and phone notifications. Safe to call any number of times.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 503 });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("autopilot_tick", {});
  if (error) {
    console.error("autopilot run failed:", error.message);
    return Response.json({ error: "The run failed. Has migration 0042 been run?" }, { status: 500 });
  }
  const [email, push] = await Promise.all([
    deliverPendingEmails().catch((e: unknown) => ({ state: "failed", sent: 0, error: e instanceof Error ? e.message : "crashed" })),
    sendPendingPushes().catch(() => 0),
  ]);
  return Response.json({ ok: true, ran_at: new Date().toISOString(), result: data, email: { state: email.state, sent: email.sent }, push });
}
