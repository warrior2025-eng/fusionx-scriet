import Image from "next/image";
import { Globe, Mail } from "lucide-react";
import { CutCard } from "@/components/ui/cut-card";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { ReadMore } from "@/components/ui/read-more";
import type { OrgPerson } from "@/types/database";

// lucide-react no longer ships brand marks, so these two are drawn here.
function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.5h.05c.53-1 1.83-1.75 3.4-1.75 3.6 0 4.25 2.2 4.25 5.1v6.15h-4v-5.4c0-1.3-.03-2.95-1.85-2.95-1.85 0-2.15 1.4-2.15 2.85v5.5h-3.5v-11Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

const socialLink =
  "inline-flex h-8 w-8 items-center justify-center rounded-sm text-ink/65 transition-colors duration-150 hover:bg-ink/5 hover:text-accent";

/**
 * One of the organization's people: photo (or the initials avatar), name,
 * role, about text, and icons for whichever links they have.
 * `compact` is the short form used on the home page: no about, no links.
 */
export function PersonCard({ person, compact }: { person: OrgPerson; compact?: boolean }) {
  const links = [
    person.linkedin_url && { href: person.linkedin_url, label: "LinkedIn", icon: <LinkedInIcon /> },
    person.github_url && { href: person.github_url, label: "GitHub", icon: <GitHubIcon /> },
    person.portfolio_url && { href: person.portfolio_url, label: "Portfolio", icon: <Globe size={16} aria-hidden /> },
    person.email && { href: `mailto:${person.email}`, label: "Email", icon: <Mail size={16} aria-hidden /> },
  ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode }[];

  const size = compact ? 48 : 64;
  const avatar = person.photo_path ? (
    <Image
      src={person.photo_path}
      alt={`Photo of ${person.full_name}`}
      width={size * 2}
      height={size * 2}
      className="shrink-0 rounded-full object-cover ring-1 ring-accent"
      style={{ width: size, height: size }}
    />
  ) : (
    <InitialsAvatar name={person.full_name} className={compact ? undefined : "h-16 w-16 text-base"} />
  );

  if (compact) {
    return (
      <CutCard className="flex items-start gap-4">
        {avatar}
        <div className="min-w-0 pr-2">
          <h3 className="font-serif text-lg font-medium text-ink">{person.full_name}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink/70">{person.role_title}</p>
        </div>
      </CutCard>
    );
  }

  return (
    <CutCard className="flex flex-col">
      <div className="flex items-start gap-4 pr-3">
        {avatar}
        <div className="min-w-0">
          <h3 className="font-serif text-xl font-medium text-ink">{person.full_name}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink/70">{person.role_title}</p>
        </div>
      </div>
      {person.about && <ReadMore text={person.about} className="mt-5" />}
      {links.length > 0 && (
        <ul className="mt-auto flex gap-1 pt-5">
          {links.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                target={link.href.startsWith("mailto:") ? undefined : "_blank"}
                rel="noopener noreferrer"
                aria-label={`${person.full_name} on ${link.label}`}
                title={link.label}
                className={socialLink}
              >
                {link.icon}
              </a>
            </li>
          ))}
        </ul>
      )}
    </CutCard>
  );
}
