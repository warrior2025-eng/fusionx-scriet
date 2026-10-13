import { createHash } from "node:crypto";

/**
 * Sends email through Resend's HTTP API (https://resend.com/docs). Plain
 * fetch, no package. Server only: the API key must never reach the browser.
 *
 * Environment:
 *   RESEND_API_KEY  the key from the Resend dashboard
 *   EMAIL_FROM      the sender, e.g. "FusionX@SCRIET <notifications@fxscriet.com>"
 *                   (the domain has to be verified in Resend)
 *   EMAIL_API_URL   optional; only for pointing at a stand-in while testing
 */

export type OutgoingEmail = { to: string; subject: string; html: string; text: string };
export type SendResult = { ok: true; count: number } | { ok: false; error: string };

const BATCH_URL = "https://api.resend.com/emails/batch";
/** Resend takes at most 100 emails in one batch call. */
export const BATCH_LIMIT = 100;

export function emailConfig(): { apiKey: string; from: string; endpoint: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from, endpoint: process.env.EMAIL_API_URL?.trim() || BATCH_URL };
}

/**
 * One call for up to 100 emails. `key` identifies this batch (the ids it was
 * built from): if the same batch is posted twice within a day, Resend sends
 * it once.
 */
export async function sendBatch(
  emails: OutgoingEmail[],
  config: { apiKey: string; from: string; endpoint: string },
  key: string,
): Promise<SendResult> {
  if (emails.length === 0) return { ok: true, count: 0 };
  if (emails.length > BATCH_LIMIT) return { ok: false, error: `A batch holds at most ${BATCH_LIMIT} emails` };
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": createHash("sha256").update(key).digest("hex"),
      },
      body: JSON.stringify(emails.map((email) => ({ from: config.from, to: [email.to], subject: email.subject, html: email.html, text: email.text }))),
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) return { ok: true, count: emails.length };
    // The provider's reason (wrong key, unverified domain, daily limit…), never the key itself.
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    return { ok: false, error: `Email provider answered ${response.status}${detail ? `: ${detail}` : ""}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The email provider could not be reached" };
  }
}
