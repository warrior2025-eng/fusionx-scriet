import { after } from "next/server";
import { getOrganizationSettings } from "@/lib/data/organization";
import { siteName as defaultSiteName } from "@/lib/site-config";
import { getContent } from "@/lib/data/site-content";
import { createAdminClient } from "@/lib/supabase/server";
import { BATCH_LIMIT, emailConfig, sendBatch } from "./resend";
import { notificationEmail } from "./template";

/**
 * Notifications → email. The database keeps the queue (migration 0015): a
 * notification is waiting until it has been handed to the email provider.
 *
 * Nothing is sent unless RESEND_API_KEY and EMAIL_FROM are set on the server
 * and email is switched on in the admin panel (Settings). Sending never
 * blocks or breaks the page that caused it: it runs after the response, and
 * a failure leaves the notification in the queue for the next attempt.
 */

type Claimed = { id: string; email: string; full_name: string | null; title: string; body: string | null; link: string | null };

export type DeliveryReport = { state: "off" | "not_configured" | "sent" | "failed"; sent: number; error?: string };

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** Whether the server has what it needs to send, and whether an admin left it switched on. */
export async function emailStatus(): Promise<{ configured: boolean; enabled: boolean }> {
  const settings = await getContent("email.settings");
  return { configured: emailConfig() !== null && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), enabled: settings.enabled };
}

/**
 * Sends what is waiting, a batch at a time (at most three batches per call).
 * A notification whose last send failed is left until its wait is over
 * (15 minutes, 6 hours, then a day at a time); `force` tries it now.
 */
export async function deliverPendingEmails({ force = false }: { force?: boolean } = {}): Promise<DeliveryReport> {
  const config = emailConfig();
  if (!config || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { state: "not_configured", sent: 0 };

  // The switch and the site's name, read with the service client: this runs
  // after the response and must not depend on the request that caused it.
  const supabase = createAdminClient();
  const [{ data: stored }, { data: organization }] = await Promise.all([
    supabase.from("site_content").select("value").eq("key", "email.settings").maybeSingle(),
    supabase.from("organization_settings").select("chapter_name").maybeSingle(),
  ]);
  if ((stored?.value as { enabled?: boolean } | undefined)?.enabled === false) return { state: "off", sent: 0 };
  const siteName = (organization?.chapter_name as string | undefined) || defaultSiteName;
  let sent = 0;

  for (let round = 0; round < 3; round++) {
    const { data, error } = await supabase.rpc("claim_notification_emails", { p_limit: BATCH_LIMIT, p_force: force });
    if (error) return { state: "failed", sent, error: "The email queue could not be read. Has migration 0015 been run?" };
    const claimed = (data ?? []) as Claimed[];
    if (claimed.length === 0) break;

    const result = await sendBatch(
      claimed.map((n) => ({ to: n.email, ...notificationEmail({ siteName, siteUrl: siteUrl(), name: n.full_name, title: n.title, body: n.body, link: n.link }) })),
      config,
      claimed.map((n) => n.id).sort().join(","),
    );
    if (!result.ok) {
      // Back in the queue; each is tried at most five times, with a growing wait between tries.
      await supabase.rpc("release_notification_emails", { p_ids: claimed.map((n) => n.id) });
      console.error("email delivery failed:", result.error);
      return { state: "failed", sent, error: result.error };
    }
    sent += result.count;
    if (claimed.length < BATCH_LIMIT) break;
  }
  return { state: "sent", sent };
}

/**
 * Call from any server action (or layout) after which notifications may be
 * waiting. Returns at once; the sending happens after the response.
 */
export function deliverEmailsAfterResponse() {
  if (!emailConfig()) return;
  after(async () => {
    try {
      await deliverPendingEmails();
    } catch (error) {
      console.error("email delivery crashed:", error instanceof Error ? error.message : error);
    }
  });
}

/** One email straight to an address, outside the queue (the admin panel's test button). */
export async function sendTestEmail(to: string): Promise<DeliveryReport> {
  const config = emailConfig();
  if (!config) return { state: "not_configured", sent: 0 };
  const { chapter_name: siteName } = await getOrganizationSettings();
  const result = await sendBatch(
    [{ to, ...notificationEmail({ siteName, siteUrl: siteUrl(), name: null, title: "Test email", body: "Email from the site is working. Notifications will now also arrive like this.", link: "/notifications" }) }],
    config,
    `test:${to}:${Date.now()}`,
  );
  return result.ok ? { state: "sent", sent: 1 } : { state: "failed", sent: 0, error: result.error };
}
