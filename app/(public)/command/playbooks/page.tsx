import type { Metadata } from "next";
import Link from "next/link";
import { RuleToggle } from "@/components/autopilot/playbook-editor";
import { getAutopilotViewer } from "@/lib/autopilot/server";

export const metadata: Metadata = { title: "Command Center · Playbooks" };

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NTH = ["", "1st", "2nd", "3rd", "4th", "last"];

export default async function PlaybooksPage() {
  const viewer = (await getAutopilotViewer())!;
  const { supabase } = viewer;
  const [{ data: playbooks }, { data: variations }, { data: tasks }, { data: rules }, { data: canEdit }] = await Promise.all([
    supabase.from("playbooks").select("id, name, description, status, version, exam_safe, needs_mentor_approval").order("status").order("sort"),
    supabase.from("playbook_variations").select("playbook_id, name").order("sort"),
    supabase.from("playbook_tasks").select("playbook_id").eq("archived", false),
    supabase.from("autopilot_rules").select("id, name, cadence, weekday, nth, is_on, variation_key, playbook:playbooks(name)").order("name"),
    supabase.rpc("ap_can", { p_action: "playbooks.edit", p_hub: null, p_user: viewer.user.id }),
  ]);
  type P = { id: string; name: string; description: string | null; status: string; version: number; exam_safe: boolean; needs_mentor_approval: boolean };
  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">Playbooks</h2>
          {canEdit && <Link href="/command/playbooks/new" className="border border-ink/30 px-3 py-1.5 text-sm text-ink hover:border-ink">New playbook</Link>}
        </div>
        <ul className="mt-3 grid gap-3 md:grid-cols-2" data-playbooks>
          {((playbooks ?? []) as P[]).map((p) => (
            <li key={p.id}>
              <Link href={`/command/playbooks/${p.id}`} className="block h-full border border-line bg-surface p-3 hover:border-ink/40">
                <p className="font-medium text-ink">{p.name}{p.status === "archived" && <span className="ml-2 text-xs text-ink/60">archived</span>}</p>
                {p.description && <p className="text-sm text-ink/65">{p.description}</p>}
                <p className="mt-1 text-xs text-ink/60">
                  {((variations ?? []) as { playbook_id: string; name: string }[]).filter((v) => v.playbook_id === p.id).map((v) => v.name).join(" · ")}
                </p>
                <p className="text-xs text-ink/60">{(tasks ?? []).filter((t) => t.playbook_id === p.id).length} tasks · v{p.version}{p.exam_safe ? " · exam-safe" : ""}{p.needs_mentor_approval ? " · starts after mentor approval" : ""}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-serif text-xl text-ink">Calendar rules</h2>
        <p className="text-sm text-ink/60">Each rule prepares a mission ahead of its date (Control → weeks ahead). On Suggest, it waits in Today for one click.</p>
        <ul className="mt-3 divide-y divide-line border border-line" data-rules>
          {((rules ?? []) as unknown as { id: string; name: string; cadence: string; weekday: number; nth: number | null; is_on: boolean; variation_key: string | null; playbook: { name: string } | null }[]).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span><span className="font-medium text-ink">{r.name}</span> <span className="text-ink/60">· {r.playbook?.name} · {r.cadence === "weekly" ? `every ${WEEKDAY[r.weekday]}` : `${NTH[r.nth ?? 1]} ${WEEKDAY[r.weekday]} of the month`}</span></span>
              <RuleToggle id={r.id} on={r.is_on} disabled={!viewer.operator} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
