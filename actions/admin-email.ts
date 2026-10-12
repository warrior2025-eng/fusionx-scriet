"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { logAudit } from "@/lib/admin/audit";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { deliverPendingEmails, sendTestEmail, type DeliveryReport } from "@/lib/email/outbox";

/** The provider's own explanation, in words an admin can act on. */
function explain(report: DeliveryReport): string {
  if (report.state === "not_configured") return "Email is not set up on the server yet: RESEND_API_KEY and EMAIL_FROM are missing.";
  if (report.state === "off") return "Email is switched off. Turn it on above first.";
  return report.error ?? "The email could not be sent.";
}

/** Sends one test email to the admin's own address. */
export async function sendTestEmailToMe(): Promise<ActionState> {
  const ctx = await authorize("settings");
  if (!ctx) return FORBIDDEN;
  if (!ctx.user.email) return fail("Your account has no email address.");
  const report = await sendTestEmail(ctx.user.email);
  if (report.state !== "sent") return fail(explain(report));
  await logAudit(ctx, { action: "sent_test_email", table: "notifications" });
  return ok(`Test email sent to ${ctx.user.email}. Check the inbox, and the spam folder.`);
}

/** Sends whatever is waiting in the queue now, instead of on the next action. */
export async function sendWaitingEmails(): Promise<ActionState> {
  const ctx = await authorize("settings");
  if (!ctx) return FORBIDDEN;
  const report = await deliverPendingEmails();
  revalidatePath("/admin/settings");
  if (report.state !== "sent") return fail(explain(report));
  return ok(report.sent === 0 ? "Nothing was waiting." : `${report.sent} email${report.sent === 1 ? "" : "s"} sent.`);
}
