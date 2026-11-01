import { z } from "zod";

/**
 * The one place that decides what a link is. Forms fix a link as the person leaves the
 * field, the server applies the same function before saving, and public pages apply it
 * again to older saved links. Pure: safe on the client and the server.
 */

export type LinkKind = "linkedin" | "github" | "instagram" | "twitter_x" | "youtube" | "behance" | "dribbble" | "figma" | "drive" | "whatsapp_group" | "meet" | "website" | "any";

export type LinkOptions = {
  /** The field's name, for the error message. */
  label?: string;
  /** A path on this site, like /events, is fine here. */
  allowPath?: boolean;
  /** A contact link: mailto: is fine here, and a bare email becomes one. */
  allowMailto?: boolean;
};

export type LinkResult = { ok: true; value: string; hint?: string } | { ok: false; error: string };

const EXAMPLES: Record<LinkKind, string> = {
  linkedin: "linkedin.com/in/riya-sharma",
  github: "github.com/riya",
  instagram: "instagram.com/fx.scriet",
  twitter_x: "x.com/fxscriet",
  youtube: "youtube.com/@fxscriet",
  behance: "behance.net/riya",
  dribbble: "dribbble.com/riya",
  figma: "figma.com/file/abc",
  drive: "drive.google.com/file/d/abc",
  whatsapp_group: "chat.whatsapp.com/AbCdEf",
  meet: "meet.google.com/abc-defg-hij",
  website: "riya.dev",
  any: "example.com/page",
};

const SITE_NAMES: Partial<Record<LinkKind, string>> = {
  linkedin: "LinkedIn",
  github: "GitHub",
  instagram: "Instagram",
  twitter_x: "X",
  youtube: "YouTube",
  behance: "Behance",
  dribbble: "Dribbble",
  figma: "Figma",
  drive: "Google Drive",
  whatsapp_group: "WhatsApp",
  meet: "Google Meet",
};

/** Where a site's links belong, and the address it is written with. */
const SITES: { kind: LinkKind; match: RegExp; host?: string }[] = [
  { kind: "linkedin", match: /^(?:[a-z]{1,3}\.)?linkedin\.com$/, host: "www.linkedin.com" },
  { kind: "github", match: /^(?:www\.)?github\.com$/, host: "github.com" },
  { kind: "instagram", match: /^(?:www\.|m\.)?instagram\.com$/, host: "www.instagram.com" },
  { kind: "twitter_x", match: /^(?:www\.|mobile\.|m\.)?(?:twitter|x)\.com$/, host: "x.com" },
  { kind: "youtube", match: /^(?:www\.|m\.|music\.)?youtube\.com$/, host: "www.youtube.com" },
  { kind: "youtube", match: /^youtu\.be$/ },
  { kind: "behance", match: /^(?:www\.)?behance\.net$/, host: "www.behance.net" },
  { kind: "dribbble", match: /^(?:www\.)?dribbble\.com$/, host: "dribbble.com" },
  { kind: "figma", match: /^(?:www\.)?figma\.com$/, host: "www.figma.com" },
  { kind: "drive", match: /^(?:drive|docs)\.google\.com$/ },
  { kind: "whatsapp_group", match: /^chat\.whatsapp\.com$/ },
  { kind: "meet", match: /^meet\.google\.com$/ },
];

const TRACKING = /^(?:utm_.*|fbclid|gclid|igsh|igshid|si)$/i;
// A last label from this list reads as a site, so "riya.dev" in the Instagram field is a site and "fx.scriet" a handle.
const COMMON_ENDINGS = /\.(?:com|org|net|in|io|dev|co|me|app|ai|edu|gov|info|xyz|site|online|tech|ly|gg|tv|be|ac|uk|us|page|link|studio|design|blog|live)$/i;

const HANDLE = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u;
const SEGMENT = /^[\p{L}\p{N}._~-]+$/u;

function tidyEnds(value: string): string {
  let out = value;
  for (;;) {
    const next = out
      .replace(/^[\s"'`“”‘’<>([{]+/, "")
      .replace(/[\s"'`“”‘’<>)\]},.;:]+$/, "");
    if (next === out) return out;
    out = next;
  }
}

/** A handle, or a handle's path, on the field's own site. Null when it is not one. */
function handleToUrl(value: string, kind: LinkKind): string | null {
  const at = value.startsWith("@");
  const text = (at ? value.slice(1) : value).replace(/^\/+|\/+$/g, "");
  if (!text) return null;
  const parts = text.split("/");
  if (!parts.every((p) => SEGMENT.test(p))) return null;
  const one = parts.length === 1 && HANDLE.test(text);
  // Handles with a dot exist on Instagram and YouTube; anywhere, "riya.dev" is a site.
  if (!at && COMMON_ENDINGS.test(parts[0])) return null;
  switch (kind) {
    case "linkedin":
      if (parts.length === 2 && /^(?:in|company|school|showcase|pub)$/i.test(parts[0])) return `https://www.linkedin.com/${parts[0].toLowerCase()}/${parts[1]}`;
      return one && !text.includes(".") ? `https://www.linkedin.com/in/${text}` : null;
    case "github":
      if (parts.length === 2 && !at) return `https://github.com/${parts[0]}/${parts[1]}`;
      return one && !text.includes(".") ? `https://github.com/${text}` : null;
    case "instagram":
      return one ? `https://www.instagram.com/${text}` : null;
    case "twitter_x":
      return one && !text.includes(".") ? `https://x.com/${text}` : null;
    case "youtube":
      return one ? `https://www.youtube.com/@${text}` : null;
    case "behance":
      return one && !text.includes(".") ? `https://www.behance.net/${text}` : null;
    case "dribbble":
      return one && !text.includes(".") ? `https://dribbble.com/${text}` : null;
    case "meet":
      return /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(text) ? `https://meet.google.com/${text.toLowerCase()}` : null;
    default:
      return null;
  }
}

/**
 * Cleans up and completes a link for one kind of field. Empty stays empty. Only input that
 * can't be a link is an error; a link from another site is kept, with a hint.
 */
export function normalizeLink(input: string | null | undefined, kind: LinkKind = "any", options: LinkOptions = {}): LinkResult {
  const fail = (): LinkResult => ({ ok: false, error: `${options.label ?? "This"} doesn't look like a link. Example: ${EXAMPLES[kind]}${options.allowPath ? " or /events" : ""}` });

  // Invisible characters and line breaks are never part of a link.
  let text = (input ?? "").replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "");
  text = tidyEnds(text.trim());
  if (!text) return { ok: true, value: "" };

  if (options.allowPath && /^\/(?!\/)/.test(text)) return /\s/.test(text) ? fail() : { ok: true, value: text };

  // Spaces only go when the start already looks like a link: "riya.dev /work", not "abc xyz".
  if (/\s/.test(text)) {
    if (!/[.:/\\]/.test(text.split(/\s/)[0])) return fail();
    text = text.replace(/\s+/g, "");
  }
  text = text.replace(/\\/g, "/");

  // "https//x", "https:/x", "Https://https://x" and "//x" are all the same address.
  let schemeFound = false;
  for (;;) {
    const next = text.replace(/^https?(?::\/*|\/+)/i, "");
    if (next === text) break;
    schemeFound = true;
    text = next;
  }
  text = text.replace(/^\/+/, "");
  if (!text) return fail();

  if (/^mailto:/i.test(text) || (options.allowMailto && /^[^\s@/]+@[^\s@/]+\.[^\s@/]{2,}$/.test(text))) {
    const address = text.replace(/^mailto:/i, "");
    return options.allowMailto && /^[^\s@/]+@[^\s@/]+\.[^\s@/]{2,}$/.test(address) ? { ok: true, value: `mailto:${address}` } : fail();
  }
  // Any other scheme (javascript:, data:, file: and so on). "x.com:8080" has a dot before its colon.
  if (/^[a-z][a-z0-9+-]*:/i.test(text)) return fail();

  let address = schemeFound ? null : handleToUrl(text, kind);
  if (!address) {
    // A link without a dot in its host is a lone word, not an address.
    if (!/^[^/?#]+\.[^/?#]+/.test(text)) return fail();
    address = `https://${text}`;
  }

  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return fail();
  }
  if (url.username || url.password) return fail();
  const host = url.hostname.toLowerCase();
  if (!/\.[\p{L}]{2,}$|\.xn--[a-z0-9-]+$/u.test(host) || host.includes("..")) return fail();

  const site = SITES.find((s) => s.match.test(host));
  if (site?.host) url.hostname = site.host;
  for (const name of [...url.searchParams.keys()]) if (TRACKING.test(name)) url.searchParams.delete(name);
  // A Meet address means the same with or without what comes after it.
  if (site?.kind === "meet") {
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.toLowerCase();
  }

  let value = url.toString();
  // The bare slash on a site's root, or at the end of a profile on a known site, says nothing.
  if (url.pathname === "/" && !url.search && !url.hash) value = value.replace(/\/$/, "");
  else if (site && url.pathname.endsWith("/") && !url.search && !url.hash) value = value.replace(/\/+$/, "");

  const expected = SITE_NAMES[kind];
  if (!expected || site?.kind === kind) return { ok: true, value };
  const other = site && SITE_NAMES[site.kind];
  return { ok: true, value, hint: other ? `This looks like a ${other} link. Is that right?` : `This doesn't look like a ${expected} link. Is that right?` };
}

/** A Zod string that comes out as the fixed link. Reports only real problems. */
export function linkField(label: string, kind: LinkKind = "any", options: { required?: boolean; allowPath?: boolean; allowMailto?: boolean; max?: number } = {}) {
  const max = options.max ?? 500;
  return z.string().transform((value, ctx) => {
    const result = normalizeLink(value, kind, { label, allowPath: options.allowPath, allowMailto: options.allowMailto });
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }
    if (!result.value && options.required) {
      ctx.addIssue({ code: "custom", message: `${label} is required. Example: ${EXAMPLES[kind]}` });
      return z.NEVER;
    }
    if (result.value.length > max) {
      ctx.addIssue({ code: "custom", message: `${label} is too long (max ${max} characters).` });
      return z.NEVER;
    }
    return result.value;
  });
}

/**
 * A saved link, ready for an href. Older links are fixed here as they are shown; one that
 * can't be made safe gives null, so it is not shown at all.
 */
export function linkHref(saved: string | null | undefined, kind: LinkKind = "any", options: { allowPath?: boolean } = {}): string | null {
  const result = normalizeLink(saved, kind, { ...options, allowMailto: true });
  return result.ok && result.value ? result.value : null;
}
