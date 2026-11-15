"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { pushAfterResponse } from "@/lib/push/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { dailyOpportunities, dailyTool, monthlyResearch, refreshAi, weeklyIdeas } from "@/lib/autopilot/auto";
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

/**
 * "Run now": an admin runs one automation, or all of them, at any time instead of waiting for its
 * scheduled time. Same checks as the scheduled run (master switch, its own pause, its level, the daily
 * AI cap). Ideas, research and the tool run even if they already ran today.
 */
export async function runAutomationNow(key: "ideas" | "research" | "opportunities" | "tools" | "ai_refresh" | "all"): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Please sign in again.");
  const { data: allowed } = await supabase.rpc("ap_can", { p_action: "automations.pause", p_hub: null, p_user: auth.user.id });
  if (allowed !== true) return fail("Only admins can run automations.");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return fail("The server is missing its Supabase key.");
  const jobs = {
    ideas: () => weeklyIdeas(true),
    research: () => monthlyResearch(true),
    opportunities: () => dailyOpportunities(),
    tools: () => dailyTool(true),
    ai_refresh: () => refreshAi(),
  } as const;
  const keys = key === "all" ? (["tools", "opportunities", "ideas", "research"] as const) : ([key] as const);
  const results = await Promise.all(keys.map(async (k) => [k, await jobs[k]().catch((e: unknown) => ({ state: "failed", error: e instanceof Error ? e.message : "crashed" }))] as const));
  // Hidden or new items reach FusionX AI at once.
  if (key === "all") await refreshAi().catch(() => null);
  await createAdminClient().from("audit_logs").insert({ user_id: auth.user.id, action: "autopilot.run_now", resource_type: "automation", metadata: { key, results: Object.fromEntries(results) } });
  deliverEmailsAfterResponse();
  pushAfterResponse();
  for (const p of ["/command", "/my-work", "/opportunities", "/tools", "/projects", "/"]) revalidatePath(p, "layout");
  const text = results.map(([k, r]) => runSummary(k, r)).join(" · ");
  return results.some(([, r]) => r.state === "failed") ? fail(text) : ok(text);
}

const RUN_LABEL: Record<string, string> = { ideas: "Ideas", research: "Research", opportunities: "Opportunities", tools: "Tool", ai_refresh: "FusionX AI" };
function runSummary(key: string, r: Record<string, unknown>): string {
  const label = RUN_LABEL[key] ?? key;
  switch (r.state) {
    case "delivered": return `${label}: ${r.count} sent to members`;
    case "suggested": return `${label}: ${r.count} waiting for approval`;
    case "done": return key === "opportunities" ? `${label}: ${r.published ?? 0} published, ${r.skipped ?? 0} left out` : `${label}: ${r.count ?? "done"}${r.count !== undefined ? " added" : ""}`;
    case "added": return `${label}: ${r.slug} added`;
    case "refreshed": return `${label}: ${r.slug} refreshed`;
    case "skipped": return `${label}: skipped (${r.why})`;
    case "none": return `${label}: none passed the quality check`;
    case "no_sources": return `${label}: no source could be read`;
    case "link_failed": return `${label}: ${r.slug}'s link did not load, try again`;
    case "rejected": return `${label}: ${r.slug} failed the check, try again`;
    case "nothing_to_add": return `${label}: nothing new to add`;
    case "no_ai": return `${label}: AI did not answer (daily cap?)`;
    case "not_configured": return `${label}: AI keys are not set`;
    case "failed": return `${label}: failed${r.error ? ` (${r.error})` : ""}`;
    default: return `${label}: ${String(r.state ?? "done")}`;
  }
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
