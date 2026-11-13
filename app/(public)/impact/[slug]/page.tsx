import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { createClient } from "@/lib/supabase/server";
import { hubLabel } from "@/lib/autopilot/labels";

type Story = {
  id: string; slug: string; title: string; goal: string; variation: string | null; playbook: string | null; done_at: string; summary: string | null;
  timeline: { title: string; at: string }[]; outcome_links: string[]; people: { name: string; avatar_url: string | null; role: string; department: string | null }[];
  hubs: string[]; outside: number; attendance: number; event_title: string | null;
};

async function load(slug: string): Promise<Story | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("ap_story", { p_slug: slug });
  return ((data ?? []) as Story[])[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const story = await load((await params).slug);
  if (!story) return { title: "Story" };
  // Public, positive fields only.
  return { title: story.title, description: story.summary ?? story.goal ?? `${story.title}: completed by FusionX@SCRIET.` };
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** A finished public mission's story: goal, plan, milestones, outcomes and the people who chose to show. */
export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const story = await load((await params).slug);
  if (!story) notFound();
  return (
    <Section className="max-w-3xl pb-24 pt-14">
      <Link href="/impact" className="text-sm underline">← Impact</Link>
      <Eyebrow>{story.playbook ?? "Mission"}{story.variation ? ` · ${story.variation}` : ""}</Eyebrow>
      <h1 className="font-serif text-4xl tracking-tight text-ink" data-story-title>{story.title}</h1>
      <p className="mt-2 text-sm text-ink/70">Completed ✓ {day(story.done_at)} · {story.hubs.map(hubLabel).join(" · ")}</p>
      {story.summary ? <p className="mt-5 text-lg leading-relaxed text-ink/85" data-story-summary>{story.summary}</p> : story.goal && <p className="mt-5 text-lg text-ink/85">{story.goal}</p>}
      {story.event_title && <p className="mt-3 text-sm text-ink/75">{story.event_title}{story.attendance ? ` · ${story.attendance} attended` : ""}</p>}

      <h2 className="mt-10 font-serif text-2xl text-ink">How it came together</h2>
      <ol className="mt-4 space-y-2" data-story-timeline>
        {story.timeline.map((t) => <li key={t.title + t.at} className="flex items-start gap-2"><Check size={16} className="mt-1 shrink-0 text-accent-text" aria-hidden /><span className="text-ink">{t.title} <span className="text-sm text-ink/60">· {day(t.at)}</span></span></li>)}
      </ol>

      {story.outcome_links.length > 0 && (
        <>
          <h2 className="mt-10 font-serif text-2xl text-ink">Outcomes</h2>
          <ul className="mt-3 space-y-1">{story.outcome_links.map((l) => <li key={l}><a href={l} target="_blank" rel="noopener noreferrer" className="text-accent-text underline break-all">{l}</a></li>)}</ul>
        </>
      )}

      {(story.people.length > 0 || story.outside > 0) && (
        <>
          <h2 className="mt-10 font-serif text-2xl text-ink">The people</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {story.people.map((p) => (
              <li key={p.name} className="flex items-start gap-3 border border-line bg-surface p-3">
                {p.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">{p.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</span>}
                <span><span className="font-medium text-ink">{p.name}</span>{p.department && <span className="text-sm text-ink/60"> · {p.department}</span>}<span className="block text-sm text-ink/75">{p.role}</span></span>
              </li>
            ))}
          </ul>
          {story.outside > 0 && <p className="mt-3 text-sm text-ink/70">With {story.outside} contributor{story.outside === 1 ? "" : "s"} from outside the Core team.</p>}
        </>
      )}
    </Section>
  );
}
