import { Fragment } from "react";

/**
 * An answer, shown as safe text: **bold**, "- " or "1. " lists, and links only to this
 * site, the official email and the known social pages. Everything else stays plain text;
 * no HTML from the answer is ever rendered.
 */

export type AllowedLinks = { site: string; external: string[] };

const LINK = /\[([^\]]{1,120})\]\((https?:\/\/[^\s)]+|\/[^\s)]*|mailto:[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b)/g;

function safeHref(href: string, allowed: AllowedLinks): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (href.startsWith("mailto:")) return allowed.external.includes(href) ? href : null;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.origin === new URL(allowed.site).origin) return url.pathname + url.search + url.hash;
    const bare = href.replace(/\/$/, "");
    return allowed.external.some((a) => a.replace(/\/$/, "") === bare || (a.endsWith("/") && href.startsWith(a))) ? href : null;
  } catch {
    return null;
  }
}

function inline(text: string, allowed: AllowedLinks, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(LINK)) {
    const at = m.index ?? 0;
    if (at > last) out.push(...bold(text.slice(last, at), `${key}-${n++}`));
    const label = m[1] ?? m[3] ?? m[4];
    const target = m[2] ?? m[3] ?? (m[4] ? `mailto:${m[4]}` : "");
    const href = safeHref(target, allowed);
    if (href) {
      const external = /^https?:/.test(href);
      out.push(
        <a key={`${key}-${n++}`} href={href} className="font-medium text-accent-text underline underline-offset-2" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {label}
        </a>,
      );
    } else out.push(<Fragment key={`${key}-${n++}`}>{label}</Fragment>);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(...bold(text.slice(last), `${key}-${n++}`));
  return out;
}

function bold(text: string, key: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : <Fragment key={`${key}-${i}`}>{part.replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2")}</Fragment>,
  );
}

export function AiText({ text, allowed }: { text: string; allowed: AllowedLinks }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{inline(item, allowed, `li${blocks.length}-${i}`)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length} className="ml-4 list-decimal space-y-0.5">{items}</ol> : <ul key={blocks.length} className="ml-4 list-disc space-y-0.5">{items}</ul>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ""), allowed, `p${blocks.length}`)}</p>);
  }
  flush();
  return <div className="space-y-2 break-words">{blocks}</div>;
}
