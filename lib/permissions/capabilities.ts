import type { AppRole } from "@/types/database";

/**
 * What a role may do in the admin panel. This file is the app-layer statement
 * of the permission model; the database enforces the same rules again through
 * RLS and triggers (supabase/migrations/0002 and 0008), which is the boundary
 * that actually matters. The sidebar, the pages and every server action read
 * from here so the three can never disagree.
 *
 * Pure data: safe to import from client components.
 */
export type Capability =
  /** May open /admin at all. */
  | "admin.access"
  /** Create / edit / publish content: events, opportunities, resources,
   *  announcements, mentors, programs, page content and lists. */
  | "content"
  /** Delete content that is published (drafts only need "content"). */
  | "content.delete_published"
  /** Moderate member work: projects, research and project teams. */
  | "moderation"
  /** Delete a member's project or research entry. */
  | "moderation.delete"
  /** Team profiles (org_people). */
  | "team"
  /** Issue event certificates, manage signatures and check-in volunteers. */
  | "certificates"
  /** View users, deactivate / reactivate accounts, export. */
  | "users"
  | "applications"
  | "messages"
  | "broadcast"
  | "media"
  | "audit"
  /** Site identity, banner, registration controls, footer, SEO. */
  | "settings"
  /** Grant and revoke roles. */
  | "roles"
  /** Maintenance mode and the danger zone. */
  | "danger";

const EDITOR: readonly Capability[] = ["admin.access", "content", "moderation"];

const ADMIN: readonly Capability[] = [
  ...EDITOR,
  "content.delete_published",
  "moderation.delete",
  "team",
  "certificates",
  "users",
  "applications",
  "messages",
  "broadcast",
  "media",
  "audit",
  "settings",
];

const SUPER_ADMIN: readonly Capability[] = [...ADMIN, "roles", "danger"];

export const ROLE_CAPABILITIES: Record<AppRole, readonly Capability[]> = {
  super_admin: SUPER_ADMIN,
  admin: ADMIN,
  editor: EDITOR,
  faculty: [],
  mentor: [],
  member: [],
};

export function capabilitiesFor(roles: readonly AppRole[]): Capability[] {
  const set = new Set<Capability>();
  for (const role of roles) for (const cap of ROLE_CAPABILITIES[role] ?? []) set.add(cap);
  return [...set];
}

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  editor: "Editor",
  faculty: "Faculty",
  mentor: "Mentor",
  member: "Member",
};

export const ALL_ROLES: readonly AppRole[] = ["super_admin", "admin", "editor", "faculty", "mentor", "member"];
