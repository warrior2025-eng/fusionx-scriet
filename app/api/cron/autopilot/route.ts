import { timingSafeEqual } from "node:crypto";
import { deliverPendingEmails } from "@/lib/email/outbox";
import { sendPendingPushes } from "@/lib/push/server";
import { dailyOpportunities, dailyTool, monthlyResearch, nightlyCleanup, refreshAi, weeklyIdeas } from "@/lib/autopilot/auto";
import { createAdminClient } from "@/lib/supabase/server";

// The morning jobs read pages and wait for the model.
export const maxDuration = 60;

// "force" (with the secret only) runs a job again the same day, or research on a later Sunday: for an admin re-run or a test.
const JOBS: Record<string, (force: boolean) => Promise<Record<string, unknown>>> = {
  tools: (force: boolean) => dailyTool(force),
  opportunities: () => dailyOpportunities(),
  cleanup: () => nightlyCleanup(),
  ai: () => refreshAi(),
  ideas: (force: boolean) => weeklyIdeas(force),
  research: (force: boolean) => monthlyResearch(force),
};

/**
 * Autopilot's jobs (migrations 0042–0045), called by Supabase pg_cron through pg_net
 * (supabase/setup/autopilot_cron.sql) with the CRON_SECRET the other jobs already use.
 *  - no ?job: every 5 minutes, autopilot_tick() (master switch, levels, pauses), then waiting emails and pushes.
 *  - ?job=tools (6:00 IST) | opportunities (7:00) | cleanup (00:05) | ai (7:30) | ideas (Sunday 9:00) | research (first Sunday 9:00).
 * Each job respects the master switch, its own pause, its level and the daily AI cap, and logs what it did.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 503 });

  const url = new URL(request.url);
  const job = url.searchParams.get("job");
  const force = url.searchParams.get("force") === "1";
  if (job) {
    if (!(job in JOBS)) return Response.json({ error: "Unknown job" }, { status: 400 });
    const result = await JOBS[job](force).catch((e: unknown) => ({ state: "failed", error: e instanceof Error ? e.message : "crashed" }));
    const [email, push] = await Promise.all([deliverPendingEmails().catch(() => ({ state: "failed", sent: 0 })), sendPendingPushes().catch(() => 0)]);
    return Response.json({ ok: true, job, ran_at: new Date().toISOString(), result, email: { state: email.state, sent: email.sent }, push });
  }

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
