"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionState } from "@/lib/admin/action-state";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";
import { pushAfterResponse } from "@/lib/push/server";
import { createClient } from "@/lib/supabase/server";

/** Squad Match (migration 0047): every action is a database function that checks the caller. */

const clean = (message: string) => message.replace(/^.*?ERROR:\s*/, "").replace(/\s*\(SQLSTATE.*$/, "");

async function call(name: string, args: Record<string, unknown>, done: string, opp?: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Please sign in again.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) return fail(clean(error.message));
  deliverEmailsAfterResponse();
  pushAfterResponse();
  if (opp) revalidatePath(`/opportunities/squad/${opp}`);
  revalidatePath("/my-work");
  revalidatePath("/opportunities", "layout");
  return ok(typeof data === "string" && data && !/^[0-9a-f-]{36}$/i.test(data) ? data : done);
}

export async function createSquad(opp: string, f: { name: string; idea: string; role: string; roles: string[]; size: number }) {
  return call("ap_squad_create", { p_opp: opp, p_name: f.name, p_idea: f.idea, p_my_role: f.role, p_roles: f.roles, p_size: f.size }, "Squad started. Invite people for the open slots.", opp);
}
export async function joinPool(opp: string, role: string, note: string) {
  return call("ap_squad_pool_join", { p_opp: opp, p_role: role, p_note: note }, "You are in the pool.", opp);
}
export async function leavePool(opp: string) {
  return call("ap_squad_pool_leave", { p_opp: opp }, "You left the pool.", opp);
}
export async function inviteToSquad(opp: string, squad: string, user: string, role: string) {
  return call("ap_squad_invite", { p_squad: squad, p_user: user, p_role: role }, "Invited.", opp);
}
export async function askToJoin(opp: string, squad: string, role: string, note: string) {
  return call("ap_squad_ask", { p_squad: squad, p_role: role, p_note: note }, "Request sent.", opp);
}
export async function respondSquad(opp: string, squad: string, user: string, accept: boolean) {
  return call("ap_squad_respond", { p_squad: squad, p_user: user, p_accept: accept }, accept ? "Welcome to the squad." : "Declined.", opp);
}
export async function leaveSquad(opp: string, squad: string) {
  return call("ap_squad_leave", { p_squad: squad }, "You left the squad.", opp);
}
export async function setSquad(opp: string, squad: string, status: "registered" | "forming" | "closed" | null, roles: string[] | null) {
  return call("ap_squad_set", { p_squad: squad, p_status: status, p_roles: roles }, "Saved.", opp);
}
export async function squadFromPool(opp: string, name: string, idea: string, people: string[]) {
  return call("ap_squad_from_pool", { p_opp: opp, p_name: name, p_idea: idea, p_people: people }, "Squad started and invites sent.", opp);
}
