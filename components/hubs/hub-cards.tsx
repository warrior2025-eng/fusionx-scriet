import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CutCard } from "@/components/ui/cut-card";
import { Badge } from "@/components/ui/badge";
import { NamedIcon } from "@/components/ui/named-icon";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { paragraphs, splitHubs } from "@/lib/data/hubs";
import { cn } from "@/lib/utils";
import type { Hub } from "@/types/database";

/** The accent outline and tint that set FusionX Teams apart from the operational hubs. */
export const HIGHLIGHT =
  "![--card-line:var(--color-accent)] ![--card-bg:color-mix(in_srgb,var(--color-accent)_8%,var(--color-surface))]";

/** The "Collaborative Network" badge and its note. */
export function HubTypeLabel({ hub, className }: { hub: Hub; className?: string }) {
  if (!hub.type_label) return null;
  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      <Badge>{hub.type_label}</Badge>
      {hub.type_note && <span className="text-xs text-ink/70">{hub.type_note}</span>}
    </div>
  );
}

function ExploreLink({ hub }: { hub: Hub }) {
  return (
    <Link
      href={`/hubs/${hub.slug}`}
      className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-medium text-accent"
    >
      <span className="link-slide">Explore hub</span>
      <span className="sr-only">: {hub.name}</span>
      <ArrowRight size={14} className="arrow-nudge" />
    </Link>
  );
}

/**
 * The hubs as cards: the operational ones in a grid, then FusionX Teams (and
 * any other collaborative hub) as a full-width highlighted card.
 */
export function HubCards({ hubs }: { hubs: Hub[] }) {
  const { operational, network } = splitHubs(hubs);
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {operational.map((hub, i) => (
          <ScrollReveal key={hub.slug} delay={i * 60} className="h-full">
            <CutCard interactive className="flex flex-col">
              {hub.icon_name && (
                <span className="mb-4 text-ink/70 transition-colors group-hover:text-accent">
                  <NamedIcon name={hub.icon_name} size={20} />
                </span>
              )}
              <h3 className="font-serif text-xl font-medium text-ink">{hub.name}</h3>
              {hub.tagline && <p className="mt-1.5 text-sm font-medium text-ink/80">{hub.tagline}</p>}
              <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink/70">{paragraphs(hub.about)[0] ?? hub.summary}</p>
              <ExploreLink hub={hub} />
            </CutCard>
          </ScrollReveal>
        ))}
      </div>
      {network.map((hub) => (
        <ScrollReveal key={hub.slug} className="mt-5 block">
          <CutCard interactive className={cn("flex flex-col md:p-9", HIGHLIGHT)}>
            <div className="grid gap-6 md:grid-cols-[1fr_2fr] md:items-start">
              <div>
                {hub.icon_name && (
                  <span className="mb-4 inline-flex text-accent">
                    <NamedIcon name={hub.icon_name} size={24} />
                  </span>
                )}
                <h3 className="font-serif text-2xl font-medium text-ink">{hub.name}</h3>
                {hub.tagline && <p className="mt-1.5 text-sm font-medium text-ink/80">{hub.tagline}</p>}
                <HubTypeLabel hub={hub} className="mt-4" />
              </div>
              <div className="flex flex-col">
                <p className="text-sm leading-relaxed text-ink/75 md:text-base">{paragraphs(hub.about)[0] ?? hub.summary}</p>
                <ExploreLink hub={hub} />
              </div>
            </div>
          </CutCard>
        </ScrollReveal>
      ))}
    </>
  );
}
