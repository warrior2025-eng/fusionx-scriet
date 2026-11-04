import type { Metadata } from "next";
import Link from "next/link";
import { refreshAiKnowledge, saveAiSettings, testAiConnection } from "@/actions/admin-ai";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, CheckboxField, TextField, TextareaField } from "@/components/admin/admin-form";
import { AdminPage, Panel, Pill } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import { buildKnowledge } from "@/lib/ai/knowledge";
import { GEMINI_MODELS, aiConfigured, type AiSettings } from "@/lib/ai/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin: FusionX AI" };

const OUTCOMES = { answered: "Answered", dont_know: "Didn't know", declined: "Declined", fallback: "From the facts", resting: "Resting" } as const;
const FILTERS = [
  { key: "", label: "All" },
  { key: "dont_know", label: "Didn't know" },
  { key: "declined", label: "Declined" },
] as const;

export default async function AiSettingsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireCapability("settings", "/admin/settings/ai");
  const { q } = await searchParams;
  const filter = FILTERS.find((f) => f.key === q)?.key ?? "";
  const { data } = await ctx.supabase.from("ai_settings").select("*").eq("id", true).maybeSingle();
  const settings = data as AiSettings | null;
  const crumbs = [{ label: "Settings", href: "/admin/settings" }, { label: "FusionX AI" }];
  if (!settings) {
    return (
      <AdminPage title="FusionX AI" crumbs={crumbs}>
        <Panel>
          <p className="text-sm text-ink">Run migration 0038 (supabase/migrations/0038_fusionx_ai.sql) to set up FusionX AI.</p>
        </Panel>
      </AdminPage>
    );
  }
  let questions = ctx.supabase.from("ai_questions").select("id, question, outcome, created_at").order("created_at", { ascending: false }).limit(50);
  if (filter) questions = questions.eq("outcome", filter);
  const [{ data: asked }, pack] = await Promise.all([questions, buildKnowledge(settings.extra_facts)]);
  const configured = aiConfigured();

  return (
    <AdminPage
      title="FusionX AI"
      description="The assistant at the bottom right of public pages. It answers only about FusionX, only from public information."
      crumbs={crumbs}
    >
      <div className="space-y-6">
        <Panel title="Status">
          <ul className="space-y-1.5 text-sm text-ink">
            <li className="flex flex-wrap items-center gap-2">
              Gemini key: {configured ? <Pill tone="good">Set on the server</Pill> : <Pill tone="bad">Not set</Pill>}
              {!configured && <span className="text-ink/70">Add GEMINI_API_KEY in Vercel (server only). Until then the assistant is hidden.</span>}
            </li>
            <li className="flex flex-wrap items-center gap-2">
              Groq fallback: {process.env.GROQ_API_KEY ? <Pill tone="good">Set</Pill> : <Pill>Not set (optional)</Pill>}
            </li>
            <li>
              Models, tried in turn: <code className="text-xs">{GEMINI_MODELS.join(", ")}</code>
            </li>
            <li>
              On public pages: {settings.enabled && configured ? <Pill tone="good">Showing</Pill> : <Pill>Hidden</Pill>}
            </li>
          </ul>
          <div className="mt-4">
            <ActionButton action={testAiConnection} disabled={!configured}>
              Test the connection
            </ActionButton>
          </div>
        </Panel>

        <Panel title="Settings">
          <AdminForm action={saveAiSettings}>
            <CheckboxField name="enabled" label="Show FusionX AI on public pages" defaultChecked={settings.enabled} />
            <TextareaField name="welcome" label="Welcome message" defaultValue={settings.welcome} rows={2} max={500} counter />
            <TextareaField name="suggestions" label="Suggested questions (one per line, up to 6)" defaultValue={settings.suggestions.join("\n")} rows={4} />
            <TextareaField
              name="extra_facts"
              label="Extra public facts"
              hint="Everything here can be shown to anyone. For FAQs the site pages don't answer. Never put private details here."
              defaultValue={settings.extra_facts}
              rows={6}
              max={8000}
              counter
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField name="visitor_limit" label="Questions per visitor every 10 minutes" type="number" min={1} max={100} defaultValue={String(settings.visitor_limit)} />
              <TextField name="daily_cap" label="Questions per day, for everyone" type="number" min={1} max={5000} defaultValue={String(settings.daily_cap)} hint="Keep this below the free quota." />
            </div>
            <CheckboxField name="log_questions" label="Keep questions for 30 days to improve the facts" hint="Only the question text and how it was answered. No address, name or email." defaultChecked={settings.log_questions} />
          </AdminForm>
        </Panel>

        <Panel title="What FusionX AI knows" description="Built only from what a signed-out visitor can see, and the extra facts above. Check that nothing private is in it.">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <ActionButton action={refreshAiKnowledge}>Refresh knowledge</ActionButton>
            <span className="text-xs text-ink/65">
              {pack.sections.length} sections, {pack.text.length.toLocaleString("en-IN")} characters. Rebuilt every 15 minutes on its own.
            </span>
          </div>
          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap border border-line bg-paper p-3 text-xs leading-relaxed text-ink" data-ai-knowledge>
            {pack.text}
          </pre>
        </Panel>

        <Panel title="Recent questions" description={settings.log_questions ? "The last 50, kept for 30 days." : "Keeping questions is off."}>
          <nav aria-label="Filter questions" className="mb-3 flex gap-4 text-sm">
            {FILTERS.map((f) => (
              <Link key={f.key} href={f.key ? `?q=${f.key}` : "?"} className={cn("pb-1", filter === f.key ? "border-b-2 border-accent font-medium text-ink" : "text-ink/65 hover:text-ink")}>
                {f.label}
              </Link>
            ))}
          </nav>
          {asked?.length ? (
            <ul className="divide-y divide-line text-sm">
              {asked.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <span className="min-w-0 flex-1 break-words text-ink">{a.question}</span>
                  <span className="flex items-center gap-2 text-xs text-ink/60">
                    <Pill tone={a.outcome === "answered" ? "good" : a.outcome === "dont_know" ? "warn" : "neutral"}>{OUTCOMES[a.outcome as keyof typeof OUTCOMES] ?? a.outcome}</Pill>
                    {new Date(a.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink/65">No questions yet.</p>
          )}
        </Panel>
      </div>
    </AdminPage>
  );
}
