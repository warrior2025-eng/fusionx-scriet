"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { friendlyDbError } from "@/lib/recruitment/data";
import { createClient } from "@/lib/supabase/server";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";

/**
 * The applicant's side of recruitment. Each action validates its input here,
 * then calls a database function that enforces the rules that matter (is the
 * cycle open, is the team taking applications, is this person eligible), so
 * skipping this file would not get an application in.
 */

export type RecruitmentResult = { ok: boolean; message?: string };

const uuid = z.string().uuid();
const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Use a full https:// link");

const draftSchema = z.object({
  full_name: z.string().trim().max(160),
  department: z.string().trim().max(120),
  year: z.string().trim().max(40),
  preferences: z.array(uuid).max(4),
  answers: z.record(z.string().uuid(), z.union([z.string().max(5000), z.array(z.string().max(300)).max(30)])),
  links: z.object({ portfolio: optionalUrl, github: optionalUrl, linkedin: optionalUrl }),
  resume_path: z.string().max(300).nullable(),
  /** "My name and hub may be announced if I am selected or waitlisted." Stored on its own (migration 0017). */
  public_consent: z.boolean().optional(),
  /** Honeypot: a real person never fills this in. */
  website: z.string().max(0).optional(),
});

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function parseDraft(input: unknown) {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.path[0] === "website" ? "Could not save." : (issue?.message ?? "Please check the form.") };
  }
  const { website: _honeypot, public_consent: consent, ...data } = parsed.data;
  void _honeypot;
  return { data, consent };
}

/** Saves the draft as it stands (called while the form is being filled in). */
export async function saveRecruitmentDraft(cycleId: string, input: unknown): Promise<RecruitmentResult> {
  if (!uuid.safeParse(cycleId).success) return { ok: false, message: "Recruitment not found." };
  const draft = parseDraft(input);
  if ("error" in draft) return { ok: false, message: draft.error };
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, message: "Please sign in to apply." };

  const { error } = await supabase.rpc("save_recruitment_draft", { p_cycle: cycleId, p_data: draft.data });
  if (error) return { ok: false, message: friendlyDbError(error.message, "Could not save your draft. Please try again.") };
  // Before migration 0017 this function does not exist; the application itself is saved either way.
  if (draft.consent !== undefined) await supabase.rpc("set_recruitment_consent", { p_cycle: cycleId, p_agree: draft.consent });
  return { ok: true };
}

export async function submitRecruitmentApplication(cycleId: string, input: unknown): Promise<RecruitmentResult> {
  const saved = await saveRecruitmentDraft(cycleId, input);
  if (!saved.ok) return saved;
  const { supabase } = await signedIn();
  const { error } = await supabase.rpc("submit_recruitment_application", { p_cycle: cycleId });
  if (error) return { ok: false, message: friendlyDbError(error.message, "Could not submit. Please try again.") };
  revalidatePath("/recruitment");
  revalidatePath("/recruitment/status");
  deliverEmailsAfterResponse();
  return { ok: true };
}

/** Withdraws a submitted application. Allowed until results are published. */
export async function withdrawRecruitmentApplication(cycleId: string): Promise<ActionState> {
  if (!uuid.safeParse(cycleId).success) return fail("Recruitment not found.");
  const { supabase, user } = await signedIn();
  if (!user) return fail("Please sign in.");
  const { error } = await supabase.rpc("withdraw_recruitment_application", { p_cycle: cycleId });
  if (error) return fail(friendlyDbError(error.message, "Could not withdraw. Please try again."));
  revalidatePath("/recruitment");
  revalidatePath("/recruitment/status");
  return ok("Your application was withdrawn.");
}

const MAX_PDF = 3 * 1024 * 1024;

/**
 * Uploads a PDF into the applicant's own folder for this cycle. `slot` is
 * "resume" or a question id. The storage policies allow nothing else: not
 * another person's folder, and not a cycle that is closed.
 */
export async function uploadRecruitmentFile(
  cycleId: string,
  slot: string,
  formData: FormData,
): Promise<{ path?: string; message?: string }> {
  if (!uuid.safeParse(cycleId).success) return { message: "Recruitment not found." };
  if (slot !== "resume" && !uuid.safeParse(slot).success) return { message: "Unknown file." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Choose a PDF file." };
  if (file.size > MAX_PDF) return { message: "The file must be 3MB or smaller." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  // "%PDF-": the file's own signature, whatever its name or declared type says.
  if (file.type !== "application/pdf" || String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") {
    return { message: "Only PDF files are accepted." };
  }

  const { supabase, user } = await signedIn();
  if (!user) return { message: "Please sign in to apply." };
  const path = `${user.id}/${cycleId}/${slot}.pdf`;
  const { error } = await supabase.storage
    .from("recruitment-resumes")
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) return { message: "Could not upload the file. Applications may be closed." };
  return { path };
}

/** A short-lived link to a recruitment file the caller is allowed to read. */
export async function recruitmentFileUrl(path: string): Promise<{ url?: string; message?: string }> {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-z0-9-]+\.pdf$/i.test(path)) return { message: "File not found." };
  const { supabase, user } = await signedIn();
  if (!user) return { message: "Please sign in." };
  const { data, error } = await supabase.storage.from("recruitment-resumes").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return { message: "File not found." };
  return { url: data.signedUrl };
}
