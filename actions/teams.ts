"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, zodFieldErrors, type ActionState } from "@/lib/admin/action-state";
import { friendlyDbError } from "@/lib/recruitment/data";
import { createClient } from "@/lib/supabase/server";
import { parseEmails } from "@/lib/teams/data";
import { deliverEmailsAfterResponse } from "@/lib/email/outbox";

/**
 * FusionX Teams, from a student's side. Every action validates its input and
 * then calls a database function, and it is the function that decides: who
 * leads a team, whether there is room, whether registration is open. Nothing
 * here writes to the team tables directly.
 */

const uuid = z.string().uuid();
const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Use a full https:// link");
const email = z.string().email("One of these is not an email address").max(254);

const detailsSchema = z.object({
  focus: z.string().trim().max(60),
  description: z.string().trim().max(1000, "Keep this under 1000 characters"),
  project_title: z.string().trim().max(160),
  project_summary: z.string().trim().max(1500, "Keep this under 1500 characters"),
  github_url: optionalUrl,
  demo_url: optionalUrl,
  skills_needed: z.string().trim().max(400),
  looking_for_members: z.boolean(),
  max_size: z.union([z.literal(""), z.coerce.number().int().min(1).max(50)]),
});

const registerSchema = detailsSchema.extend({
  name: z.string().trim().min(3, "The name is too short").max(120),
  team_type: z.enum(["existing", "new"], { message: "Choose the kind of team" }),
  invites: z.array(email).max(20, "Invite at most 20 people"),
  /** Honeypot: a real person never fills this in. */
  website: z.string().max(0),
});

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};
const details = (formData: FormData) => ({
  focus: text(formData, "focus"),
  description: text(formData, "description"),
  project_title: text(formData, "project_title"),
  project_summary: text(formData, "project_summary"),
  github_url: text(formData, "github_url"),
  demo_url: text(formData, "demo_url"),
  skills_needed: text(formData, "skills_needed"),
  looking_for_members: formData.get("looking_for_members") === "on",
  max_size: text(formData, "max_size"),
});
const skillList = (value: string) => value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12);

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function touched(teamId?: string) {
  // Notifications written by this action also go out as email, after the response.
  deliverEmailsAfterResponse();
  revalidatePath("/teams");
  if (teamId) revalidatePath(`/teams/${teamId}`);
  revalidatePath("/admin/teams");
}

/** Registers a team. It starts as "awaiting verification" with the caller as its leader. */
export async function registerTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    ...details(formData),
    name: text(formData, "name"),
    team_type: text(formData, "team_type"),
    invites: parseEmails(text(formData, "invites")),
    website: text(formData, "website"),
  });
  if (!parsed.success) {
    const errors = zodFieldErrors(parsed.error);
    if (errors.website !== undefined) return fail("Could not register the team.");
    const inviteError = Object.entries(errors).find(([key]) => key.startsWith("invites"))?.[1];
    return fail("Please fix the highlighted fields.", { ...errors, ...(inviteError ? { invites: inviteError } : {}) });
  }
  const { supabase, user } = await signedIn();
  if (!user) return fail("Please sign in to register a team.");

  const { website: _honeypot, skills_needed, max_size, ...rest } = parsed.data;
  void _honeypot;
  const { data: teamId, error } = await supabase.rpc("register_team", {
    p: { ...rest, skills_needed: skillList(skills_needed), max_size: max_size === "" ? null : String(max_size) },
  });
  if (error || !teamId) return fail(friendlyDbError(error?.message, "Could not register the team. Please try again."));
  touched(teamId as string);
  return ok("Team registered. FusionX will verify it.", { redirectTo: `/teams/${teamId}` });
}

export async function updateTeam(teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!uuid.safeParse(teamId).success) return fail("Team not found.");
  const parsed = detailsSchema.extend({ status: z.enum(["forming", "active", "completed", "archived"]) }).safeParse({
    ...details(formData),
    status: text(formData, "status"),
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const { supabase, user } = await signedIn();
  if (!user) return fail("Please sign in.");

  const { skills_needed, max_size, ...rest } = parsed.data;
  const { error } = await supabase.rpc("update_team", {
    p_team: teamId,
    p: { ...rest, skills_needed: skillList(skills_needed), max_size: max_size === "" ? null : String(max_size) },
  });
  if (error) return fail(friendlyDbError(error.message, "Could not save the team."));
  touched(teamId);
  return ok("Team updated.");
}

export async function inviteToTeam(teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!uuid.safeParse(teamId).success) return fail("Team not found.");
  const parsed = z.array(email).min(1, "Add at least one email address").max(20, "Invite at most 20 people").safeParse(parseEmails(text(formData, "emails")));
  if (!parsed.success) return fail("Please fix the highlighted fields.", { emails: parsed.error.issues[0]?.message ?? "Check these addresses" });
  const { supabase, user } = await signedIn();
  if (!user) return fail("Please sign in.");
  const { data: made, error } = await supabase.rpc("invite_to_team", { p_team: teamId, p_emails: parsed.data });
  if (error) return fail(friendlyDbError(error.message, "Could not send the invitations."));
  touched(teamId);
  return ok(made === 0 ? "Those people are already on the team or already invited." : `${made} invitation${made === 1 ? "" : "s"} created.`);
}

/** Runs one of the simple team functions and reports the result. */
async function call(fn: string, args: Record<string, unknown>, done: string, teamId?: string, extra: Partial<ActionState> = {}): Promise<ActionState> {
  const { supabase, user } = await signedIn();
  if (!user) return fail("Please sign in.");
  const { error } = await supabase.rpc(fn, args);
  if (error) return fail(friendlyDbError(error.message, "That could not be done. Please try again."));
  touched(teamId);
  return ok(done, extra);
}

export async function acceptInvite(token: string): Promise<ActionState> {
  if (!/^[0-9a-f]{32,128}$/i.test(token)) return fail("This invitation is not valid.");
  const { supabase, user } = await signedIn();
  if (!user) return fail("Please sign in to accept this invitation.");
  const { data: teamId, error } = await supabase.rpc("accept_team_invite", { p_token: token });
  if (error) return fail(friendlyDbError(error.message, "Could not accept this invitation."));
  if (!teamId) return fail("This invitation has expired. Ask the team leader for a new one.");
  touched(teamId as string);
  return ok("You joined the team.", { redirectTo: `/teams/${teamId}` });
}

export async function declineInvite(token: string): Promise<ActionState> {
  if (!/^[0-9a-f]{32,128}$/i.test(token)) return fail("This invitation is not valid.");
  return call("decline_team_invite", { p_token: token }, "Invitation declined.", undefined, { redirectTo: "/teams" });
}

export async function revokeInvite(teamId: string, inviteId: string): Promise<ActionState> {
  if (!uuid.safeParse(inviteId).success) return fail("Invitation not found.");
  return call("revoke_team_invite", { p_invite: inviteId }, "Invitation withdrawn.", teamId);
}

export async function requestToJoin(teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!uuid.safeParse(teamId).success) return fail("Team not found.");
  const message = text(formData, "message").trim();
  if (message.length > 500) return fail("Please fix the highlighted fields.", { message: "Keep this under 500 characters" });
  return call("request_to_join", { p_team: teamId, p_message: message }, "Request sent. The team leader will answer it.", teamId);
}

export async function respondJoinRequest(teamId: string, requestId: string, approve: boolean): Promise<ActionState> {
  if (!uuid.safeParse(requestId).success) return fail("Request not found.");
  return call("respond_join_request", { p_request: requestId, p_approve: approve }, approve ? "Request approved." : "Request declined.", teamId);
}

export async function removeMember(teamId: string, userId: string): Promise<ActionState> {
  if (!uuid.safeParse(teamId).success || !uuid.safeParse(userId).success) return fail("Member not found.");
  return call("remove_member", { p_team: teamId, p_user: userId }, "Member removed.", teamId);
}

export async function leaveTeam(teamId: string): Promise<ActionState> {
  if (!uuid.safeParse(teamId).success) return fail("Team not found.");
  return call("leave_team", { p_team: teamId }, "You left the team.", teamId, { redirectTo: "/teams?tab=mine" });
}

export async function transferLeadership(teamId: string, userId: string): Promise<ActionState> {
  if (!uuid.safeParse(teamId).success || !uuid.safeParse(userId).success) return fail("Member not found.");
  return call("transfer_leadership", { p_team: teamId, p_user: userId }, "Leadership handed over.", teamId);
}
