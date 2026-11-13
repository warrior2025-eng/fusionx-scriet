import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlaybookEditor, PlaybookVersionRestore, type EditorPlaybook } from "@/components/autopilot/playbook-editor";
import { getAutopilotViewer, peopleById } from "@/lib/autopilot/server";

export const metadata: Metadata = { title: "Command Center · Playbook" };

type Snapshot = { playbook: Record<string, unknown>; variations: { key: string; name: string }[]; tasks: { key: string; title: string; offset_days: number; hub: string; archived: boolean }[] };

/** What changed between two versions, in words. */
function diff(before: Snapshot | undefined, after: Snapshot): string[] {
  if (!before) return ["First version"];
  const out: string[] = [];
  for (const f of ["name", "description", "exam_safe", "needs_mentor_approval", "default_visibility", "status"]) {
    if (JSON.stringify(before.playbook[f]) !== JSON.stringify(after.playbook[f])) out.push(`${f.replace(/_/g, " ")}: ${String(before.playbook[f] ?? "—")} → ${String(after.playbook[f] ?? "—")}`);
  }
  const bv = new Map(before.variations.map((v) => [v.key, v])), av = new Map(after.variations.map((v) => [v.key, v]));
  for (const [k, v] of av) if (!bv.has(k)) out.push(`variation added: ${v.name}`); else if (bv.get(k)!.name !== v.name) out.push(`variation renamed: ${bv.get(k)!.name} → ${v.name}`);
  for (const [k, v] of bv) if (!av.has(k)) out.push(`variation removed: ${v.name}`);
  const bt = new Map(before.tasks.filter((t) => !t.archived).map((t) => [t.key, t])), at = new Map(after.tasks.filter((t) => !t.archived).map((t) => [t.key, t]));
  for (const [k, t] of at) {
    const o = bt.get(k);
    if (!o) out.push(`task added: ${t.title}`);
    else {
      if (o.title !== t.title) out.push(`task renamed: ${o.title} → ${t.title}`);
      if (o.offset_days !== t.offset_days) out.push(`${t.title}: day ${o.offset_days} → ${t.offset_days}`);
      if (o.hub !== t.hub) out.push(`${t.title}: hub ${o.hub} → ${t.hub}`);
    }
  }
  for (const [k, t] of bt) if (!at.has(k)) out.push(`task archived: ${t.title}`);
  return out.length ? out : ["Saved without changes"];
}

export default async function PlaybookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = (await getAutopilotViewer())!;
  const { supabase } = viewer;
  const { data: canEdit } = await supabase.rpc("ap_can", { p_action: "playbooks.edit", p_hub: null, p_user: viewer.user.id });
  if (id === "new") {
    return (
      <div>
        <Link href="/command/playbooks" className="text-sm underline">← Playbooks</Link>
        <PlaybookEditor playbook={null} canEdit={canEdit === true} />
      </div>
    );
  }
  const [{ data: playbook }, { data: variations }, { data: tasks }, { data: versions }] = await Promise.all([
    supabase.from("playbooks").select("*").eq("id", id).maybeSingle(),
    supabase.from("playbook_variations").select("key, name, description, scale, is_default").eq("playbook_id", id).order("sort"),
    supabase.from("playbook_tasks").select("*").eq("playbook_id", id).order("sort"),
    supabase.from("playbook_versions").select("version, note, changed_by, created_at, snapshot").eq("playbook_id", id).order("version", { ascending: false }),
  ]);
  if (!playbook) notFound();
  const vs = (versions ?? []) as { version: number; note: string | null; changed_by: string | null; created_at: string; snapshot: Snapshot }[];
  const names = await peopleById(supabase, vs.map((v) => v.changed_by));
  const editor = { ...playbook, variations: variations ?? [], tasks: tasks ?? [] } as unknown as EditorPlaybook;
  return (
    <div className="space-y-6">
      <Link href="/command/playbooks" className="text-sm underline">← Playbooks</Link>
      <PlaybookEditor playbook={editor} canEdit={canEdit === true} />
      <section>
        <h2 className="font-serif text-xl text-ink">Versions</h2>
        <ul className="mt-2 divide-y divide-line border border-line text-sm" data-versions>
          {vs.map((v, i) => (
            <li key={v.version} className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink">v{v.version} · {new Date(v.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {v.changed_by ? names.get(v.changed_by)?.full_name : "Seeded"}{v.note ? ` · ${v.note}` : ""}</span>
                {i > 0 && canEdit && <PlaybookVersionRestore id={id} version={v.version} />}
              </div>
              <ul className="mt-1 list-inside list-disc text-xs text-ink/65">{diff(vs[i + 1]?.snapshot, v.snapshot).slice(0, 12).map((d) => <li key={d}>{d}</li>)}</ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
