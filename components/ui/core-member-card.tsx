import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CutCard } from "@/components/ui/cut-card";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { GitHubIcon, LinkedInIcon, socialLink } from "@/components/ui/person-card";
import { ReadMore } from "@/components/ui/read-more";
import type { CoreMember } from "@/lib/data/core-teams";
import { cn, memberDetail } from "@/lib/utils";
import { linkHref } from "@/lib/validation/link";

/**
 * A team member, from their own profile, in the same card as PersonCard.
 * The photo is a plain <img>: it can be a Google or GitHub picture, which
 * next/image would refuse. `compact` is the short form for the home page.
 */
export function CoreMemberCard({ member, compact }: { member: CoreMember; compact?: boolean }) {
  const links = [
    { href: linkHref(member.linkedin_url, "linkedin"), label: "LinkedIn", icon: <LinkedInIcon /> },
    { href: linkHref(member.github_url, "github"), label: "GitHub", icon: <GitHubIcon /> },
    { href: linkHref(member.portfolio_url, "website"), label: "Portfolio", icon: <Globe size={16} aria-hidden /> },
  ].filter((link): link is { href: string; label: string; icon: React.ReactElement } => Boolean(link.href));

  const avatar = member.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element -- see above
    <img
      src={member.avatar_url}
      alt={`Photo of ${member.full_name}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={cn("shrink-0 rounded-full object-cover ring-1 ring-accent", compact ? "h-12 w-12" : "h-16 w-16")}
    />
  ) : (
    <InitialsAvatar name={member.full_name} className={compact ? undefined : "h-16 w-16 text-base"} />
  );
  const lead = member.is_lead && <Badge className="mt-2">Lead</Badge>;
  const bio = member.bio && <ReadMore text={member.bio} lines={3} limit={130} className={compact ? "mt-3" : "mt-5"} />;
  const linkList = links.length > 0 && (
    <ul className={cn("flex gap-1", compact ? "mt-2" : "mt-auto pt-5")}>
      {links.map((link) => (
        <li key={link.label}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${member.full_name} on ${link.label}`}
            title={link.label}
            className={socialLink}
          >
            {link.icon}
          </a>
        </li>
      ))}
    </ul>
  );

  if (compact) {
    return (
      <CutCard className="flex items-start gap-4">
        {avatar}
        <div className="min-w-0 pr-2">
          <h3 className="font-serif text-lg font-medium text-ink">{member.full_name}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink/70">{member.title}</p>
          {lead}
          {bio}
          {linkList}
        </div>
      </CutCard>
    );
  }

  const detail = memberDetail(member);
  return (
    <CutCard className="flex flex-col">
      <div className="flex items-start gap-4 pr-3">
        {avatar}
        <div className="min-w-0">
          <h3 className="font-serif text-xl font-medium text-ink">{member.full_name}</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink/70">{member.title}</p>
          {detail && <p className="mt-0.5 text-sm leading-relaxed text-ink/60">{detail}</p>}
          {lead}
        </div>
      </div>
      {bio}
      {linkList}
    </CutCard>
  );
}
