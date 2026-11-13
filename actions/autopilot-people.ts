"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { pushAfterResponse } from "@/lib/push/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeLink } from "@/lib/validation/link";
import type { PlanPreview } from "./autopilot";

/**
 * Autopilot PR 2: open seats, community tasks, pitches, Rising Talent and project tracking. As in
 * actions/autopilot.ts, each action calls a database function (migration 0043) that checks the caller.
 */

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
  // A sentence from the database is shown; an id (a new row) is not.
  return ok(typeof data === "string" && data && !/^[0-9a-f-]{36}$/i.test(data) ? data : done);
}

const WORK = ["/my-work", "/command", "/autopilot/open-seats"];

// ── Open seats ──────────────────────────────────────────────────────────
export async function openSeat(taskId: string, skill: string, note: string) {
  return call("ap_open_seat", { p_task: taskId, p_skill: skill.slice(0, 80), p_note: note.slice(0, 400) }, "Seat opened. Members see it first, then everyone signed in.", WORK);
}
export async function applyForSeat(seatId: string, pitch: string, work: string): Promise<ActionState> {
  let link: string | null = null;
  if (work.trim()) {
    const r = normalizeLink(work, "any", { label: "Previous work" });
    if (!r.ok) return fail(r.error);
    link = r.value;
  }
  if (pitch.trim().length < 10) return fail("Write 2–3 lines about why you fit.");
  return call("ap_seat_apply", { p_seat: seatId, p_pitch: pitch.slice(0, 500), p_work: link }, "Applied.", WORK);
}
export async function decideSeat(applicationId: string, accept: boolean) {
  return call("ap_seat_decide", { p_application: applicationId, p_accept: accept }, "Saved.", WORK);
}

// ── Community tasks ─────────────────────────────────────────────────────
export async function takeCommunityTask(taskId: string) {
  return call("ap_take_community_task", { p_task: taskId }, "It is yours.", WORK);
}

// ── Pitches ─────────────────────────────────────────────────────────────
export async function submitPitch(title: string, summary: string, hub: string, small: string, full: string): Promise<ActionState> {
  if (title.trim().length < 4 || summary.trim().length < 20) return fail("Give it a title and 2–3 lines.");
  const variations = [
    ...(small.trim() ? [{ key: "small", name: "Small", description: small.trim().slice(0, 400) }] : []),
    ...(full.trim() ? [{ key: "full", name: "Full", description: full.trim().slice(0, 400) }] : []),
  ];
  return call("ap_pitch_submit", { p_title: title.trim().slice(0, 120), p_summary: summary.trim().slice(0, 800), p_hub: hub, p_variations: variations }, "Pitched. Voting is open.", WORK);
}
export async function votePitch(pitchId: string, variation: string) {
  return call("ap_pitch_vote", { p_pitch: pitchId, p_variation: variation }, "Vote saved.", WORK);
}

// ── Rising Talent ───────────────────────────────────────────────────────
export async function nominateTalent(userId: string, reason: string) {
  return call("ap_talent_nominate", { p_user: userId, p_reason: reason.slice(0, 300) }, "Nominated.", ["/command"]);
}
export async function setCommunitySettings(patch: { community_on?: boolean; talent_on?: boolean; projects_on?: boolean }): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Please sign in again.");
  const { error, count } = await supabase.from("community_settings").update({ ...patch, updated_at: new Date().toISOString() }, { count: "exact" }).eq("id", 1);
  if (error || !count) return fail(error ? clean(error.message) : "Only the super admin can change this.");
  await supabase.from("audit_logs").insert({ user_id: auth.user.id, action: "autopilot.community", resource_type: "community_settings", metadata: patch });
  revalidatePath("/command", "layout");
  return ok("Saved.");
}

// ── Projects ────────────────────────────────────────────────────────────
export async function projectPlan(projectId: string, variation: string | null, target: string, apply: boolean): Promise<{ ok: true; preview: PlanPreview } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return { ok: false, error: "Choose a target date." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ap_project_set_plan", { p_project: projectId, p_variation: variation, p_target: target, p_apply: apply });
  if (error) return { ok: false, error: clean(error.message) };
  if (apply) revalidatePath(`/projects/${projectId}/work`);
  return { ok: true, preview: data as PlanPreview };
}
export async function projectMilestone(projectId: string, action: string, id: string | null, title: string, due: string, proof: string): Promise<ActionState> {
  let proofUrl: string | null = null;
  if (proof.trim()) {
    const r = normalizeLink(proof, "any", { label: "The proof link" });
    if (!r.ok) return fail(r.error);
    proofUrl = r.value;
  }
  return call("ap_project_milestone", { p_project: projectId, p_action: action, p_id: id, p_title: title.slice(0, 140), p_due: due || null, p_proof: proofUrl }, "Saved.", [`/projects/${projectId}/work`, "/projects/mine"]);
}
export async function projectTask(projectId: string, action: string, id: string | null, title: string, milestone: string, assignee: string, due: string) {
  return call("ap_project_task", { p_project: projectId, p_action: action, p_id: id, p_title: title.slice(0, 140), p_milestone: milestone || null, p_assignee: assignee || null, p_due: due || null }, "Saved.", [`/projects/${projectId}/work`, "/my-work"]);
}
export async function projectStatus(projectId: string, status: string, lock: boolean) {
  return call("ap_project_status_set", { p_project: projectId, p_status: status || null, p_lock: lock }, "Saved.", [`/projects/${projectId}/work`, "/projects/mine"]);
}
export async function requestProjectSupport(projectId: string, note: string) {
  return call("ap_project_support_request", { p_project: projectId, p_note: note.slice(0, 600) }, "Asked.", [`/projects/${projectId}/work`, "/command"]);
}
