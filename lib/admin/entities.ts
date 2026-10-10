import { z } from "zod";
import type { Capability } from "@/lib/permissions/capabilities";
import { ICON_NAMES } from "@/lib/site-content/schema";
import type { createClient } from "@/lib/supabase/server";
import { fromIstInput } from "@/lib/events/format";
import type { BucketId } from "./storage";

/**
 * The admin panel's content types, described as data. One list page, one
 * form and one set of server actions (actions/admin-entities.ts) serve all of
 * them from these definitions: the fields, who may manage them, how they are
 * published and ordered, and which public pages show them.
 */

export type FieldDef = {
  /** Form field name and, unless `column` is set, the database column. */
  name: string;
  column?: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "slug"
    | "url"
    | "email"
    | "date"
    | "time"
    /** Date and time, entered and shown as Indian Standard Time. */
    | "datetime"
    | "number"
    | "select"
    | "checkbox"
    /** Comma-separated in the form, text[] in the database. */
    | "tags"
    /** One per line in the form, text[] in the database. */
    | "lines"
    | "image";
  required?: boolean;
  max?: number;
  rows?: number;
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Value a new record starts with. */
  initial?: string | boolean;
  /** Show a live character counter (textarea). */
  counter?: boolean;
  /** Image fields: where the file goes, and whether it is cropped square. */
  bucket?: BucketId;
  square?: boolean;
  /** Sits beside its neighbour on wide screens. */
  half?: boolean;
};

type Row = Record<string, unknown>;

export type EntityDef = {
  key: string;
  table: string;
  singular: string;
  plural: string;
  adminPath: string;
  /** Needed to see, create, edit, publish and reorder. */
  cap: Capability;
  /**
   * Who may delete:
   *  - "drafts-or-admin": anyone with `cap` may delete an unpublished record;
   *    a published one needs "content.delete_published"
   *  - "admin": always needs "content.delete_published"
   *  - "cap": anyone with `cap`
   * The database policies say the same thing.
   */
  deleteRule: "drafts-or-admin" | "admin" | "cap";
  titleColumn: string;
  searchColumns: string[];
  publish: { kind: "boolean"; column: string; on: string; off: string } | { kind: "status" };
  /** Has a display_order column and up/down controls. */
  orderable?: boolean;
  /** Lists are grouped (and ordered) within this column. */
  group?: { column: string; labels: Record<string, string> };
  /** Column set to the acting user's id on create. */
  ownerColumn?: string;
  defaultSort: { column: string; ascending: boolean };
  /** Extra columns in the list, beside the title and status. */
  listColumns: { label: string; value: (row: Row) => string }[];
  fields: FieldDef[];
  publicPaths: string[];
  viewHref: (row: Row) => string;
  /** Last-minute adjustments to the row before it is written. */
  prepare?: (values: Row, existing: Row | null) => void;
  /** Checks that span several fields, or need the database. Returns errors by field name. */
  validate?: (
    values: Row,
    existing: Row | null,
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => Promise<Record<string, string> | null>;
};

const date = (value: unknown) =>
  value ? new Date(String(value)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

const PUBLISHED = { kind: "boolean", column: "is_published", on: "Published", off: "Draft" } as const;
const PUBLISH_FIELD: FieldDef = {
  name: "is_published",
  label: "Published",
  type: "checkbox",
  hint: "Visible on the public site.",
};

export const PERSON_CATEGORY_LABELS: Record<string, string> = {
  founder: "Founding team",
  faculty_guide: "Faculty guides",
  senior_mentor: "Senior mentors",
  core_team: "Core team",
  advisor: "Advisors",
};

export const ENTITIES = {
  team: {
    key: "team",
    table: "org_people",
    singular: "Team profile",
    plural: "Team",
    adminPath: "/admin/team",
    cap: "team",
    deleteRule: "cap",
    titleColumn: "full_name",
    searchColumns: ["full_name", "role_title"],
    publish: { kind: "boolean", column: "is_visible", on: "Visible", off: "Hidden" },
    orderable: true,
    group: { column: "category", labels: PERSON_CATEGORY_LABELS },
    defaultSort: { column: "display_order", ascending: true },
    listColumns: [{ label: "Role", value: (r) => String(r.role_title ?? "") }],
    fields: [
      {
        name: "photo",
        column: "photo_path",
        label: "Photo",
        type: "image",
        bucket: "team-photos",
        square: true,
        hint: "JPEG, PNG or WEBP, up to 2MB. Cropped to a square.",
      },
      { name: "full_name", label: "Name", type: "text", required: true, max: 120, half: true },
      { name: "role_title", label: "Role title", type: "text", required: true, max: 200, half: true },
      {
        name: "category",
        label: "Category",
        type: "select",
        required: true,
        options: [
          { value: "founder", label: "Founder" },
          { value: "faculty_guide", label: "Faculty guide" },
          { value: "senior_mentor", label: "Senior mentor" },
          { value: "core_team", label: "Core team" },
          { value: "advisor", label: "Advisor" },
        ],
      },
      { name: "about", label: "About", type: "textarea", max: 1200, rows: 6, counter: true },
      { name: "email", label: "Email (shown publicly if filled)", type: "email", half: true },
      { name: "linkedin_url", label: "LinkedIn", type: "url", half: true },
      { name: "github_url", label: "GitHub", type: "url", half: true },
      { name: "portfolio_url", label: "Portfolio", type: "url", half: true },
      { name: "is_visible", label: "Visible on the site", type: "checkbox", initial: true },
    ],
    publicPaths: ["/founders", "/"],
    viewHref: () => "/founders",
  },

  programs: {
    key: "programs",
    table: "programs",
    singular: "Program",
    plural: "Programs",
    adminPath: "/admin/programs",
    cap: "content",
    deleteRule: "admin",
    titleColumn: "name",
    searchColumns: ["name", "summary"],
    publish: { kind: "boolean", column: "is_visible", on: "Visible", off: "Hidden" },
    orderable: true,
    defaultSort: { column: "display_order", ascending: true },
    listColumns: [{ label: "Slug", value: (r) => String(r.slug ?? "") }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 160, half: true },
      {
        name: "slug",
        label: "Slug",
        type: "slug",
        required: true,
        max: 60,
        half: true,
        hint: "Lowercase letters, numbers and hyphens. Used in the link: /programs#slug",
      },
      { name: "summary", label: "Summary", type: "textarea", required: true, max: 600, rows: 3 },
      { name: "details", label: "Detail points", type: "lines", hint: "One per line.", rows: 6 },
      {
        name: "icon_name",
        label: "Icon",
        type: "select",
        options: [{ value: "", label: "None" }, ...ICON_NAMES.map((n) => ({ value: n, label: n }))],
      },
      { name: "is_visible", label: "Visible on the site", type: "checkbox", initial: true },
    ],
    publicPaths: ["/programs", "/"],
    viewHref: (r) => `/programs#${r.slug}`,
  },

  events: {
    key: "events",
    table: "events",
    singular: "Event",
    plural: "Events",
    adminPath: "/admin/events",
    cap: "content",
    deleteRule: "drafts-or-admin",
    titleColumn: "title",
    searchColumns: ["title", "venue"],
    publish: PUBLISHED,
    ownerColumn: "created_by",
    defaultSort: { column: "event_date", ascending: false },
    listColumns: [
      { label: "Date", value: (r) => date(r.event_date) },
      { label: "Status", value: (r) => String(r.status ?? "") },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200 },
      { name: "description", label: "Description", type: "textarea", required: true, max: 3000, rows: 5 },
      { name: "event_date", label: "Date", type: "date", required: true, half: true },
      { name: "event_time", label: "Time", type: "time", half: true },
      { name: "venue", label: "Venue", type: "text", max: 200, half: true },
      { name: "organizer", label: "Organizer", type: "text", max: 200, half: true },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        initial: "upcoming",
        half: true,
        options: [
          { value: "upcoming", label: "Upcoming" },
          { value: "live", label: "Live" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" },
        ],
      },
      {
        name: "registration_capacity",
        label: "Capacity",
        type: "number",
        half: true,
        hint: "Leave empty for no limit.",
      },
      {
        name: "end_date",
        label: "Ends (IST)",
        type: "datetime",
        half: true,
        hint: "Used for the calendar entry.",
      },
      {
        name: "registration_deadline",
        label: "Registration closes (IST)",
        type: "datetime",
        half: true,
        hint: "Leave empty to keep registration open until you close it.",
      },
      {
        name: "registration_url",
        label: "External registration link",
        type: "url",
        hint: "Leave empty to take registrations on this site.",
      },
      { name: "registration_open", label: "Registration open", type: "checkbox", initial: true, half: true },
      {
        name: "waitlist_enabled",
        label: "Waitlist when full",
        type: "checkbox",
        half: true,
        hint: "People who register after the last seat wait in line for a cancellation.",
      },
      {
        name: "certificate_enabled",
        label: "Certificates for this event",
        type: "checkbox",
        hint: "Lets an admin issue a certificate to everyone who was checked in.",
      },
      {
        name: "certificate_title",
        label: "Certificate title",
        type: "text",
        required: true,
        max: 80,
        initial: "Certificate of Participation",
      },
      { name: "signatory_1_name", label: "Signatory 1 name", type: "text", max: 80, half: true },
      { name: "signatory_1_title", label: "Signatory 1 title", type: "text", max: 120, half: true },
      { name: "signatory_2_name", label: "Signatory 2 name", type: "text", max: 80, half: true },
      { name: "signatory_2_title", label: "Signatory 2 title", type: "text", max: 120, half: true },
      {
        name: "poster",
        column: "poster_path",
        label: "Cover image",
        type: "image",
        bucket: "event-posters",
        hint: "JPEG, PNG or WEBP, up to 4MB.",
      },
      PUBLISH_FIELD,
    ],
    publicPaths: ["/events", "/"],
    viewHref: (r) => `/events/${r.id}`,
    validate: async (values, existing, supabase) => {
      const errors: Record<string, string> = {};
      const start = new Date(`${values.event_date}T${String(values.event_time ?? "23:59").slice(0, 5)}:00+05:30`).getTime();
      const deadline = values.registration_deadline ? new Date(String(values.registration_deadline)).getTime() : null;
      const end = values.end_date ? new Date(String(values.end_date)).getTime() : null;
      if (deadline !== null && deadline > start) {
        errors.registration_deadline = "Registration has to close before the event starts.";
      }
      if (end !== null && end <= start) errors.end_date = "The event has to end after it starts.";
      if (values.signatory_1_title && !values.signatory_1_name) errors.signatory_1_name = "Add a name for this title.";
      if (values.signatory_2_title && !values.signatory_2_name) errors.signatory_2_name = "Add a name for this title.";

      // Capacity can't drop below the seats already taken.
      const capacity = values.registration_capacity as number | null;
      if (existing && capacity !== null && capacity !== undefined) {
        const { count } = await supabase
          .from("event_registrations")
          .select("*", { count: "exact", head: true })
          .eq("event_id", existing.id as string)
          .in("status", ["registered", "attended"]);
        if ((count ?? 0) > capacity) {
          errors.registration_capacity = `${count} people are already registered. Capacity can't be lower than that.`;
        }
      }
      return Object.keys(errors).length ? errors : null;
    },
  },

  opportunities: {
    key: "opportunities",
    table: "opportunities",
    singular: "Opportunity",
    plural: "Opportunities",
    adminPath: "/admin/opportunities",
    cap: "content",
    deleteRule: "drafts-or-admin",
    titleColumn: "title",
    searchColumns: ["title", "organizer"],
    publish: PUBLISHED,
    ownerColumn: "created_by",
    defaultSort: { column: "created_at", ascending: false },
    listColumns: [
      { label: "Organizer", value: (r) => String(r.organizer ?? "") },
      { label: "Deadline", value: (r) => date(r.deadline) },
      { label: "Status", value: (r) => String(r.status ?? "").replace(/_/g, " ") },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200 },
      { name: "organizer", label: "Organizer", type: "text", required: true, max: 200, half: true },
      {
        name: "category",
        label: "Category",
        type: "select",
        required: true,
        half: true,
        options: [
          { value: "hackathon", label: "Hackathon" },
          { value: "competition", label: "Competition" },
          { value: "research", label: "Research" },
          { value: "internship", label: "Internship" },
          { value: "workshop", label: "Workshop" },
          { value: "scholarship", label: "Scholarship" },
          { value: "conference", label: "Conference" },
          { value: "innovation_challenge", label: "Innovation challenge" },
        ],
      },
      { name: "description", label: "Description", type: "textarea", required: true, max: 3000, rows: 5 },
      { name: "eligibility", label: "Eligibility", type: "textarea", max: 500, rows: 2 },
      { name: "deadline", label: "Deadline", type: "date", half: true },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        initial: "open",
        half: true,
        options: [
          { value: "open", label: "Open" },
          { value: "closing_soon", label: "Closing soon" },
          { value: "closed", label: "Closed" },
        ],
      },
      { name: "registration_url", label: "Details / registration link", type: "url" },
      PUBLISH_FIELD,
    ],
    publicPaths: ["/opportunities"],
    viewHref: () => "/opportunities",
  },

  resources: {
    key: "resources",
    table: "resources",
    singular: "Resource",
    plural: "Resources",
    adminPath: "/admin/resources",
    cap: "content",
    deleteRule: "drafts-or-admin",
    titleColumn: "title",
    searchColumns: ["title", "category"],
    publish: PUBLISHED,
    orderable: true,
    ownerColumn: "author_id",
    defaultSort: { column: "display_order", ascending: true },
    listColumns: [
      { label: "Category", value: (r) => String(r.category ?? "") },
      { label: "Audience", value: (r) => (r.visibility === "members" ? "Members only" : "Everyone") },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200 },
      { name: "description", label: "Description", type: "textarea", max: 1000, rows: 3 },
      { name: "category", label: "Category", type: "text", required: true, max: 80, half: true },
      {
        name: "visibility",
        label: "Who can see it",
        type: "select",
        required: true,
        initial: "public",
        half: true,
        options: [
          { value: "public", label: "Everyone" },
          { value: "members", label: "Signed-in members only" },
        ],
      },
      { name: "url", label: "Link", type: "url" },
      PUBLISH_FIELD,
    ],
    publicPaths: ["/resources"],
    viewHref: () => "/resources",
  },

  announcements: {
    key: "announcements",
    table: "announcements",
    singular: "Announcement",
    plural: "Announcements",
    adminPath: "/admin/announcements",
    cap: "content",
    deleteRule: "drafts-or-admin",
    titleColumn: "title",
    searchColumns: ["title", "category"],
    publish: { kind: "status" },
    ownerColumn: "author_id",
    defaultSort: { column: "created_at", ascending: false },
    listColumns: [
      { label: "Category", value: (r) => String(r.category ?? "") },
      { label: "Published", value: (r) => date(r.published_at) },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200 },
      { name: "content", label: "Content", type: "textarea", required: true, max: 3000, rows: 6 },
      { name: "category", label: "Category", type: "text", max: 80, half: true },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        initial: "draft",
        half: true,
        options: [
          { value: "draft", label: "Draft" },
          { value: "published", label: "Published" },
          { value: "archived", label: "Archived" },
        ],
      },
    ],
    publicPaths: ["/"],
    viewHref: () => "/search",
    prepare: (values, existing) => {
      if (values.status === "published") {
        if (existing?.status !== "published") values.published_at = new Date().toISOString();
      } else {
        values.published_at = null;
      }
    },
  },

  mentors: {
    key: "mentors",
    table: "mentors",
    singular: "Mentor",
    plural: "Mentors",
    adminPath: "/admin/mentors",
    cap: "content",
    deleteRule: "drafts-or-admin",
    titleColumn: "name",
    searchColumns: ["name", "role_title"],
    publish: PUBLISHED,
    orderable: true,
    ownerColumn: "created_by",
    defaultSort: { column: "display_order", ascending: true },
    listColumns: [{ label: "Role", value: (r) => String(r.role_title ?? "") }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, max: 120, half: true },
      { name: "role_title", label: "Role or title", type: "text", required: true, max: 160, half: true },
      { name: "expertise", label: "Expertise", type: "tags", hint: "Separate with commas." },
      { name: "experience", label: "Experience", type: "text", max: 300 },
      { name: "availability", label: "Availability", type: "text", max: 200, half: true },
      { name: "linkedin_url", label: "LinkedIn", type: "url", half: true },
      { name: "bio", label: "Bio", type: "textarea", max: 1000, rows: 4, counter: true },
      PUBLISH_FIELD,
    ],
    publicPaths: ["/mentors"],
    viewHref: () => "/mentors",
  },
} satisfies Record<string, EntityDef>;

export type EntityKey = keyof typeof ENTITIES;

export function getEntity(key: string): EntityDef | null {
  return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? (ENTITIES[key as EntityKey] as EntityDef) : null;
}

export function isPublished(def: EntityDef, row: Row): boolean {
  return def.publish.kind === "status" ? row.status === "published" : Boolean(row[def.publish.column]);
}

export function publishLabel(def: EntityDef, row: Row): string {
  if (def.publish.kind === "status") return String(row.status ?? "draft");
  return row[def.publish.column] ? def.publish.on : def.publish.off;
}

// ---------------------------------------------------------------------------
// Form parsing
// ---------------------------------------------------------------------------

const HTTP_URL = /^https?:\/\/[^\s]+$/i;

function fieldSchema(f: FieldDef): z.ZodType {
  const required = (label: string) => `${label} is required`;
  switch (f.type) {
    case "text":
    case "textarea": {
      const max = f.max ?? 300;
      const base = z.string().trim().max(max, `Keep this under ${max} characters`);
      return f.required ? base.min(1, required(f.label)) : base;
    }
    case "slug":
      return z
        .string()
        .trim()
        .min(1, required(f.label))
        .max(f.max ?? 60)
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only");
    case "url":
      return z
        .string()
        .trim()
        .max(500)
        .refine((v) => (v === "" ? !f.required : HTTP_URL.test(v) && URL.canParse(v)), "Enter a full link starting with https://");
    case "email":
      return z
        .string()
        .trim()
        .max(200)
        .refine((v) => (v === "" ? !f.required : z.email().safeParse(v).success), "Enter a valid email address");
    case "date":
      return z
        .string()
        .trim()
        .refine((v) => (v === "" ? !f.required : /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), f.required ? "Pick a date" : "Enter a valid date");
    case "datetime":
      return z
        .string()
        .trim()
        .refine(
          (v) => (v === "" ? !f.required : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))),
          "Pick a date and time",
        );
    case "time":
      return z
        .string()
        .trim()
        .refine((v) => v === "" || /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v), "Enter a valid time");
    case "number":
      return z
        .string()
        .trim()
        .refine((v) => (v === "" ? !f.required : /^\d{1,7}$/.test(v)), "Enter a whole number");
    case "select": {
      const allowed = (f.options ?? []).map((o) => o.value);
      return z.string().refine((v) => allowed.includes(v) && (v !== "" || !f.required), `Choose a ${f.label.toLowerCase()}`);
    }
    case "checkbox":
      return z.boolean();
    case "tags":
    case "lines":
      return z.array(z.string().max(120, "Keep each item under 120 characters")).max(30, "Keep this to 30 items");
    case "image":
      return z.any();
  }
}

/**
 * Reads and validates an entity form. Returns the row to write (image
 * columns excluded; the action handles uploads) or per-field errors.
 */
export function parseEntityForm(
  def: EntityDef,
  formData: FormData,
): { ok: true; values: Row } | { ok: false; fieldErrors: Record<string, string> } {
  const shape: Record<string, z.ZodType> = {};
  const raw: Row = {};

  for (const f of def.fields) {
    if (f.type === "image") continue;
    shape[f.name] = fieldSchema(f);
    const value = formData.get(f.name);
    if (f.type === "checkbox") raw[f.name] = value === "on";
    else if (f.type === "tags" || f.type === "lines") {
      raw[f.name] = String(value ?? "")
        .split(f.type === "tags" ? "," : /\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
    } else raw[f.name] = typeof value === "string" ? value : "";
  }

  const parsed = z.object(shape).safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const values: Row = {};
  for (const f of def.fields) {
    if (f.type === "image") continue;
    const value = (parsed.data as Row)[f.name];
    const column = f.column ?? f.name;
    if (f.type === "number") values[column] = value === "" ? null : Number(value);
    else if (f.type === "datetime") values[column] = value === "" ? null : fromIstInput(String(value));
    else if (typeof value === "string" && value === "" && !f.required) values[column] = null;
    else values[column] = value;
  }
  return { ok: true, values };
}
