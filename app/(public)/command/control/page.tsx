import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DryRun, LevelGrid, NumbersForm, PausesForm, PermissionsGrid, SafeToAuto, UndoButton } from "@/components/autopilot/control-parts";
import { MasterButton } from "@/components/autopilot/center-parts";
import { CommunityToggles } from "@/components/autopilot/people-parts";
import { getAutopilotViewer, peopleById } from "@/lib/autopilot/server";
import type { Level } from "@/lib/autopilot/labels";

export const metadata: Metadata = { title: "Command Center · Control" };

export default async function ControlPage() {
  const viewer = (await getAutopilotViewer())!;
  if (!viewer.superAdmin) redirect("/command");
  const { supabase } = viewer;
  const [{ data: settings }, { data: permissions }, { data: log }, { data: playbooks }, { data: rules }, { data: missions }, { data: community }] = await Promise.all([
    supabase.from("autopilot_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("autopilot_permissions").select("action, label, allowed").order("action"),
    supabase.from("automation_log").select("id, at, area, action, reason, undo, undone_at, actor").order("at", { ascending: false }).limit(100),
    supabase.from("playbooks").select("id, name").eq("status", "active").order("sort"),
    supabase.from("autopilot_rules").select("id, name").order("name"),
    supabase.from("missions").select("id, title").in("status", ["planned", "active"]).order("mission_date"),
    supabase.from("community_settings").select("community_on, talent_on, projects_on").eq("id", 1).maybeSingle(),
  ]);
  const names = await peopleById(supabase, (log ?? []).map((l) => l.actor as string | null));
  const s = settings as { master: string; levels: Record<string, Level>; numbers: Record<string, number>; pauses: Record<string, string[]> } | null;
  return (
    <div className="space-y-6" data-control>
      <section className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface p-4">
        <div>
          <h2 className="font-serif text-lg text-ink">Master switch: {s?.master === "paused" ? "Paused" : "On"}</h2>
          <p className="text-sm text-ink/60">Paused: nothing new is created, offered, reminded or escalated. Nothing is lost; resuming carries on.</p>
        </div>
        <MasterButton on={s?.master !== "paused"} />
      </section>

      <section className="border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-lg text-ink">Automation levels</h2>
          <SafeToAuto />
        </div>
        <p className="mt-1 text-sm text-ink/60">Auto: it happens and is logged. Suggest: it is prepared and waits for one click in Today. Manual: Autopilot leaves it to people. Phone notifications send on Auto and Suggest; Manual turns them off.</p>
        <LevelGrid levels={s?.levels ?? {}} />
      </section>

      {community && (
        <section className="border border-line bg-surface p-4">
          <h2 className="font-serif text-lg text-ink">Community, Rising Talent, projects</h2>
          <p className="mt-1 text-sm text-ink/60">Head start, limits and Rising Talent thresholds are in Numbers below; who approves project support is in Permissions.</p>
          <CommunityToggles settings={community as { community_on: boolean; talent_on: boolean; projects_on: boolean }} />
        </section>
      )}

      <section className="border border-line bg-surface p-4">
        <h2 className="font-serif text-lg text-ink">Pauses</h2>
        <PausesForm pauses={s?.pauses ?? {}} playbooks={(playbooks ?? []) as { id: string; name: string }[]} rules={(rules ?? []) as { id: string; name: string }[]} missions={(missions ?? []) as { id: string; title: string }[]} />
      </section>

      <section className="border border-line bg-surface p-4">
        <h2 className="font-serif text-lg text-ink">Numbers</h2>
        <NumbersForm numbers={s?.numbers ?? {}} />
      </section>

      <section className="border border-line bg-surface p-4">
        <h2 className="font-serif text-lg text-ink">Permissions</h2>
        <p className="mt-1 text-sm text-ink/60">The super admin can always do everything.</p>
        <PermissionsGrid rows={(permissions ?? []) as { action: string; label: string; allowed: string[] }[]} />
      </section>

      <section className="border border-line bg-surface p-4">
        <h2 className="font-serif text-lg text-ink">Dry run</h2>
        <p className="mt-1 text-sm text-ink/60">What the next 7 days would do with today&apos;s settings. Nothing is changed.</p>
        <DryRun />
      </section>

      <section className="border border-line bg-surface p-4">
        <h2 className="font-serif text-lg text-ink">Automation log</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm" data-automation-log>
            <thead className="text-left text-xs text-ink/60"><tr><th className="p-1.5">When</th><th className="p-1.5">Area</th><th className="p-1.5">What</th><th className="p-1.5">Why</th><th className="p-1.5" /></tr></thead>
            <tbody className="divide-y divide-line">
              {((log ?? []) as { id: string; at: string; area: string; action: string; reason: string; undo: unknown; undone_at: string | null; actor: string | null }[]).map((l) => (
                <tr key={l.id} className={l.undone_at ? "opacity-55" : ""}>
                  <td className="whitespace-nowrap p-1.5 text-xs">{new Date(l.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="p-1.5 text-xs">{l.area.replace(/_/g, " ")}</td>
                  <td className="p-1.5">{l.action}{l.actor ? <span className="text-xs text-ink/60"> · {names.get(l.actor)?.full_name}</span> : <span className="text-xs text-ink/60"> · auto</span>}</td>
                  <td className="p-1.5 text-xs text-ink/70">{l.reason}</td>
                  <td className="p-1.5 text-right">{l.undone_at ? <span className="text-xs">undone</span> : l.undo ? <UndoButton id={l.id} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
