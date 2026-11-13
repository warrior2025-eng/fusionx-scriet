import { after } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/server";
import { socialLinks } from "@/lib/site-config";

/**
 * Phone notifications (web push). The VAPID keys are made by the server the first time they are
 * needed and kept in `server_secrets` (migration 0042: no API access for anyone; only this code,
 * with the service key, reads it). Only the public key ever leaves the server.
 *
 * Every notification row can also be pushed once: ap_claim_pushes() hands out the ones not pushed
 * yet, for people who subscribed and kept push on, and marks them. Nothing here needs an
 * environment variable beyond the service key the site already has.
 */

type Keys = { publicKey: string; privateKey: string };
let cached: Keys | null = null;

export function pushConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export async function vapidKeys(): Promise<Keys | null> {
  if (cached) return cached;
  if (!pushConfigured()) return null;
  const admin = createAdminClient();
  const read = async () => {
    const { data } = await admin.from("server_secrets").select("name, value").in("name", ["vapid_public", "vapid_private"]);
    const map = new Map((data ?? []).map((r) => [r.name as string, r.value as string]));
    return map.get("vapid_public") && map.get("vapid_private") ? { publicKey: map.get("vapid_public")!, privateKey: map.get("vapid_private")! } : null;
  };
  let keys = await read();
  if (!keys) {
    const made = webpush.generateVAPIDKeys();
    // Two servers making keys at once: the first insert wins and both read it back.
    await admin.from("server_secrets").upsert(
      [{ name: "vapid_public", value: made.publicKey }, { name: "vapid_private", value: made.privateKey }],
      { onConflict: "name", ignoreDuplicates: true },
    );
    keys = await read();
  }
  cached = keys;
  return keys;
}

export async function vapidPublicKey(): Promise<string | null> {
  return (await vapidKeys())?.publicKey ?? null;
}

type Claimed = { notification_id: string; user_id: string; title: string; body: string | null; link: string | null; endpoint: string; p256dh: string; auth: string };

/** Sends what is waiting. Gone subscriptions (404/410) are removed. Returns how many were delivered. */
export async function sendPendingPushes(): Promise<number> {
  const keys = await vapidKeys();
  if (!keys) return 0;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("ap_claim_pushes", { p_limit: 200 });
  if (error) {
    console.error("push queue could not be read:", error.message);
    return 0;
  }
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://fxscriet.com").replace(/\/$/, "");
  // Push services accept only an https: or mailto: contact.
  const subject = site.startsWith("https://") ? `${site}/contact` : `mailto:${socialLinks.email}`;
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    ((data ?? []) as Claimed[]).map(async (n) => {
      try {
        await webpush.sendNotification(
          { endpoint: n.endpoint, keys: { p256dh: n.p256dh, auth: n.auth } },
          JSON.stringify({ title: n.title, body: n.body ?? "", url: n.link ? new URL(n.link, site).toString() : `${site}/my-work`, tag: n.notification_id }),
          { vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 60 * 60 * 24 },
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(n.endpoint);
        else console.error("push failed:", status ?? (e instanceof Error ? e.message : e));
      }
    }),
  );
  if (gone.length) await admin.from("push_subscriptions").delete().in("endpoint", gone);
  if (sent) await admin.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).in("endpoint", ((data ?? []) as Claimed[]).map((n) => n.endpoint).filter((e) => !gone.includes(e)));
  return sent;
}

/** After a write that may have made notifications: push them once the response is sent. */
export function pushAfterResponse() {
  if (!pushConfigured()) return;
  after(async () => {
    try {
      await sendPendingPushes();
    } catch (error) {
      console.error("push delivery crashed:", error instanceof Error ? error.message : error);
    }
  });
}
