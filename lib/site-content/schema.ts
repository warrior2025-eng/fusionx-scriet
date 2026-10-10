import { z } from "zod";
import { buildPipeline, coreAreas, journeyStages, siteName } from "@/lib/site-config";

/**
 * The typed content store: every key in the `site_content` table, the Zod
 * schema its JSON value must satisfy, and its default.
 *
 * The defaults are the copy the site shipped with. They are what renders
 * whenever a key has no row, or its row is missing a field or fails
 * validation, so an empty or half-edited value can never break a page.
 *
 * `scope` mirrors the column the database policies read: 'content' keys can
 * be edited by editors, 'settings' keys by admins only.
 *
 * Pure data: safe to import from client components.
 */

/** Icons that content can refer to by name (see components/ui/named-icon.tsx). */
export const ICON_NAMES = [
  "Hammer",
  "FlaskConical",
  "Users",
  "Trophy",
  "Sparkles",
  "Lightbulb",
  "Rocket",
  "BookOpen",
  "Shield",
  "Briefcase",
  "Target",
  "Cpu",
  "Network",
  "GraduationCap",
  "Wrench",
  "Search",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

/** Pages that have their own SEO entry. */
export const SEO_PAGES = [
  { key: "home", label: "Home", path: "/" },
  { key: "about", label: "About", path: "/about" },
  { key: "programs", label: "Programs", path: "/programs" },
  { key: "projects", label: "Projects", path: "/projects" },
  { key: "research", label: "Research & IP", path: "/research" },
  { key: "events", label: "Events", path: "/events" },
  { key: "opportunities", label: "Opportunities", path: "/opportunities" },
  { key: "founders", label: "Team", path: "/founders" },
  { key: "contact", label: "Contact", path: "/contact" },
  { key: "join", label: "Join", path: "/join" },
] as const;
export type SeoPageKey = (typeof SEO_PAGES)[number]["key"];

/** Home sections that can be switched off. */
export const HOME_SECTIONS = [
  { key: "activity", label: "Activity panel" },
  { key: "pipeline", label: "Idea to impact pipeline" },
  { key: "coreAreas", label: "Core areas" },
  { key: "programs", label: "Programs" },
  { key: "projects", label: "Projects" },
  { key: "events", label: "Events" },
  { key: "team", label: "Founding team" },
  { key: "join", label: "Join call to action" },
] as const;

const text = (max: number) => z.string().trim().min(1, "This can't be empty").max(max, `Keep this under ${max} characters`);
const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);

/** An internal path ("/join") or an http(s) URL. */
const href = z
  .string()
  .trim()
  .min(1, "Add a link")
  .max(300)
  .refine((v) => /^\/(?!\/)/.test(v) || /^https?:\/\//i.test(v), "Use a path like /join or a full https:// link");

const link = z.object({ label: text(60), href });

export const CONTENT = {
  "home.hero": {
    scope: "content",
    schema: z.object({
      eyebrow: text(80),
      /** Line breaks are kept: each line of the textarea is a line of the headline. */
      headline: text(120),
      /** The one word (or phrase) of the headline shown in the accent colour. */
      highlight: optionalText(40),
      /** "{name}" is replaced with the chapter name. */
      description: text(400),
      primaryCta: link,
      secondaryCta: link,
    }),
    fallback: {
      eyebrow: "A Student-Led Movement",
      headline: "Ideas Grow\nHere.",
      highlight: "Grow",
      description:
        "{name} brings together students, ideas, and opportunities to build, research, and create real-world impact, together.",
      primaryCta: { label: "Explore Programs", href: "/programs" },
      secondaryCta: { label: "Join the Network", href: "/join" },
    },
  },
  "home.sections": {
    scope: "content",
    schema: z.object({
      activity: z.boolean(),
      pipeline: z.boolean(),
      coreAreas: z.boolean(),
      programs: z.boolean(),
      projects: z.boolean(),
      events: z.boolean(),
      team: z.boolean(),
      join: z.boolean(),
    }),
    fallback: {
      activity: true,
      pipeline: true,
      coreAreas: true,
      programs: true,
      projects: true,
      events: true,
      team: true,
      join: true,
    },
  },
  "about.page": {
    scope: "content",
    schema: z.object({ mission: text(1500), vision: text(1500), why: text(2500) }),
    fallback: {
      mission:
        "To give students at SCRIET a structured path from an early idea to a real outcome: a working project, a piece of research, a protected innovation, or a competition result. It does this by connecting them with the right people, programs, and resources at each stage.",
      vision:
        "A student-led network where building, researching, and collaborating across disciplines is the norm, not the exception, starting at SCRIET and, over time, extending into an inter-college network of FusionX chapters.",
      why: "SCRIET already has student clubs focused on events, competitions, and engagement. FusionX doesn’t aim to replace them. It exists to fill the gap between those events and long-term outcomes. That gap is the idea-to-impact pipeline: idea, learning, project, research, prototype, publication or patent, competition, and onward into incubation or continued development. FusionX works as a complementary layer that can connect students, projects, research, competitions, and mentorship across whichever clubs and departments they’re already part of.",
    },
  },
  "lists.pipeline": {
    scope: "content",
    schema: z.array(text(40)).min(2, "Add at least two stages").max(12, "Keep this to 12 stages"),
    fallback: [...buildPipeline] as string[],
  },
  "lists.journey": {
    scope: "content",
    schema: z.array(text(40)).min(2, "Add at least two stages").max(12, "Keep this to 12 stages"),
    fallback: [...journeyStages] as string[],
  },
  "lists.core_areas": {
    scope: "content",
    schema: z
      .array(z.object({ label: text(30), icon: z.enum(ICON_NAMES) }))
      .min(1, "Add at least one area")
      .max(8, "Keep this to 8 areas"),
    fallback: [
      { label: coreAreas[0], icon: "Hammer" },
      { label: coreAreas[1], icon: "FlaskConical" },
      { label: coreAreas[2], icon: "Users" },
      { label: coreAreas[3], icon: "Trophy" },
      { label: coreAreas[4], icon: "Sparkles" },
    ] as { label: string; icon: IconName }[],
  },
  "footer.columns": {
    scope: "settings",
    schema: z
      .array(z.object({ heading: text(40), links: z.array(link).min(1, "Add at least one link").max(10) }))
      .min(1, "Add at least one column")
      .max(4, "Keep this to 4 columns"),
    fallback: [
      {
        heading: "Explore",
        links: [
          { href: "/about", label: "About" },
          { href: "/programs", label: "Programs" },
          { href: "/projects", label: "Projects" },
          { href: "/research", label: "Research & IP" },
        ],
      },
      {
        heading: "Participate",
        links: [
          { href: "/opportunities", label: "Opportunities" },
          { href: "/events", label: "Events" },
          { href: "/teams", label: "Teams" },
          { href: "/mentors", label: "Mentors" },
          { href: "/join", label: "Join FusionX" },
        ],
      },
      {
        heading: "Organization",
        links: [
          { href: "/founders", label: "Founding Team" },
          { href: "/resources", label: "Resources" },
          { href: "/contact", label: "Contact" },
          { href: "/privacy", label: "Privacy Policy" },
          { href: "/terms", label: "Terms & Code of Conduct" },
        ],
      },
    ],
  },
  "seo.default": {
    scope: "settings",
    schema: z.object({
      defaultTitle: text(120),
      /** Must contain %s, which becomes the page's own title. */
      titleTemplate: text(120).refine((v) => v.includes("%s"), "Include %s where the page title goes"),
      description: text(300),
    }),
    fallback: {
      defaultTitle: `${siteName} | Student Innovation & Research Network`,
      titleTemplate: `%s | ${siteName}`,
      description:
        "A student-led ecosystem at SCRIET, CCS University Meerut for building projects, exploring research, forming interdisciplinary teams, and turning ideas into impact.",
    },
  },
  "seo.pages": {
    scope: "settings",
    schema: z.record(
      z.string(),
      z.object({
        title: optionalText(120).optional(),
        description: optionalText(300).optional(),
        ogImage: optionalText(500).optional(),
      }),
    ),
    fallback: {} as Record<string, { title?: string; description?: string; ogImage?: string }>,
  },
} as const;

export type ContentKey = keyof typeof CONTENT;
export type ContentValue<K extends ContentKey> = z.infer<(typeof CONTENT)[K]["schema"]>;

export const CONTENT_KEYS = Object.keys(CONTENT) as ContentKey[];

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Lays a value over its default, field by field. A field that is missing,
 * null or an empty string keeps the default, so clearing one input in the
 * admin panel brings back the original copy instead of leaving a gap.
 */
export function withFallback(fallback: unknown, value: unknown): unknown {
  if (value === undefined || value === null || value === "") return fallback;
  if (isPlainObject(fallback) && isPlainObject(value)) {
    const out: Record<string, unknown> = { ...fallback };
    for (const [key, v] of Object.entries(value)) out[key] = withFallback(fallback[key], v);
    return out;
  }
  if (Array.isArray(value) && value.length === 0 && Array.isArray(fallback)) return fallback;
  return value;
}
