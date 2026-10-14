"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, FileText, X } from "lucide-react";
import { saveRecruitmentDraft, submitRecruitmentApplication, uploadRecruitmentFile } from "@/actions/recruitment";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/field";
import { SlotPicker } from "@/components/recruitment/slot-picker";
import { questionsFor, type Answer, type Question } from "@/lib/recruitment/shared";
import { MODE_LABELS, dayLabel, slotRange, type SlotAvailability } from "@/lib/recruitment/slots";
import { cn } from "@/lib/utils";

export type ApplyDraft = {
  full_name: string;
  department: string;
  year: string;
  preferences: string[];
  answers: Record<string, Answer>;
  links: { portfolio: string; github: string; linkedin: string };
  resume_path: string | null;
  website: string;
};

type Team = { id: string; name: string; short_description: string | null; emoji: string | null };

type StepName = "About you" | "Teams" | "Questions" | "Resume and links" | "Interview slot" | "Review";
const BASE_STEPS: StepName[] = ["About you", "Teams", "Questions", "Resume and links", "Review"];
const ORDINALS = ["1st", "2nd", "3rd", "4th"];

const isBlank = (answer: Answer | undefined) =>
  answer === undefined || (Array.isArray(answer) ? answer.length === 0 : answer.trim() === "");

/**
 * The application form: short steps (an interview slot step when the cycle
 * has slots), saved as a draft while it is being filled in. The database decides what is accepted; the checks here only
 * point at what is missing before the applicant tries to submit.
 */
export function ApplyForm({
  cycleId,
  maxPreferences,
  teams,
  questions,
  initial,
  slots = [],
  slotRequired = false,
  instructions = "",
}: {
  cycleId: string;
  maxPreferences: number;
  teams: Team[];
  questions: Question[];
  initial: ApplyDraft;
  /** The cycle's interview slots; the slot step appears only when there are some. */
  slots?: SlotAvailability[];
  slotRequired?: boolean;
  instructions?: string;
}) {
  const STEPS: StepName[] = slots.length > 0 ? ["About you", "Teams", "Questions", "Resume and links", "Interview slot", "Review"] : BASE_STEPS;
  const [mySlot, setMySlot] = useState<SlotAvailability | null>(slots.find((x) => x.mine) ?? null);
  const onSlotChange = useCallback((slot: SlotAvailability | null) => setMySlot(slot), []);
  const router = useRouter();
  const [form, setForm] = useState<ApplyDraft>(initial);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  // Each change bumps the version; a save records the version it wrote. The
  // draft is "dirty" while the two differ, so a change made during a save is
  // never mistaken for saved.
  const [version, setVersion] = useState(0);
  const [savedVersion, setSavedVersion] = useState(0);
  const dirty = version !== savedVersion;

  const update = (patch: Partial<ApplyDraft>) => {
    setForm((now) => ({ ...now, ...patch }));
    setVersion((v) => v + 1);
  };

  const save = async () => {
    if (!dirty) return true;
    const writing = version;
    setSaved("saving");
    const result = await saveRecruitmentDraft(cycleId, form);
    if (!result.ok) {
      setSaved("error");
      setProblem(result.message ?? "Could not save your draft.");
      return false;
    }
    setSavedVersion(writing);
    setSaved("saved");
    return true;
  };

  // Autosave a moment after the last change.
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => void save(), 1500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, savedVersion]);

  const chosen = form.preferences.map((id) => teams.find((t) => t.id === id)).filter((t): t is Team => Boolean(t));
  const asked = questionsFor(questions, form.preferences);
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "";

  // What is still missing on a step, or null when it is complete.
  const missing = (index: number): string | null => {
    const name = STEPS[index];
    if (name === "About you" && !form.full_name.trim()) return "Add your name.";
    if (name === "Teams" && form.preferences.length === 0) return "Choose at least one team.";
    if (name === "Interview slot" && slotRequired && !mySlot) return "Choose your interview slot.";
    if (name === "Questions") {
      const open = asked.find((q) => q.required && isBlank(form.answers[q.id]));
      if (open) return `Please answer: ${open.label}`;
      const long = asked.find((q) => {
        const a = form.answers[q.id];
        return q.max_length && typeof a === "string" && a.length > q.max_length;
      });
      if (long) return `Your answer to "${long.label}" is too long.`;
    }
    return null;
  };

  const go = async (to: number) => {
    setProblem(null);
    if (to > step) {
      const gap = missing(step);
      if (gap) return setProblem(gap);
    }
    await save();
    setStep(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = () => {
    setProblem(null);
    for (let i = 0; i < STEPS.length - 1; i++) {
      const gap = missing(i);
      if (gap) {
        setStep(i);
        return setProblem(gap);
      }
    }
    startSubmit(async () => {
      const result = await submitRecruitmentApplication(cycleId, form);
      if (!result.ok) return setProblem(result.message ?? "Could not submit. Please try again.");
      router.push("/recruitment/status?submitted=1");
    });
  };

  const upload = async (slot: string, file: File | undefined, done: (path: string) => void) => {
    if (!file) return;
    setProblem(null);
    setUploading(slot);
    const data = new FormData();
    data.set("file", file);
    const result = await uploadRecruitmentFile(cycleId, slot, data);
    setUploading(null);
    if (!result.path) return setProblem(result.message ?? "Could not upload the file.");
    done(result.path);
  };

  const togglePreference = (id: string) => {
    if (form.preferences.includes(id)) return update({ preferences: form.preferences.filter((p) => p !== id) });
    if (form.preferences.length >= maxPreferences) {
      return setProblem(`You can choose up to ${maxPreferences} team${maxPreferences === 1 ? "" : "s"}.`);
    }
    setProblem(null);
    update({ preferences: [...form.preferences, id] });
  };
  const movePreference = (index: number, by: number) => {
    const next = [...form.preferences];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    update({ preferences: next });
  };
  const setAnswer = (id: string, value: Answer) => update({ answers: { ...form.answers, [id]: value } });

  const fileRow = (slot: string, path: string | null, onPath: (path: string | null) => void) => (
    <div>
      {path ? (
        <p className="flex items-center gap-2 text-sm text-ink">
          <FileText size={16} aria-hidden /> PDF uploaded
          <button type="button" className="text-ink/60 underline underline-offset-2 hover:text-ink" onClick={() => onPath(null)}>
            Remove
          </button>
        </p>
      ) : null}
      <input
        type="file"
        accept="application/pdf"
        disabled={uploading !== null}
        aria-label={path ? "Replace the PDF" : "Upload a PDF"}
        onChange={(e) => void upload(slot, e.target.files?.[0], onPath)}
        className="mt-2 block w-full text-sm text-ink file:mr-3 file:rounded-sm file:border file:border-ink/30 file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-ink"
      />
      {uploading === slot && <p className="mt-1 text-xs text-ink/60">Uploading…</p>}
    </div>
  );

  const question = (q: Question) => {
    const value = form.answers[q.id];
    const text = typeof value === "string" ? value : "";
    const list = Array.isArray(value) ? value : [];
    const id = `q-${q.id}`;
    return (
      <div key={q.id}>
        <Label htmlFor={id}>
          {q.label}
          {q.required && <span className="text-red-600"> *</span>}
        </Label>
        {q.type === "short_text" && (
          <Input id={id} value={text} maxLength={q.max_length ?? 300} onChange={(e) => setAnswer(q.id, e.target.value)} />
        )}
        {q.type === "url" && (
          <Input id={id} type="url" placeholder="https://" value={text} maxLength={300} onChange={(e) => setAnswer(q.id, e.target.value)} />
        )}
        {q.type === "long_text" && (
          <>
            <Textarea id={id} rows={5} value={text} maxLength={q.max_length ?? 5000} onChange={(e) => setAnswer(q.id, e.target.value)} />
            {q.max_length && (
              <p className="mt-1 text-right text-xs tabular-nums text-ink/60">
                {text.length} / {q.max_length}
              </p>
            )}
          </>
        )}
        {q.type === "single_choice" && (
          <div className="space-y-2" role="radiogroup" aria-labelledby={id}>
            {q.options.map((option) => (
              <label key={option} className="flex items-center gap-2.5 text-sm text-ink">
                <input type="radio" name={id} checked={text === option} onChange={() => setAnswer(q.id, option)} className="h-4 w-4 accent-[var(--color-accent)]" />
                {option}
              </label>
            ))}
          </div>
        )}
        {q.type === "multi_choice" && (
          <div className="space-y-2">
            {q.options.map((option) => (
              <label key={option} className="flex items-center gap-2.5 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={list.includes(option)}
                  onChange={(e) => setAnswer(q.id, e.target.checked ? [...list, option] : list.filter((o) => o !== option))}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                {option}
              </label>
            ))}
          </div>
        )}
        {q.type === "file" && fileRow(q.id, text || null, (path) => setAnswer(q.id, path ?? ""))}
        {q.help_text && <FieldHint>{q.help_text}</FieldHint>}
      </div>
    );
  };

  const reviewRow = (label: string, value: string) => (
    <div className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-ink/65">{label}</dt>
      <dd className="whitespace-pre-line break-words text-sm text-ink sm:col-span-2">{value || "Not given"}</dd>
    </div>
  );

  return (
    <div>
      {/* Progress */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-sm">
          <p className="font-medium text-ink">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </p>
          <p aria-live="polite" className="text-ink/60">
            {saved === "saving" ? "Saving…" : saved === "saved" ? "Draft saved" : saved === "error" ? "Not saved" : ""}
          </p>
        </div>
        <div className="h-1 w-full bg-line" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1}>
          <div className="h-1 bg-accent transition-[width] duration-200" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      {/* Honeypot: hidden from people, tempting to bots. */}
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update({ website: e.target.value })} />
        </label>
      </div>

      {STEPS[step] === "About you" && (
        <div className="space-y-5">
          <div>
            <Label htmlFor="full_name">
              Full name<span className="text-red-600"> *</span>
            </Label>
            <Input id="full_name" value={form.full_name} maxLength={160} onChange={(e) => update({ full_name: e.target.value })} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="department">Department</Label>
              <Input id="department" value={form.department} maxLength={120} onChange={(e) => update({ department: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="year">Year</Label>
              <Input id="year" value={form.year} maxLength={40} placeholder="For example: 2nd Year" onChange={(e) => update({ year: e.target.value })} />
            </div>
          </div>
        </div>
      )}

      {STEPS[step] === "Teams" && (
        <div className="space-y-6">
          <p className="text-sm text-ink/70">
            Choose up to {maxPreferences} team{maxPreferences === 1 ? "" : "s"}, in order of preference.
          </p>
          {chosen.length > 0 && (
            <ol className="space-y-2">
              {chosen.map((team, i) => (
                <li key={team.id} className="flex items-center justify-between gap-3 border border-accent bg-accent-soft px-4 py-3">
                  <span className="min-w-0 text-sm text-ink">
                    <span className="mr-2 font-semibold">{ORDINALS[i]} choice</span>
                    {team.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <button type="button" aria-label={`Move ${team.name} up`} disabled={i === 0} onClick={() => movePreference(i, -1)} className="p-1.5 text-ink disabled:opacity-30">
                      <ArrowUp size={16} />
                    </button>
                    <button type="button" aria-label={`Move ${team.name} down`} disabled={i === chosen.length - 1} onClick={() => movePreference(i, 1)} className="p-1.5 text-ink disabled:opacity-30">
                      <ArrowDown size={16} />
                    </button>
                    <button type="button" aria-label={`Remove ${team.name}`} onClick={() => togglePreference(team.id)} className="p-1.5 text-ink">
                      <X size={16} />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <ul className="grid gap-3 sm:grid-cols-2">
            {teams.map((team) => {
              const picked = form.preferences.includes(team.id);
              return (
                <li key={team.id}>
                  <button
                    type="button"
                    aria-pressed={picked}
                    onClick={() => togglePreference(team.id)}
                    className={cn(
                      "flex h-full w-full items-start gap-3 border px-4 py-3 text-left transition-colors",
                      picked ? "border-accent" : "border-ink/20 hover:border-ink/50",
                    )}
                  >
                    <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border", picked ? "border-accent bg-accent text-white" : "border-ink/40")}>
                      {picked && <Check size={14} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">
                        {team.emoji ? `${team.emoji} ` : ""}
                        {team.name}
                      </span>
                      {team.short_description && <span className="mt-1 block text-sm text-ink/70">{team.short_description}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {STEPS[step] === "Questions" && (
        <div className="space-y-8">
          {asked.length === 0 && <p className="text-sm text-ink/70">There are no questions for this application.</p>}
          {asked.some((q) => q.team_id === null) && <div className="space-y-6">{asked.filter((q) => q.team_id === null).map(question)}</div>}
          {form.preferences.map((teamId) => {
            const own = asked.filter((q) => q.team_id === teamId);
            if (own.length === 0) return null;
            return (
              <fieldset key={teamId} className="space-y-6 border-t border-line pt-6">
                <legend className="pr-3 text-sm font-semibold text-ink">For {teamName(teamId)}</legend>
                {own.map(question)}
              </fieldset>
            );
          })}
        </div>
      )}

      {STEPS[step] === "Resume and links" && (
        <div className="space-y-6">
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Resume (optional)</p>
            {fileRow("resume", form.resume_path, (path) => update({ resume_path: path }))}
            <FieldHint>PDF only, up to 3MB.</FieldHint>
          </div>
          {(["portfolio", "github", "linkedin"] as const).map((key) => (
            <div key={key}>
              <Label htmlFor={`link-${key}`}>{key === "portfolio" ? "Portfolio (optional)" : key === "github" ? "GitHub (optional)" : "LinkedIn (optional)"}</Label>
              <Input
                id={`link-${key}`}
                type="url"
                placeholder="https://"
                maxLength={300}
                value={form.links[key]}
                onChange={(e) => update({ links: { ...form.links, [key]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      )}

      {STEPS[step] === "Interview slot" && (
        <SlotPicker cycleId={cycleId} initial={slots} instructions={instructions} onChange={onSlotChange} />
      )}

      {STEPS[step] === "Review" && (
        <div>
          <p className="mb-4 text-sm text-ink/70">Check your application. After you submit, you can withdraw it but not edit it.</p>
          {slots.length > 0 && instructions && (
            <p className="mb-4 border border-line bg-accent-soft px-4 py-3 text-sm leading-relaxed text-ink">{instructions}</p>
          )}
          <dl className="divide-y divide-line border-y border-line">
            {reviewRow("Name", form.full_name)}
            {reviewRow("Department", form.department)}
            {reviewRow("Year", form.year)}
            {reviewRow("Teams", chosen.map((t, i) => `${ORDINALS[i]}: ${t.name}`).join("\n"))}
            {asked.map((q) => (
              <div key={q.id} className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm text-ink/65">
                  {q.label}
                  {q.team_id && <span className="block text-xs">{teamName(q.team_id)}</span>}
                </dt>
                <dd className="whitespace-pre-line break-words text-sm text-ink sm:col-span-2">
                  {q.type === "file"
                    ? form.answers[q.id]
                      ? "PDF uploaded"
                      : "Not given"
                    : Array.isArray(form.answers[q.id])
                      ? (form.answers[q.id] as string[]).join(", ") || "Not given"
                      : (form.answers[q.id] as string) || "Not given"}
                </dd>
              </div>
            ))}
            {reviewRow("Resume", form.resume_path ? "PDF uploaded" : "")}
            {reviewRow("Links", [form.links.portfolio, form.links.github, form.links.linkedin].filter(Boolean).join("\n"))}
            {slots.length > 0 &&
              reviewRow(
                "Interview slot",
                mySlot ? `${dayLabel(mySlot.day)}, ${slotRange(mySlot.starts_at, mySlot.ends_at)} IST (${MODE_LABELS[mySlot.mode]})` : "",
              )}
          </dl>
        </div>
      )}

      {problem && (
        <p role="alert" className="mt-6 border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {problem}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={() => void go(step - 1)} disabled={step === 0 || submitting}>
          <ArrowLeft size={15} /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => void go(step + 1)} disabled={uploading !== null}>
            Continue <ArrowRight size={15} />
          </Button>
        ) : (
          <Button type="button" onClick={submit} loading={submitting}>
            Submit application
          </Button>
        )}
      </div>
    </div>
  );
}
