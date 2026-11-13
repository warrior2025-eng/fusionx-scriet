"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { pushAfterResponse } from "@/lib/push/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { normalizeLink } from "@/lib/validation/link";
import { semesterEnd, semesterLabel, semesterStart, visitGroup } from "@/lib/autopilot/outcomes";
import { storeRadarItems } from "@/lib/autopilot/ideas";

/** Autopilot PR 3: outcomes, recognition, certificates and the Idea Engine (migration 0044). */

const clean = (message: string) => message.replace(/^.*?ERROR:\s*/, "").replace(/\s*\(SQLSTATE.*$/, "");

async function call(name: string, args: Record<string, unknown>, done: string, paths: string[]): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Please sign in again.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) return fail(clean(error.message));
  deliverEmailsAfterResponse();
  pushAfterResponse();
  for (const p of paths) revalidatePath(p, "layout");
  return ok(typeof data === "string" && data ? data : done);
}

export async function makeShareCard(missionId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ap_make_share_card", { p_mission: missionId });
  if (error) return fail(clean(error.message));
  revalidatePath("/my-work");
  return ok("Your share card is ready.", { viewHref: `/impact/card/${data}` });
}

export async function writeStorySummary(missionId: string, text: string) {
  return call("ap_story_summary", { p_mission: missionId, p_text: text.slice(0, 600) }, "Saved.", ["/impact", "/command"]);
}

export async function prepareCertificates(): Promise<ActionState> {
  return call("ap_certificate_drafts", { p_from: semesterStart(), p_to: semesterEnd(), p_label: semesterLabel() }, "Drafts are in Today.", ["/command"]);
}

export async function certificateAction(code: string, action: "issue" | "revoke", reason?: string) {
  return call("ap_certificate_set", { p_code: code, p_action: action, p_reason: reason ?? null }, "Saved.", ["/command", "/my-work"]);
}

export async function suggestRecognition(): Promise<ActionState> {
  const d = new Date();
  const month = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  return call("ap_suggest_recognition", { p_month: month }, "Suggestions are in Today.", ["/command"]);
}

export async function publishNow() {
  return call("ap_publish_now", {}, "Now building and the Impact Board are updated.", ["/", "/impact"]);
}

export async function saveForeword(text: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: op } = await supabase.rpc("ap_is_operator", { p_user: auth.user?.id });
  if (!op) return fail("Only admins write the foreword.");
  const { error } = await supabase.from("site_content").upsert({ key: "autopilot.report_foreword", value: { text: text.slice(0, 1500) } }, { onConflict: "key" });
  if (error) return fail(clean(error.message));
  return ok("Foreword saved.");
}

export async function hideFromPublic(kind: "mission" | "person", id: string, hidden: boolean): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: op } = await supabase.rpc("ap_is_operator", { p_user: auth.user?.id });
  if (!op || !process.env.SUPABASE_SERVICE_ROLE_KEY) return fail("Only admins can do this.");
  // These columns are written only here and by the database's own functions.
  const admin = createAdminClient();
  const { error } = kind === "mission"
    ? await admin.from("missions").update({ public_hidden: hidden }).eq("id", id)
    : await admin.from("profiles").update({ public_hidden: hidden }).eq("id", id);
  if (error) return fail(clean(error.message));
  await admin.from("audit_logs").insert({ user_id: auth.user!.id, action: `autopilot.public.${hidden ? "hide" : "show"}`, resource_type: kind === "mission" ? "missions" : "profiles", resource_id: id, metadata: {} });
  await admin.rpc("ap_publish_public");
  revalidatePath("/", "layout");
  return ok(hidden ? "Hidden from public pages." : "Shown on public pages.");
}

export async function setShowOnImpact(show: boolean): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Please sign in again.");
  const { error } = await supabase.from("profiles").update({ show_on_impact: show }).eq("id", auth.user.id);
  if (error) return fail(clean(error.message));
  revalidatePath("/my-work");
  return ok(show ? "You show on public pages for your verified work." : "You are hidden from public pages.");
}

// ── Idea Engine ─────────────────────────────────────────────────────────
export async function ideaAction(id: string, action: "save" | "reject" | "edit", reason?: string, patch?: Record<string, string>) {
  return call("ap_idea_set", { p_idea: id, p_action: action, p_reason: reason ?? null, p_patch: patch ?? null }, "Saved.", ["/command"]);
}
export async function adoptIdea(id: string, variation: string, owner: string, date: string) {
  return call("ap_idea_adopt", { p_idea: id, p_variation: variation || null, p_owner: owner || null, p_date: date || null }, "Adopted.", ["/command", "/projects/mine"]);
}
export async function likeIdea(id: string) {
  return call("ap_idea_like", { p_idea: id }, "Saved.", ["/my-work"]);
}
export async function startIdea(id: string, variation: string): Promise<ActionState> {
  const supabase = await createClient();
  const target = new Date(Date.now() + (variation === "ambitious" ? 84 : variation === "standard" ? 56 : 28) * 864e5).toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("ap_idea_start", { p_idea: id, p_variation: variation || "lite", p_target: target });
  if (error) return fail(clean(error.message));
  revalidatePath("/projects/mine");
  return ok("Your project is started with a plan.", { redirectTo: `/projects/${data}/work` });
}
export async function opportunityDraftAction(id: string, action: "publish" | "mission" | "reject" | "match", ideaId?: string) {
  return call("ap_opportunity_draft_set", { p_draft: id, p_action: action, p_extra: ideaId ? { idea_id: ideaId } : null }, "Done.", ["/command", "/opportunities"]);
}

/** Members' "Suggest an opportunity": the same checks as the radar (official link, future deadline, no repeats). */
export async function suggestOpportunity(form: { title: string; organiser: string; link: string; deadline: string; city: string; mode: string }): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Please sign in again.");
  const link = normalizeLink(form.link, "any", { label: "The official link" });
  if (!link.ok || !link.value) return fail("Add the official link.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.deadline) || form.deadline < new Date().toISOString().slice(0, 10)) return fail("Add a registration deadline from today on.");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return fail("Not available right now.");
  const n = await storeRadarItems(createAdminClient(), [{ title: form.title, organiser: form.organiser, official_link: link.value, deadline: form.deadline, city: form.city, mode: form.mode, type: "suggested by a member", hubs: ["competitions-opportunities"] }], new Date().toISOString().slice(0, 10));
  return n ? ok("Thanks! A Competitions member will check it.") : ok("We already have it. Thanks!");
}

// ── Visitors ────────────────────────────────────────────────────────────
/** The cookie-free beacon from public pages: one count per page view, by section. Nothing about the visitor is kept. */
export async function countVisit(pathname: string): Promise<void> {
  const group = visitGroup(pathname);
  if (!group || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  await createAdminClient().rpc("ap_count_visit", { p_group: group });
}
