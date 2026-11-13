import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRoles, getCurrentUser } from "@/lib/permissions";
import type { Health } from "./labels";

/**
 * Who is looking at Autopilot and what they may do there. The database checks every read (RLS)
 * and every write (the functions in migration 0042) again; this only shapes the pages.
 */
export const getAutopilotViewer = cache(async () => {
  const [user, roles] = await Promise.all([getCurrentUser(), getCurrentRoles()]);
  if (!user) return null;
  const supabase = await createClient();
  const [{ data: operator }, { data: leadHubs }] = await Promise.all([
    supabase.rpc("ap_is_operator", { p_user: user.id }),
    supabase.rpc("ap_lead_hubs", { p_user: user.id }),
  ]);
  const hubs = (leadHubs as string[] | null) ?? [];
  return {
    supabase,
    user,
    roles,
    superAdmin: roles.includes("super_admin"),
    admin: roles.includes("super_admin") || roles.includes("admin"),
    operator: operator === true,
    leadHubs: hubs,
    canOpenCenter: operator === true || hubs.length > 0,
  };
});
export type AutopilotViewer = NonNullable<Awaited<ReturnType<typeof getAutopilotViewer>>>;

export type MissionRow = {
  id: string; slug: string; title: string; goal: string | null; playbook_id: string | null; variation_key: string | null;
  mission_date: string; owner_id: string | null; hubs: string[]; visibility: "members" | "public"; status: string;
  source: string; outcome_links: string[]; version: number; created_at: string; cancel_reason: string | null;
};
export type TaskRow = {
  id: string; mission_id: string; playbook_task_key: string | null; sort: number; title: string; checklist: string[]; hub: string;
  skills: string[]; effort: "S" | "M" | "L"; due_on: string; depends_on: string[]; proof: "link" | "file" | "image" | "text";
  review: "peer" | "lead" | "both"; assignee_id: string | null; locked: boolean; status: string; proof_text: string | null;
  proof_url: string | null; submitted_at: string | null; approved_at: string | null; member_for: string | null; escalation: number;
};

export async function healthOf(supabase: AutopilotViewer["supabase"], ids: string[]): Promise<Map<string, Health>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase.rpc("ap_missions_health", { p_ids: ids });
  return new Map(((data ?? []) as { id: string; health: Health }[]).map((r) => [r.id, r.health]));
}

/** Names and photos for a set of people (profiles are readable to signed-in members). */
export async function peopleById(supabase: AutopilotViewer["supabase"], ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map<string, { full_name: string; avatar_url: string | null }>();
  const { data } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id as string, { full_name: p.full_name as string, avatar_url: (p.avatar_url as string | null) ?? null }]));
}

/** A short-lived link to an uploaded proof (private bucket), or the link itself. */
export async function proofHref(supabase: AutopilotViewer["supabase"], url: string | null): Promise<string | null> {
  if (!url) return null;
  if (!url.startsWith("storage:task-proofs/")) return url;
  const { data } = await supabase.storage.from("task-proofs").createSignedUrl(url.slice("storage:task-proofs/".length), 3600);
  return data?.signedUrl ?? null;
}

/** Today in India, as YYYY-MM-DD. */
export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export function daysFromToday(date: string): number {
  return Math.round((new Date(`${date}T00:00:00Z`).getTime() - new Date(`${todayIST()}T00:00:00Z`).getTime()) / 864e5);
}
