"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, zodFieldErrors, type ActionState } from "@/lib/admin/action-state";
import { logAudit } from "@/lib/admin/audit";
import { authorize, FORBIDDEN, type AdminContext } from "@/lib/admin/guard";
import { isUpload, removeByUrl, uploadImage } from "@/lib/admin/storage";
import { listUsers } from "@/lib/admin/users";
import { fromIstInput } from "@/lib/events/format";
import { STAGES, friendlyDbError } from "@/lib/recruitment/data";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";

/**
 * Recruitment, from the admin panel.
 *
 *  - "recruitment.content" (editors and up): the words. A cycle's text and
 *    dates, team descriptions, questions, message templates.
 *  - "recruitment" (admins): opening, closing and publishing; deleting;
 *    WhatsApp links; reviewers; moving applications between stages.
 *
 * The database policies and functions enforce the same split, so these
 * checks are the first line, not the only one.
 */

const uuid = z.string().uuid();
const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
};
const lines = (value: string) => [...new Set(value.split(/[\n,]+/).map((v) => v.trim()).filter(Boolean))];
const slugify = (value: string) =>
  value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "team";

function touched(cycleId?: string) {
  // Notifications written by this action also go out as email, after the response.
  deliverEmailsAfterResponse();
  revalidatePath("/recruitment");
  revalidatePath("/recruitment/apply");
  revalidatePath("/", "layout");
  revalidatePath("/admin/recruitment");
  if (cycleId) revalidatePath(`/admin/recruitment/${cycleId}`, "layout");
}

// ── cycles ─────────────────────────────────────────────────────────────
const cycleSchema = z
  .object({
    title: z.string().min(1, "Add a title").max(160),
    description: z.string().max(3000),
    opens_at: z.string().max(40),
    closes_at: z.string().max(40),
    max_preferences: z.coerce.number({ message: "Enter a number" }).int().min(1, "At least 1").max(4, "At most 4"),
    allowed_years: z.array(z.string().max(40)).max(20),
    allowed_departments: z.array(z.string().max(120)).max(40),
  })
  .refine((v) => !v.opens_at || !v.closes_at || new Date(fromIstInput(v.closes_at)) > new Date(fromIstInput(v.opens_at)), {
    path: ["closes_at"],
    message: "The deadline must be after the opening time",
  });

export async function saveCycle(id: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("recruitment.content");
  if (!ctx) return FORBIDDEN;
  const parsed = cycleSchema.safeParse({
    title: text(formData, "title"),
    description: text(formData, "description"),
    opens_at: text(formData, "opens_at"),
    closes_at: text(formData, "closes_at"),
    max_preferences: text(formData, "max_preferences") || "2",
    allowed_years: lines(text(formData, "allowed_years")),
    allowed_departments: lines(text(formData, "allowed_departments")),
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const values = {
    ...parsed.data,
    description: parsed.data.description || null,
    opens_at: parsed.data.opens_at ? fromIstInput(parsed.data.opens_at) : null,
    closes_at: parsed.data.closes_at ? fromIstInput(parsed.data.closes_at) : null,
  };

  if (id === null) {
    const { data, error } = await ctx.supabase.from("recruitment_cycles").insert({ ...values, status: "draft", created_by: ctx.user.id }).select("id").single();
    if (error || !data) return fail("Could not create the cycle.");
    await logAudit(ctx, { action: "created", table: "recruitment_cycles", id: data.id as string, after: values });
    touched();
    return ok("Draft cycle created. Add its teams and questions next.", { redirectTo: `/admin/recruitment/${data.id}` });
  }
  if (!uuid.safeParse(id).success) return fail("Cycle not found.");
  const { data: before } = await ctx.supabase.from("recruitment_cycles").select("*").eq("id", id).maybeSingle();
  if (!before) return fail("Cycle not found.");
  const { error } = await ctx.supabase.from("recruitment_cycles").update(values).eq("id", id);
  if (error) return fail("Could not save the cycle.");
  await logAudit(ctx, { action: "updated", table: "recruitment_cycles", id, before, after: values });
  touched(id);
  return ok("Saved.", { viewHref: "/recruitment" });
}

/** "Open now" and "Close now" (and back to draft). Publishing results is its own action. */
export async function setCycleStatus(id: string, status: "draft" | "open" | "closed"): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const { data: before } = await ctx.supabase.from("recruitment_cycles").select("id, status, opens_at, closes_at").eq("id", id).maybeSingle();
  if (!before) return fail("Cycle not found.");
  if (before.status === "results_published") return fail("Results are already published for this cycle.");

  const now = new Date();
  const patch: Record<string, unknown> = { status };
  if (status === "open") {
    if (before.closes_at && new Date(before.closes_at as string) <= now) return fail("The deadline has passed. Set a later deadline, then open it.");
    const { count } = await ctx.supabase.from("recruitment_teams").select("id", { count: "exact", head: true }).eq("cycle_id", id).eq("is_visible", true);
    if (!count) return fail("Add at least one visible team before opening.");
    if (!before.opens_at || new Date(before.opens_at as string) > now) patch.opens_at = now.toISOString();
  }
  if (status === "closed" && (!before.closes_at || new Date(before.closes_at as string) > now)) patch.closes_at = now.toISOString();

  const { error } = await ctx.supabase.from("recruitment_cycles").update(patch).eq("id", id);
  if (error) return fail(friendlyDbError(error.message, "Could not change the status."));
  await logAudit(ctx, { action: `set_${status}`, table: "recruitment_cycles", id, before, after: patch });
  touched(id);
  return ok(status === "open" ? "The cycle is open for applications." : status === "closed" ? "The cycle is closed." : "Back to draft.", {
    viewHref: "/recruitment",
  });
}

export async function publishResults(id: string): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const { data: sent, error } = await ctx.supabase.rpc("publish_recruitment_results", { p_cycle: id });
  if (error) return fail(friendlyDbError(error.message, "Could not publish the results."));
  touched(id);
  revalidatePath("/recruitment/status");
  return ok(`Results published. ${sent ?? 0} candidate message${sent === 1 ? "" : "s"} sent.`, { viewHref: "/recruitment" });
}

/** A draft copy of a cycle with its teams and questions (no links, reviewers or applications). */
export async function duplicateCycle(id: string): Promise<ActionState> {
  const ctx = await authorize("recruitment.content");
  if (!ctx) return FORBIDDEN;
  const { data: cycle } = await ctx.supabase.from("recruitment_cycles").select("*").eq("id", id).maybeSingle();
  if (!cycle) return fail("Cycle not found.");
  const { data: copy, error } = await ctx.supabase
    .from("recruitment_cycles")
    .insert({
      title: `${String(cycle.title).slice(0, 150)} (copy)`,
      description: cycle.description,
      max_preferences: cycle.max_preferences,
      allowed_years: cycle.allowed_years,
      allowed_departments: cycle.allowed_departments,
      status: "draft",
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !copy) return fail("Could not duplicate the cycle.");

  const [{ data: teams }, { data: questions }] = await Promise.all([
    ctx.supabase.from("recruitment_teams").select("*").eq("cycle_id", id),
    ctx.supabase.from("recruitment_questions").select("*").eq("cycle_id", id),
  ]);
  // Everything but the columns that belong to the original row.
  const without = (row: Record<string, unknown>, keys: string[]) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
  const teamMap = new Map<string, string>();
  for (const team of (teams ?? []) as Record<string, unknown>[]) {
    const { data: made } = await ctx.supabase
      .from("recruitment_teams")
      .insert({ ...without(team, ["id", "created_at", "updated_at", "cycle_id"]), cycle_id: copy.id })
      .select("id")
      .single();
    if (made) teamMap.set(team.id as string, made.id as string);
  }
  const copies = ((questions ?? []) as Record<string, unknown>[]).map((q) => ({
    ...without(q, ["id", "created_at", "cycle_id", "team_id"]),
    cycle_id: copy.id,
    team_id: q.team_id ? (teamMap.get(q.team_id as string) ?? null) : null,
  }));
  if (copies.length) await ctx.supabase.from("recruitment_questions").insert(copies);

  await logAudit(ctx, { action: "duplicated", table: "recruitment_cycles", id: copy.id as string, note: `From ${cycle.title}` });
  touched();
  return ok("Duplicated as a draft.", { redirectTo: `/admin/recruitment/${copy.id}` });
}

export async function deleteCycle(id: string): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const { data: before } = await ctx.supabase.from("recruitment_cycles").select("id, title, status").eq("id", id).maybeSingle();
  if (!before) return fail("Cycle not found.");
  if (before.status !== "draft") return fail("Only a draft can be deleted.");
  const { data: gone, error } = await ctx.supabase.from("recruitment_cycles").delete().eq("id", id).select("id");
  if (error || !gone?.length) return fail("Could not delete the cycle.");
  await logAudit(ctx, { action: "deleted", table: "recruitment_cycles", id, before, after: null });
  touched();
  return ok("Draft deleted.", { redirectTo: "/admin/recruitment" });
}

// ── teams ──────────────────────────────────────────────────────────────
const teamSchema = z.object({
  name: z.string().min(1, "Add a name").max(120),
  short_description: z.string().max(300),
  responsibilities: z.string().max(2000),
  what_we_look_for: z.string().max(2000),
  seats: z.union([z.literal(""), z.coerce.number({ message: "Enter a number" }).int().min(0).max(500)]),
  emoji: z.string().max(8, "One emoji"),
  is_visible: z.boolean(),
  accepting_applications: z.boolean(),
});

export async function saveRecruitmentTeam(cycleId: string, teamId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("recruitment.content");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(cycleId).success) return fail("Cycle not found.");
  const parsed = teamSchema.safeParse({
    name: text(formData, "name"),
    short_description: text(formData, "short_description"),
    responsibilities: text(formData, "responsibilities"),
    what_we_look_for: text(formData, "what_we_look_for"),
    seats: text(formData, "seats"),
    emoji: text(formData, "emoji"),
    is_visible: formData.get("is_visible") === "on",
    accepting_applications: formData.get("accepting_applications") === "on",
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const { seats, ...rest } = parsed.data;
  const values: Record<string, unknown> = {
    ...rest,
    short_description: rest.short_description || null,
    responsibilities: rest.responsibilities || null,
    what_we_look_for: rest.what_we_look_for || null,
    emoji: rest.emoji || null,
    seats: seats === "" ? null : seats,
  };

  const { data: before } = teamId ? await ctx.supabase.from("recruitment_teams").select("*").eq("id", teamId).maybeSingle() : { data: null };
  if (teamId && !before) return fail("Team not found.");

  // Optional picture (the image bucket is admin-only, so this part needs an admin).
  const file = formData.get("image");
  let uploaded: string | null = null;
  if (isUpload(file)) {
    const result = await uploadImage(ctx.supabase, "site-assets", file, "recruitment-team");
    if ("error" in result) return fail("Please fix the highlighted fields.", { image: result.error });
    uploaded = result.url;
    values.image_path = uploaded;
  } else if (formData.get("image__remove") === "on") {
    values.image_path = null;
  }

  if (!teamId) {
    const { count } = await ctx.supabase.from("recruitment_teams").select("id", { count: "exact", head: true }).eq("cycle_id", cycleId);
    let slug = slugify(rest.name);
    const { data: clash } = await ctx.supabase.from("recruitment_teams").select("id").eq("cycle_id", cycleId).eq("slug", slug).maybeSingle();
    if (clash) slug = `${slug}-${(count ?? 0) + 1}`;
    const { data, error } = await ctx.supabase
      .from("recruitment_teams")
      .insert({ ...values, cycle_id: cycleId, slug, display_order: (count ?? 0) + 1 })
      .select("id")
      .single();
    if (error || !data) {
      if (uploaded) await removeByUrl(ctx.supabase, "site-assets", uploaded);
      return fail("Could not add the team.");
    }
    await logAudit(ctx, { action: "created", table: "recruitment_teams", id: data.id as string, after: values });
    touched(cycleId);
    return ok("Team added.", { viewHref: "/recruitment" });
  }
  const { error } = await ctx.supabase.from("recruitment_teams").update(values).eq("id", teamId);
  if (error) {
    if (uploaded) await removeByUrl(ctx.supabase, "site-assets", uploaded);
    return fail("Could not save the team.");
  }
  if ("image_path" in values && before?.image_path && before.image_path !== values.image_path) {
    await removeByUrl(ctx.supabase, "site-assets", before.image_path as string);
  }
  await logAudit(ctx, { action: "updated", table: "recruitment_teams", id: teamId, before, after: values });
  touched(cycleId);
  return ok("Saved.", { viewHref: "/recruitment" });
}

/** The private WhatsApp group link for a team. Empty removes it. Never written to the audit log. */
export async function setTeamWhatsapp(cycleId: string, teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const url = text(formData, "whatsapp_group_url");
  if (url && !/^https:\/\/\S{6,300}$/i.test(url)) return fail("Please fix the highlighted fields.", { whatsapp_group_url: "Use a full https:// link" });
  const { error } = url
    ? await ctx.supabase.from("recruitment_team_links").upsert({ team_id: teamId, whatsapp_group_url: url, updated_by: ctx.user.id }, { onConflict: "team_id" })
    : await ctx.supabase.from("recruitment_team_links").delete().eq("team_id", teamId);
  if (error) return fail("Could not save the link.");
  await logAudit(ctx, { action: url ? "set_whatsapp_link" : "removed_whatsapp_link", table: "recruitment_teams", id: teamId });
  revalidatePath(`/admin/recruitment/${cycleId}`, "layout");
  return ok(url ? "Link saved. Only selected candidates will see it, after results are published." : "Link removed.");
}

/** Moves a row one place up or down within its list. */
async function reorder(ctx: AdminContext, table: "recruitment_teams" | "recruitment_questions", cycleId: string, id: string, by: -1 | 1) {
  const { data } = await ctx.supabase.from(table).select("id, display_order, created_at").eq("cycle_id", cycleId).order("display_order").order("created_at");
  const ids = (data ?? []).map((r) => r.id as string);
  const at = ids.indexOf(id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= ids.length) return;
  [ids[at], ids[to]] = [ids[to], ids[at]];
  await Promise.all(ids.map((rowId, i) => ctx.supabase.from(table).update({ display_order: i + 1 }).eq("id", rowId)));
}

export async function moveRecruitmentTeam(cycleId: string, teamId: string, by: -1 | 1): Promise<ActionState> {
  const ctx = await authorize("recruitment.content");
  if (!ctx) return FORBIDDEN;
  await reorder(ctx, "recruitment_teams", cycleId, teamId, by);
  touched(cycleId);
  return ok("Order updated.");
}

export async function deleteRecruitmentTeam(cycleId: string, teamId: string): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const { data: before } = await ctx.supabase.from("recruitment_teams").select("id, name, image_path").eq("id", teamId).maybeSingle();
  if (!before) return fail("Team not found.");
  const { count } = await ctx.supabase.from("recruitment_team_status").select("application_id", { count: "exact", head: true }).eq("team_id", teamId);
  if (count) return fail("This team has applications. Hide it or stop it taking applications instead.");
  const { data: gone, error } = await ctx.supabase.from("recruitment_teams").delete().eq("id", teamId).select("id");
  if (error || !gone?.length) return fail("Could not delete the team.");
  if (before.image_path) await removeByUrl(ctx.supabase, "site-assets", before.image_path as string);
  await logAudit(ctx, { action: "deleted", table: "recruitment_teams", id: teamId, before, after: null });
  touched(cycleId);
  return ok("Team deleted.");
}

// ── questions ──────────────────────────────────────────────────────────
const questionSchema = z
  .object({
    team_id: z.union([z.literal(""), uuid]),
    label: z.string().min(1, "Add the question").max(300),
    help_text: z.string().max(300),
    type: z.enum(["short_text", "long_text", "url", "single_choice", "multi_choice", "file"]),
    options: z.array(z.string().max(120)).max(20, "At most 20 options"),
    required: z.boolean(),
    max_length: z.union([z.literal(""), z.coerce.number({ message: "Enter a number" }).int().min(1).max(5000)]),
  })
  .refine((v) => !["single_choice", "multi_choice"].includes(v.type) || v.options.length >= 2, {
    path: ["options"],
    message: "Add at least two options, one per line",
  });

export async function saveQuestion(cycleId: string, questionId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("recruitment.content");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(cycleId).success) return fail("Cycle not found.");
  const parsed = questionSchema.safeParse({
    team_id: text(formData, "team_id"),
    label: text(formData, "label"),
    help_text: text(formData, "help_text"),
    type: text(formData, "type"),
    options: lines(text(formData, "options")),
    required: formData.get("required") === "on",
    max_length: text(formData, "max_length"),
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const choice = parsed.data.type === "single_choice" || parsed.data.type === "multi_choice";
  const textual = parsed.data.type === "short_text" || parsed.data.type === "long_text";
  const values = {
    team_id: parsed.data.team_id || null,
    label: parsed.data.label,
    help_text: parsed.data.help_text || null,
    type: parsed.data.type,
    options: choice ? parsed.data.options : [],
    required: parsed.data.required,
    max_length: textual && parsed.data.max_length !== "" ? parsed.data.max_length : null,
  };

  if (!questionId) {
    const { count } = await ctx.supabase.from("recruitment_questions").select("id", { count: "exact", head: true }).eq("cycle_id", cycleId);
    const { data, error } = await ctx.supabase.from("recruitment_questions").insert({ ...values, cycle_id: cycleId, display_order: (count ?? 0) + 1 }).select("id").single();
    if (error || !data) return fail("Could not add the question.");
    await logAudit(ctx, { action: "created", table: "recruitment_questions", id: data.id as string, after: values });
    touched(cycleId);
    return ok("Question added.");
  }
  const { data: before } = await ctx.supabase.from("recruitment_questions").select("*").eq("id", questionId).maybeSingle();
  if (!before) return fail("Question not found.");
  const { error } = await ctx.supabase.from("recruitment_questions").update(values).eq("id", questionId);
  if (error) return fail("Could not save the question.");
  await logAudit(ctx, { action: "updated", table: "recruitment_questions", id: questionId, before, after: values });
  touched(cycleId);
  return ok("Saved.");
}

export async function moveQuestion(cycleId: string, questionId: string, by: -1 | 1): Promise<ActionState> {
  const ctx = await authorize("recruitment.content");
  if (!ctx) return FORBIDDEN;
  await reorder(ctx, "recruitment_questions", cycleId, questionId, by);
  touched(cycleId);
  return ok("Order updated.");
}

export async function deleteQuestion(cycleId: string, questionId: string): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const { data: before } = await ctx.supabase.from("recruitment_questions").select("id, label").eq("id", questionId).maybeSingle();
  if (!before) return fail("Question not found.");
  const { data: gone, error } = await ctx.supabase.from("recruitment_questions").delete().eq("id", questionId).select("id");
  if (error || !gone?.length) return fail("Could not delete the question.");
  await logAudit(ctx, { action: "deleted", table: "recruitment_questions", id: questionId, before, after: null });
  touched(cycleId);
  return ok("Question deleted.");
}

// ── reviewers ──────────────────────────────────────────────────────────
export async function addReviewer(cycleId: string, teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const email = z.email().safeParse(text(formData, "email").toLowerCase());
  if (!email.success) return fail("Please fix the highlighted fields.", { email: "Enter the reviewer's email address." });
  let users;
  try {
    users = await listUsers(ctx);
  } catch {
    return fail("The account list could not be read. Check that SUPABASE_SERVICE_ROLE_KEY is set on the server.");
  }
  const person = users.find((u) => u.email.toLowerCase() === email.data);
  if (!person) return fail("Please fix the highlighted fields.", { email: "No account uses that email address." });
  if (!person.isActive) return fail("Please fix the highlighted fields.", { email: "That account is deactivated." });

  const { error } = await ctx.supabase.from("recruitment_team_reviewers").insert({ team_id: teamId, user_id: person.id, added_by: ctx.user.id });
  if (error && error.code !== "23505") return fail("Could not add this reviewer.");
  await ctx.supabase.from("notifications").insert({ user_id: person.id, title: "You are a recruitment reviewer", body: "You can now review applications for a team.", link: "/review" });
  await logAudit(ctx, { action: "added_reviewer", table: "recruitment_teams", id: teamId, after: { reviewer: person.fullName } });
  deliverEmailsAfterResponse();
  revalidatePath(`/admin/recruitment/${cycleId}`, "layout");
  return ok(`${person.fullName} can now review this team's applications.`);
}

export async function removeReviewer(cycleId: string, teamId: string, userId: string): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const { error } = await ctx.supabase.from("recruitment_team_reviewers").delete().eq("team_id", teamId).eq("user_id", userId);
  if (error) return fail("Could not remove this reviewer.");
  await logAudit(ctx, { action: "removed_reviewer", table: "recruitment_teams", id: teamId, note: userId });
  revalidatePath(`/admin/recruitment/${cycleId}`, "layout");
  return ok("Reviewer removed.");
}

// ── interview reviewers (all hubs) ─────────────────────────────────────
// One list per cycle (migration 0024); the database keeps each person on
// every hub's reviewer list, so /review and the interview room work as for
// any hub reviewer. The database functions write the audit entries.
const emailList = z.array(z.string().max(320)).min(1, "Add at least one email").max(200, "Add at most 200 emails at a time");

export async function addCycleReviewers(cycleId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(cycleId).success) return fail("Recruitment not found.");
  const parsed = emailList.safeParse(lines(text(formData, "emails").replace(/\s+/g, "\n")));
  if (!parsed.success) return fail("Please fix the highlighted fields.", { emails: parsed.error.issues[0]?.message ?? "Check the emails" });
  const { data, error } = await ctx.supabase.rpc("add_cycle_reviewers", { p_cycle: cycleId, p_emails: parsed.data });
  if (error) return fail(friendlyDbError(error.message, "Could not add the reviewers. Has migration 0024 been run?"));
  const rows = (data ?? []) as { email: string; result: "added" | "already" | "invited" | "deactivated" | "invalid" }[];
  const count = (r: string) => rows.filter((x) => x.result === r).length;
  const invalid = rows.filter((x) => x.result === "invalid").map((x) => x.email);
  const deactivated = rows.filter((x) => x.result === "deactivated").map((x) => x.email);
  const parts = [
    `${count("added")} added`,
    count("already") && `${count("already")} already a reviewer`,
    count("invited") && `${count("invited")} invited (gets access on sign-up with this email)`,
    deactivated.length && `${deactivated.length} deactivated account${deactivated.length === 1 ? "" : "s"}: ${deactivated.join(", ")}`,
    invalid.length && `${invalid.length} invalid: ${invalid.join(", ")}`,
  ].filter(Boolean);
  deliverEmailsAfterResponse();
  revalidatePath(`/admin/recruitment/${cycleId}`, "layout");
  revalidatePath("/review");
  return ok(`${parts.join(", ")}.`);
}

export async function removeCycleReviewer(cycleId: string, userId: string): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  if (!uuid.safeParse(cycleId).success || !uuid.safeParse(userId).success) return fail("Reviewer not found.");
  const { error } = await ctx.supabase.rpc("remove_cycle_reviewer", { p_cycle: cycleId, p_user: userId });
  if (error) return fail(friendlyDbError(error.message, "Could not remove this reviewer."));
  revalidatePath(`/admin/recruitment/${cycleId}`, "layout");
  revalidatePath("/review");
  return ok("Reviewer removed from every hub. Their scores and notes stay.");
}

export async function cancelCycleReviewerInvite(cycleId: string, email: string): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const parsed = z.email().safeParse(email);
  if (!uuid.safeParse(cycleId).success || !parsed.success) return fail("Invite not found.");
  const { error } = await ctx.supabase.rpc("remove_cycle_reviewer_invite", { p_cycle: cycleId, p_email: parsed.data });
  if (error) return fail(friendlyDbError(error.message, "Could not cancel the invite."));
  revalidatePath(`/admin/recruitment/${cycleId}`, "layout");
  return ok("Invite cancelled.");
}

// ── applications ───────────────────────────────────────────────────────
/** Moves the ticked applications to one stage for one team. Each move is logged by the database function. */
export async function bulkStage(cycleId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("recruitment");
  if (!ctx) return FORBIDDEN;
  const ids = formData.getAll("ids").filter((v): v is string => typeof v === "string" && uuid.safeParse(v).success);
  const team = text(formData, "bulk_team");
  const stage = z.enum(STAGES as [string, ...string[]]).safeParse(text(formData, "bulk_stage"));
  if (ids.length === 0) return fail("Tick at least one application.");
  if (!uuid.safeParse(team).success) return fail("First choose a team in the Team filter above, then tick the applications.");
  if (!stage.success) return fail("Please fix the highlighted fields.", { bulk_stage: "Choose the stage" });
  if (stage.data === "interview") return fail("Schedule interviews one by one, so each has its time and place.");

  let moved = 0;
  let skipped = 0;
  for (const id of ids.slice(0, 200)) {
    const { error } = await ctx.supabase.rpc("set_recruitment_stage", { p_application: id, p_team: team, p_stage: stage.data });
    if (error) skipped++;
    else moved++;
  }
  revalidatePath(`/admin/recruitment/${cycleId}`, "layout");
  revalidatePath("/review");
  deliverEmailsAfterResponse();
  return ok(`${moved} moved${skipped ? `, ${skipped} skipped (they did not apply to that team)` : ""}.`);
}

// ── message templates ──────────────────────────────────────────────────
// "absent" and "social_post" exist from migration 0017 on.
const TEMPLATE_KEYS = ["submitted", "shortlisted", "task", "interview", "selected", "waitlisted", "not_selected", "absent", "social_post"] as const;

export async function saveTemplate(key: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await authorize("recruitment.content");
  if (!ctx) return FORBIDDEN;
  if (!(TEMPLATE_KEYS as readonly string[]).includes(key)) return fail("Unknown message.");
  const body = text(formData, "body");
  const max = key === "social_post" ? 2000 : 1000;
  if (body.length < 1 || body.length > max) return fail("Please fix the highlighted fields.", { body: `Write 1 to ${max} characters` });
  const { data: before } = await ctx.supabase.from("recruitment_message_templates").select("body").eq("key", key).maybeSingle();
  const { error } = await ctx.supabase.from("recruitment_message_templates").update({ body, updated_at: new Date().toISOString() }).eq("key", key);
  if (error) return fail("Could not save the message.");
  await logAudit(ctx, { action: "updated", table: "recruitment_message_templates", id: key, before, after: { body } });
  revalidatePath("/admin/recruitment/templates");
  return ok("Saved.");
}
