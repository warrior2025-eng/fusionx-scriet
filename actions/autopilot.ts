"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { pushAfterResponse, vapidPublicKey } from "@/lib/push/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeLink } from "@/lib/validation/link";
import { AREAS, NUMBERS, type Level } from "@/lib/autopilot/labels";

/**
 * Autopilot's server actions. Each one calls a database function as the signed-in person; the
 * function checks who they are and what they may do (migration 0042), so a hidden button or a
 * hand-made request changes nothing it shouldn't. After writes that notify people, email and
 * phone notifications go out once the response is sent.
 */

const clean = (message: string) => message.replace(/^.*?ERROR:\s*/, "").replace(/\s*\(SQLSTATE.*$/, "");

async function rpc(name: string, args: Record<string, unknown>, done: string | ((data: unknown) => string), paths: string[] = ["/my-work", "/command"]): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Please sign in again.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) return fail(clean(error.message));
  deliverEmailsAfterResponse();
  pushAfterResponse();
  for (const p of paths) revalidatePath(p, "layout");
  return ok(typeof done === "function" ? done(data) : typeof data === "string" && data ? data : done);
}

// ── Members ─────────────────────────────────────────────────────────────

export async function respondToOffer(offerId: string, answer: "accept" | "swap" | "cant") {
  return rpc("task_offer_respond", { p_offer: offerId, p_answer: answer }, "Saved.");
}

/** Proof: a link (cleaned with the link helper), an upload already in the private bucket, or a note. */
export async function submitProof(taskId: string, text: string, link: string, uploaded: string): Promise<ActionState> {
  let url = uploaded?.startsWith("storage:task-proofs/") ? uploaded : "";
  if (!url && link.trim()) {
    const result = normalizeLink(link, "any", { label: "The proof link" });
    if (!result.ok) return fail(result.error);
    url = result.value;
  }
  return rpc("task_submit", { p_task: taskId, p_text: text.slice(0, 2000), p_url: url || null }, "Submitted.");
}

export async function decideReview(reviewId: string, approve: boolean, note: string) {
  return rpc("task_review_decide", { p_review: reviewId, p_approve: approve, p_note: note.slice(0, 1000) }, "Saved.");
}

export async function requestTaskChange(taskId: string, kind: "move" | "swap", newDue: string, note: string) {
  return rpc("task_request_change", { p_task: taskId, p_kind: kind, p_new_due: kind === "move" ? newDue || null : null, p_note: note.slice(0, 500) }, "Asked.");
}

export async function addBusyDates(from: string, to: string, note: string): Promise<ActionState> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return fail("Choose a start and an end date.");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Please sign in again.");
  const { error } = await supabase.from("availability").insert({ user_id: auth.user.id, starts_on: from, ends_on: to, note: note.slice(0, 200) || null });
  if (error) return fail(clean(error.message));
  revalidatePath("/my-work");
  return ok("Busy dates saved. You will get no new tasks then.");
}

export async function removeBusyDates(id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("availability").delete().eq("id", id);
  if (error) return fail(clean(error.message));
  revalidatePath("/my-work");
  return ok("Removed.");
}

/** The weekly 1-minute check-in. "Blocked" pings the person's leads. */
export async function saveCheckin(done: string, next: string, blocked: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Please sign in again.");
  if (!done.trim() && !next.trim() && !blocked.trim()) return fail("Write at least one line.");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const d = new Date(`${today}T00:00:00Z`);
  const week = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
  const { error } = await supabase.from("checkins").upsert(
    { user_id: auth.user.id, week_start: week, done: done.slice(0, 500) || null, next: next.slice(0, 500) || null, blocked: blocked.slice(0, 500) || null },
    { onConflict: "user_id,week_start" },
  );
  if (error) return fail(clean(error.message));
  if (blocked.trim()) {
    const { error: pingError } = await supabase.rpc("ap_checkin_blocked", { p_text: blocked.slice(0, 500) });
    if (pingError) console.error("check-in ping failed:", pingError.message);
    deliverEmailsAfterResponse();
    pushAfterResponse();
  }
  revalidatePath("/my-work");
  return ok(blocked.trim() ? "Saved. Your lead knows you are blocked." : "Saved. Thanks!");
}

export async function savePreferences(delivery: "instant" | "daily", push: boolean): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Please sign in again.");
  const { error } = await supabase.from("work_preferences").upsert({ user_id: auth.user.id, delivery, push, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return fail(clean(error.message));
  revalidatePath("/my-work");
  return ok("Saved.");
}

export async function pushPublicKey(): Promise<string | null> {
  return vapidPublicKey();
}

export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string): Promise<ActionState> {
  if (!/^https:\/\//.test(sub?.endpoint ?? "") || !sub.keys?.p256dh || !sub.keys?.auth) return fail("This browser gave no subscription.");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Please sign in again.");
  // The same browser may have been subscribed by someone else before: theirs is replaced.
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: auth.user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent.slice(0, 200),
  });
  if (error) return fail(clean(error.message));
  revalidatePath("/my-work");
  return ok("Phone notifications are on for this device.");
}

export async function removePushSubscription(endpoint: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return fail(clean(error.message));
  revalidatePath("/my-work");
  return ok("Phone notifications are off for this device.");
}

// ── Command Center ──────────────────────────────────────────────────────

export async function decideQueueItem(id: string, approve: boolean, edit?: Record<string, unknown>) {
  return rpc("ap_queue_decide", { p_item: id, p_approve: approve, p_edit: edit ?? null }, "Done.");
}

export async function approveAllSafe() {
  return rpc("ap_queue_approve_safe", {}, (n) => (Number(n) ? `${n} item${Number(n) === 1 ? "" : "s"} done.` : "Nothing safe was waiting."));
}

export async function startMission(form: { playbook: string; variation: string; date: string; title: string; goal: string; owner: string; hubs: string[]; visibility: string }): Promise<ActionState> {
  if (!form.playbook || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return fail("Choose a playbook and a date.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ap_start_mission", {
    p_playbook: form.playbook, p_variation: form.variation || null, p_date: form.date, p_title: form.title.slice(0, 160) || null,
    p_goal: form.goal.slice(0, 400) || null, p_owner: form.owner || null, p_hubs: form.hubs.length ? form.hubs : null, p_visibility: form.visibility || null,
  });
  if (error) return fail(clean(error.message));
  deliverEmailsAfterResponse();
  pushAfterResponse();
  revalidatePath("/command", "layout");
  return ok("Mission started. Its tasks will be offered.", { redirectTo: `/command/missions?m=${data}` });
}

export async function missionAction(id: string, action: string, reason?: string, links?: string[]) {
  const cleaned = links?.map((l) => normalizeLink(l, "any")).filter((r) => r.ok && r.value).map((r) => (r as { value: string }).value);
  return rpc("ap_mission_set", { p_mission: id, p_action: action, p_reason: reason ?? null, p_links: cleaned ?? null }, "Done.");
}

export async function taskOverride(taskId: string, action: string, user?: string, date?: string, reason?: string) {
  return rpc("ap_task_override", { p_task: taskId, p_action: action, p_user: user || null, p_date: date || null, p_reason: reason || null }, "Done.");
}

export type PlanPreview = {
  added: { title: string; due_on: string }[]; removed: { title: string; due_on: string }[]; kept: { title: string; status: string }[];
  moved: { title: string; from: string; to: string }[]; people: string[]; notifications: number; new_date: string; variation: string;
};

export async function previewPlan(missionId: string, changes: Record<string, unknown>): Promise<{ ok: true; preview: PlanPreview } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ap_plan_preview", { p_mission: missionId, p_changes: changes });
  if (error) return { ok: false, error: clean(error.message) };
  return { ok: true, preview: data as PlanPreview };
}

export async function applyPlan(missionId: string, changes: Record<string, unknown>, reason: string) {
  return rpc("ap_plan_apply", { p_mission: missionId, p_changes: changes, p_reason: reason.slice(0, 300), p_system: false }, "Plan changed. Everyone affected was told.");
}

export async function restorePlan(missionId: string, version: number) {
  return rpc("ap_plan_restore", { p_mission: missionId, p_version: version, p_system: false }, "Restored.");
}

export async function addExamPeriod(name: string, from: string, to: string): Promise<ActionState> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return fail("Choose a start and an end date.");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("club_exam_periods").insert({ name: name.slice(0, 80) || "Exams", starts_on: from, ends_on: to, created_by: auth.user?.id });
  if (error) return fail(clean(error.message));
  revalidatePath("/command", "layout");
  return ok("Exam period saved. Only exam-safe playbooks run then; the rest move after it.");
}

export async function removeExamPeriod(id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("club_exam_periods").delete().eq("id", id);
  if (error) return fail(clean(error.message));
  revalidatePath("/command", "layout");
  return ok("Removed.");
}

async function settings(patch: Record<string, unknown>, message = "Saved.") {
  return rpc("ap_settings_update", { p_patch: patch }, () => message, ["/command"]);
}

export async function setMaster(on: boolean) {
  return settings({ master: on ? "on" : "paused" }, on ? "Autopilot is on." : "Autopilot is paused. Nothing new is created, offered, reminded or escalated; nothing is lost.");
}

export async function setLevel(area: string, level: Level) {
  if (!AREAS.some((a) => a.key === area) || !["auto", "suggest", "manual"].includes(level)) return fail("Unknown setting.");
  return settings({ levels: { [area]: level } });
}

export async function safeAreasToAuto() {
  return settings({ levels: Object.fromEntries(AREAS.filter((a) => a.safe).map((a) => [a.key, "auto"])) }, "Safe areas are on Auto.");
}

export async function saveNumbers(values: Record<string, string>): Promise<ActionState> {
  const numbers: Record<string, number> = {};
  for (const n of NUMBERS) {
    const raw = values[n.key];
    if (raw === undefined || raw === "") continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < n.min || v > n.max) return fail(`${n.label}: between ${n.min} and ${n.max}.`);
    numbers[n.key] = Math.round(v);
  }
  return settings({ numbers });
}

export async function setPauses(pauses: Record<string, string[]>) {
  return settings({ pauses });
}

export async function setFounderExamMode(userIds: string[]) {
  return settings({ founder_exam_mode: userIds }, "Saved.");
}

export async function savePermission(action: string, allowed: string[]) {
  return rpc("ap_permissions_update", { p_action: action, p_allowed: allowed }, "Saved.", ["/command"]);
}

export async function undoAutomation(logId: string) {
  return rpc("ap_undo", { p_log: logId }, "Undone.");
}

export type DryRunLine = { at: string; kind: "done" | "suggest"; area: string; text: string; reason: string | null };
export async function dryRun(days = 7): Promise<{ ok: true; lines: DryRunLine[] } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ap_dry_run", { p_days: days });
  if (error) return { ok: false, error: clean(error.message) };
  return { ok: true, lines: (data ?? []) as DryRunLine[] };
}

export async function toggleRule(id: string, on: boolean): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("autopilot_rules").update({ is_on: on }).eq("id", id);
  if (error) return fail(clean(error.message));
  revalidatePath("/command", "layout");
  return ok(on ? "Rule on." : "Rule off.");
}

// ── Playbooks ───────────────────────────────────────────────────────────

export async function savePlaybook(id: string | null, data: Record<string, unknown>, note: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: saved, error } = await supabase.rpc("ap_playbook_save", { p_playbook: id, p_data: data, p_note: note.slice(0, 300) || "Edited" });
  if (error) return fail(clean(error.message));
  revalidatePath("/command/playbooks", "layout");
  return ok("Playbook saved as a new version.", id ? {} : { redirectTo: `/command/playbooks/${saved}` });
}

export async function restorePlaybook(id: string, version: number) {
  return rpc("ap_playbook_restore", { p_playbook: id, p_version: version }, "Restored as a new version.", ["/command/playbooks"]);
}

export async function duplicatePlaybook(id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ap_playbook_duplicate", { p_playbook: id });
  if (error) return fail(clean(error.message));
  revalidatePath("/command/playbooks", "layout");
  return ok("Duplicated.", { redirectTo: `/command/playbooks/${data}` });
}

export type PreviewTask = { key: string; title: string; hub: string; due_on: string; depends_keys: string[]; effort: string; member_for: string | null };
/** The tasks a playbook gives for a variation and date (Playbooks → Preview). */
export async function previewPlaybook(playbookId: string, variation: string, date: string): Promise<{ ok: true; tasks: PreviewTask[] } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Choose a date." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ap_target_tasks", { p_playbook: playbookId, p_variation: variation, p_date: date, p_hubs: [] });
  if (error) return { ok: false, error: clean(error.message) };
  return { ok: true, tasks: ((data ?? []) as PreviewTask[]).sort((a, b) => a.due_on.localeCompare(b.due_on)) };
}
