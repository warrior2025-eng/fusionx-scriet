"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { pushAfterResponse } from "@/lib/push/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
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
  return call("ap_join_project", { p_project: id }, "Request sent. You join when the owner accepts.", ["/projects", "/my-work", "/projects/mine"]);
}

/** The owner accepts or declines a join request (migration 0049). */
export async function decideJoin(id: string, user: string, accept: boolean) {
  return call("ap_project_join_decide", { p_project: id, p_user: user, p_accept: accept }, accept ? "They are in the team now." : "Declined.", ["/projects", `/projects/${id}/work`, "/projects/mine"]);
}

/** Take back a join request that is still waiting (migration 0049). */
export async function cancelJoin(id: string) {
  return call("ap_project_join_cancel", { p_project: id }, "Request cancelled.", ["/projects", "/projects/mine"]);
}

/** Leave a project team you joined (migration 0048). The owner cannot leave their own project. */
export async function leaveProject(id: string) {
  return call("ap_leave_project", { p_project: id }, "You left the team.", ["/projects", "/my-work", "/projects/mine"]);
}

/** The owner stops or allows new joins (migration 0049). */
export async function setProjectJoins(id: string, closed: boolean) {
  return call("ap_project_joins", { p_project: id, p_closed: closed }, closed ? "New joins stopped." : "New members can join again.", ["/projects", `/projects/${id}/work`]);
}

/** The owner removes a member from the team (migration 0049). */
export async function removeProjectMember(id: string, user: string, reason?: string) {
  return call("ap_project_remove_member", { p_project: id, p_user: user, p_reason: reason?.slice(0, 300) || null }, "Removed from the team.", ["/projects", `/projects/${id}/work`, "/projects/mine", "/my-work"]);
}

// ── Admins ──────────────────────────────────────────────────────────────
export async function publishIdeaOpen(id: string, owner: string) {
  return call("ap_idea_publish_open", { p_idea: id, p_owner: owner || null }, "Published to Projects as an open project.", ["/projects", "/command/ideas"]);
}

export async function pauseFeature(feature: string, paused: boolean) {
  return call("ap_feature_pause", { p_feature: feature, p_paused: paused }, paused ? "Paused." : "On.", ["/command"]);
}

/**
 * "Run now": an admin runs one automation, or all of them, at any time instead of waiting for its schedule.
 * The button returns at once; each job then runs in its own request to /api/cron/autopilot (its own time
 * limit), with the same checks as the scheduled run (master switch, its own pause, its level, the daily AI
 * cap). Ideas, research and the tool run even if they already ran today. Results go to the automation log.
 */
export async function runAutomationNow(key: "ideas" | "research" | "opportunities" | "tools" | "ai_refresh" | "all"): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Please sign in again.");
  const { data: allowed } = await supabase.rpc("ap_can", { p_action: "automations.pause", p_hub: null, p_user: auth.user.id });
  if (allowed !== true) return fail("Only admins can run automations.");
  const secret = process.env.CRON_SECRET;
  if (!secret || !process.env.SUPABASE_SERVICE_ROLE_KEY) return fail("The server is missing CRON_SECRET or its Supabase key.");
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://fxscriet.com").replace(/\/$/, "");
  const jobs = key === "all" ? ["tools", "opportunities", "ideas", "research"] : [key === "ai_refresh" ? "ai" : key];
  await createAdminClient().from("audit_logs").insert({ user_id: auth.user.id, action: "autopilot.run_now", resource_type: "automation", metadata: { key } });
  const trigger = (job: string) =>
    fetch(`${site}/api/cron/autopilot?job=${job}&force=1`, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(290_000) }).catch(() => null);
  after(async () => {
    await Promise.allSettled(jobs.map(trigger));
    if (key === "all") await trigger("ai"); // new items reach FusionX AI
  });
  return ok(key === "all"
    ? "Started. New tools, opportunities, ideas and research topics appear in about a minute. Refresh to see them; each result is in Control → Automation log."
    : "Started. Refresh in about a minute; the result is in Control → Automation log.");
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
