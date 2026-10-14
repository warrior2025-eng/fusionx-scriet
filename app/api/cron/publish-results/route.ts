import { timingSafeEqual } from "node:crypto";
import { deliverPendingEmails } from "@/lib/email/outbox";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * The scheduled job (vercel.json calls it; Vercel sends the CRON_SECRET as a
 * Bearer token). It closes cycles past their deadline, publishes results that
 * are due and releases expired offers, all in one database function that is
 * safe to run any number of times, then sends the waiting emails.
 *
 * The results do not wait for this: the database shows them from the publish
 * time on by its own clock. This only flips the status and sends the
 * notifications if no visitor has done so already.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 503 });

  const { data, error } = await createAdminClient().rpc("recruitment_run_due_jobs");
  if (error) {
    console.error("recruitment cron failed:", error.message);
    return Response.json({ error: "The job could not run. Has migration 0017 been run?" }, { status: 500 });
  }
  const email = await deliverPendingEmails().catch((e: unknown) => ({ state: "failed", sent: 0, error: e instanceof Error ? e.message : "crashed" }));
  return Response.json({ ok: true, ran_at: new Date().toISOString(), jobs: data, email: { state: email.state, sent: email.sent } });
}
