"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { acceptIdea, ideaChoice, joinProject } from "@/actions/autopilot-auto";
import { useRun } from "./center-parts";

export type IdeaCardData = {
  id: string; kind: "project" | "research"; title: string; pitch: string; level: number | null; learn: string | null; data: Record<string, unknown>;
  state: "saved" | "hidden" | null; teams: { project_id: string; started_by: string; joinable: boolean }[]; hubs: string[];
};

const LEVEL = ["", "Beginner", "Easy", "Intermediate", "Advanced", "Startup-grade"];
const LABEL: Record<string, string> = {
  problem: "Problem", users: "Users", solution: "Solution", different: "What's different", mvp: "MVP", stack: "Stack", data: "Free data / APIs", effort: "Effort",
  validate: "How to validate", measures: "Measures", startup_path: "Startup path", risks: "Risks", opportunity: "Matching opportunity", question: "Question", method: "Method",
  data_sources: "Data sources", plan: "Plan", output: "Output", mentor: "Mentor",
};
const show = (v: unknown): string => (Array.isArray(v) ? v.join(" · ") : v && typeof v === "object" ? Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${show(x)}`).join(" | ") : String(v ?? ""));

/** One idea: level, what you'll learn, the full detail on demand, and the member's three choices. */
export function IdeaCard({ idea }: { idea: IdeaCardData }) {
  const { pending, run } = useRun();
  const [variation, setVariation] = useState(idea.kind === "research" ? "paper" : "lite");
  const [ask, setAsk] = useState(false);
  const joinable = idea.teams.filter((t) => t.joinable);
  return (
    <article className="flex h-full min-w-0 flex-col border border-line bg-surface p-4" data-idea-card={idea.level ?? 0}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {idea.level && <span className="border border-accent px-2 py-0.5 font-semibold text-accent-text" data-level>Level {idea.level} · {LEVEL[idea.level]}</span>}
        {idea.kind === "research" && <span className="border border-line px-2 py-0.5 text-ink/75">Research · needs a mentor</span>}
        {idea.state === "saved" && <span className="text-ink/70">Saved</span>}
      </div>
      <h3 className="mt-2 break-words font-serif text-lg leading-snug text-ink">{idea.title}</h3>
      <p className="mt-1 text-sm text-ink/80">{idea.pitch}</p>
      {idea.learn && <p className="mt-2 text-sm text-ink/70"><strong className="font-semibold text-ink">You&apos;ll learn:</strong> {idea.learn}</p>}
      <details className="mt-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-accent-text underline">Full detail</summary>
        <dl className="mt-1 space-y-1 text-sm">{Object.entries(idea.data).filter(([k, v]) => LABEL[k] && show(v)).map(([k, v]) => <div key={k}><dt className="inline font-semibold text-ink">{LABEL[k]}: </dt><dd className="inline break-words text-ink/80">{show(v)}</dd></div>)}</dl>
      </details>
      {idea.teams.length > 0 && (
        <div className="mt-2 text-sm text-ink/80" data-idea-teams>
          {idea.teams.length > 1 ? `${idea.teams.length} teams are building this` : `Started by ${idea.teams[0].started_by || "a member"}`}
          {idea.teams.filter((t) => t.joinable).slice(0, 2).map((t) => (
            <button key={t.project_id} type="button" disabled={pending} className="ml-2 inline-flex min-h-11 items-center underline" onClick={() => run(() => joinProject(t.project_id))}>ask to join {t.started_by || "the"}&apos;s team</button>
          ))}
        </div>
      )}
      {ask && (
        // Someone is already building this: join them, or start your own version anyway.
        <div className="mt-3 border border-accent bg-accent/5 p-3 text-sm" role="group" aria-label="Someone is already building this" data-accept-choice>
          <p className="text-ink">
            {joinable.length === 1 ? <><strong>{joinable[0].started_by || "A member"}</strong>&apos;s team is already building this.</> : <><strong>{joinable.length} teams</strong> are already building this.</>}
            {" "}Ask to join them (the owner accepts), or start your own version?
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {joinable.slice(0, 3).map((t) => (
              <Button key={t.project_id} size="sm" className="min-h-11" disabled={pending} onClick={() => run(() => joinProject(t.project_id), () => setAsk(false))} data-join-existing>
                Ask to join {t.started_by || "their"}&apos;s team
              </Button>
            ))}
            <Button size="sm" variant="secondary" className="min-h-11" disabled={pending} onClick={() => run(() => acceptIdea(idea.id, variation))} data-start-own>Start my own version</Button>
            <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setAsk(false)}>Cancel</Button>
          </div>
        </div>
      )}
      <div className="mt-auto flex flex-col gap-2 pt-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select aria-label="Plan" value={variation} onChange={(e) => setVariation(e.target.value)} className="min-h-11 sm:w-44">
          {idea.kind === "research" ? <><option value="paper">Paper</option><option value="patent">Idea to patent</option></> : <><option value="lite">Lite · 4 weeks</option><option value="standard">Standard · 8 weeks</option><option value="ambitious">Ambitious · 12 weeks</option></>}
        </Select>
        <Button size="sm" className="min-h-11" disabled={pending} onClick={() => (joinable.length ? setAsk(true) : run(() => acceptIdea(idea.id, variation)))} data-accept-idea>Accept and start</Button>
        {idea.state !== "saved" && <Button size="sm" variant="secondary" className="min-h-11" disabled={pending} onClick={() => run(() => ideaChoice(idea.id, "saved"))}>Save for later</Button>}
        <Button size="sm" variant="ghost" className="min-h-11" disabled={pending} onClick={() => run(() => ideaChoice(idea.id, "hidden"))} data-not-for-me>Not for me</Button>
      </div>
    </article>
  );
}
