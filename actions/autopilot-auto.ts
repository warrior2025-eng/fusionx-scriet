"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { pushAfterResponse } from "@/lib/push/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeLink } from "@/lib/validation/link";

/** Autopilot, automatic (migration 0045): every action calls a database function that checks the caller. */

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
  return ok(typeof data === "string" && data && !/^[0-9a-f-]{36}$/i.test(data) ? data : done);
}

// ── Members ─────────────────────────────────────────────────────────────
export async function ideaChoice(id: string, state: "saved" | "hidden" | "clear") {
  return call("ap_idea_choice", { p_idea: id, p_state: state }, "Saved.", ["/my-work"]);
}

/** "Accept and start": a project of your own, published in Projects as "In progress · Started by <you>". */
export async function acceptIdea(id: string, variation: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Please sign in again.");
  const { data, error } = await supabase.rpc("ap_idea_accept", { p_idea: id, p_variation: variation || "lite" });
  if (error) return fail(clean(error.message));
  deliverEmailsAfterResponse();
  pushAfterResponse();
  revalidatePath("/projects", "layout");
  revalidatePath("/my-work");
  const { data: project } = await supabase.from("projects").select("id").eq("id", data).maybeSingle();
  return ok("Started. Your project has a plan and is in Projects.", project ? { redirectTo: `/projects/${data}/work` } : {});
}

export async function joinProject(id: string) {
  return call("ap_join_project", { p_project: id }, "You joined the team.", ["/projects", "/my-work", "/projects/mine"]);
}

// ── Admins ──────────────────────────────────────────────────────────────
export async function publishIdeaOpen(id: string, owner: string) {
  return call("ap_idea_publish_open", { p_idea: id, p_owner: owner || null }, "Published to Projects as an open project.", ["/projects", "/command/ideas"]);
}

export async function pauseFeature(feature: string, paused: boolean) {
  return call("ap_feature_pause", { p_feature: feature, p_paused: paused }, paused ? "Paused." : "On.", ["/command"]);
}

export async function contentAction(kind: "idea" | "opportunity" | "tool" | "project", ids: string[], action: string, reason?: string) {
  if (!ids.length) return fail("Select at least one.");
  return call("ap_content_action", { p_kind: kind, p_ids: ids, p_action: action, p_reason: reason?.slice(0, 300) || null },
    action === "delete" ? "Deleted. You can restore it for 7 days." : "Done.", ["/command", "/my-work", "/opportunities", "/tools", "/projects", "/"]);
}

export async function deleteBatch(kind: "ideas" | "opportunities", key: string, reason?: string) {
  return call("ap_delete_batch", { p_kind: kind, p_key: key, p_reason: reason?.slice(0, 300) || null }, "Deleted. You can restore it for 7 days.", ["/command", "/my-work", "/opportunities"]);
}

export async function addCollegeOpportunity(form: Record<string, string | boolean>): Promise<ActionState> {
  let link = "";
  if (typeof form.link === "string" && form.link.trim()) {
    const r = normalizeLink(form.link, "any", { label: "The link", allowMailto: true });
    if (!r.ok) return fail(r.error);
    link = r.value;
  }
  return call("ap_add_college_opportunity", { p: { ...form, link } }, "Published in At SCRIET.", ["/opportunities", "/command/opportunities"]);
}

export async function saveTool(id: string | null, tool: Record<string, unknown>): Promise<ActionState> {
  for (const k of ["official_url", "docs_url"]) {
    if (tool[k] !== undefined) {
      const r = normalizeLink(String(tool[k] ?? ""), "any", { label: "The link" });
      if (!r.ok || !r.value) return fail("Add both official links.");
      tool[k] = r.value;
    }
  }
  return call("ap_tool_save", { p_id: id, p: tool }, "Saved.", ["/tools", "/command/tools", "/"]);
}
