import { timingSafeEqual } from "node:crypto";
import { deliverPendingEmails } from "@/lib/email/outbox";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * The interview reminder job (migration 0027), meant to be called every
 * minute by Supabase pg_cron through pg_net (supabase/setup/
 * interview_reminders_cron.sql), with the CRON_SECRET as a Bearer token. Vercel's
 * free plan runs its own cron at most once a day, so it cannot do this.
 *
 * It writes the due reminders (send_interview_reminders: once per booking and
 * slot time) and sends the waiting emails. Safe to call any number of times.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 503 });

  const { data, error } = await createAdminClient().rpc("send_interview_reminders");
  if (error) {
    console.error("interview reminders failed:", error.message);
    return Response.json({ error: "The job could not run. Has migration 0027 been run?" }, { status: 500 });
  }
  const email = await deliverPendingEmails().catch((e: unknown) => ({ state: "failed", sent: 0, error: e instanceof Error ? e.message : "crashed" }));
  return Response.json({ ok: true, ran_at: new Date().toISOString(), reminders: data, email: { state: email.state, sent: email.sent } });
}
