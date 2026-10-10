"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { logAudit } from "@/lib/admin/audit";
import { authorize, FORBIDDEN } from "@/lib/admin/guard";
import { isUpload } from "@/lib/admin/storage";
import { listUsers } from "@/lib/admin/users";

/**
 * Admin actions for one event's registrations: issuing certificates, check-in
 * volunteers and signature images. Each re-checks the caller's permission,
 * and the database checks it again (migration 0012).
 */

const uuid = z.uuid();
const SIGNATURE_BUCKET = "certificate-assets";
const SIGNATURE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

function revalidate(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/registrations`);
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/profile/events");
}

/**
 * Issues certificates. With no registration: everyone who attended and has
 * none yet. With one: that person, which also re-issues (same serial, name
 * taken afresh from their profile).
 */
export async function issueCertificates(eventId: string, registrationId: string | null): Promise<ActionState> {
  const ctx = await authorize("certificates");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(eventId).success || (registrationId && !uuid.safeParse(registrationId).success)) {
    return fail("Unknown event.");
  }

  const { data, error } = await ctx.supabase.rpc("issue_certificates", {
    p_event: eventId,
    p_registration: registrationId,
  });
  if (error) {
    if (error.message.includes("not enabled")) {
      return fail("Certificates are switched off for this event. Turn them on in the event's settings first.");
    }
    console.error("issue_certificates failed:", error.message);
    return fail("Could not issue certificates. Please try again.");
  }

  // The database function writes the audit entry itself.
  const count = Number(data ?? 0);
  revalidate(eventId);
  if (registrationId) return ok(count ? "Certificate issued." : "Only someone who was checked in can get a certificate.");
  return ok(count ? `${count} certificate${count === 1 ? "" : "s"} issued.` : "Everyone who attended already has a certificate.");
}

/** Lets a member run check-in for this one event, without any admin access. */
export async function addVolunteer(eventId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("certificates");
  if (!ctx) return FORBIDDEN;
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!uuid.safeParse(eventId).success) return fail("Unknown event.");
  if (!email.success) return fail("Please fix the highlighted fields.", { email: "Enter the member's email address." });

  let users;
  try {
    users = await listUsers(ctx);
  } catch {
    return fail("The account list could not be read. Check that SUPABASE_SERVICE_ROLE_KEY is set on the server.");
  }
  const person = users.find((u) => u.email.toLowerCase() === email.data);
  if (!person) return fail("Please fix the highlighted fields.", { email: "No account uses that email address." });
  if (!person.isActive) return fail("Please fix the highlighted fields.", { email: "That account is deactivated." });

  const { error } = await ctx.supabase
    .from("event_volunteers")
    .insert({ event_id: eventId, user_id: person.id, added_by: ctx.user.id });
  if (error && error.code !== "23505") return fail("Could not add this volunteer.");

  await logAudit(ctx, {
    action: "added_volunteer",
    table: "event_volunteers",
    id: eventId,
    after: { volunteer: person.fullName },
  });
  revalidate(eventId);
  return ok(`${person.fullName} can now run check-in for this event.`);
}

export async function removeVolunteer(eventId: string, userId: string): Promise<ActionState> {
  const ctx = await authorize("certificates");
  if (!ctx) return FORBIDDEN;
  const { data, error } = await ctx.supabase
    .from("event_volunteers")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data?.length) return fail("Could not remove this volunteer.");

  await logAudit(ctx, { action: "removed_volunteer", table: "event_volunteers", id: eventId, before: { user_id: userId } });
  revalidate(eventId);
  return ok("Volunteer removed.");
}

/**
 * Uploads or removes a signatory's signature image. Stored privately; it is
 * only ever read on the server, to print on that event's certificates.
 */
export async function saveSignature(
  eventId: string,
  slot: 1 | 2,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await authorize("certificates");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(eventId).success || (slot !== 1 && slot !== 2)) return fail("Unknown event.");

  const column = `signatory_${slot}_signature_path`;
  const { data: event } = await ctx.supabase.from("events").select(`id, ${column}`).eq("id", eventId).maybeSingle();
  if (!event) return fail("This event no longer exists.");
  const previous = (event as unknown as Record<string, string | null>)[column];

  const file = formData.get("signature");
  const remove = formData.get("signature__remove") === "on";
  let next: string | null = previous;

  if (isUpload(file)) {
    const extension = SIGNATURE_TYPES[file.type];
    if (!extension) return fail("Please fix the highlighted fields.", { signature: "Use a PNG or JPEG image." });
    if (file.size > 1024 * 1024) return fail("Please fix the highlighted fields.", { signature: "Keep the image under 1MB." });
    if (formData.get("permission") !== "on") {
      return fail("Please fix the highlighted fields.", {
        permission: "Confirm that this person has agreed to their signature being used.",
      });
    }
    next = `${eventId}/signatory-${slot}-${Date.now()}.${extension}`;
    const { error } = await ctx.supabase.storage.from(SIGNATURE_BUCKET).upload(next, file, { contentType: file.type });
    if (error) return fail("Could not upload the image. Please try again.");
  } else if (remove) {
    next = null;
  } else {
    return fail("Choose an image to upload.");
  }

  const { error } = await ctx.supabase.from("events").update({ [column]: next }).eq("id", eventId);
  if (error) {
    if (next && next !== previous) await ctx.supabase.storage.from(SIGNATURE_BUCKET).remove([next]);
    return fail("Could not save. Please try again.");
  }
  if (previous && previous !== next) await ctx.supabase.storage.from(SIGNATURE_BUCKET).remove([previous]);

  await logAudit(ctx, {
    action: next ? "uploaded_signature" : "removed_signature",
    table: "events",
    id: eventId,
    note: `Signatory ${slot}`,
  });
  revalidate(eventId);
  return ok(next ? "Signature saved. It will appear on this event's certificates." : "Signature removed.");
}
