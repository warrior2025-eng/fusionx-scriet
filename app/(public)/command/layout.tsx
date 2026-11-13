import { redirect } from "next/navigation";
import { Toaster } from "@/components/admin/toast";
import { CenterTabs } from "@/components/autopilot/center-tabs";
import { getAutopilotViewer, healthOf } from "@/lib/autopilot/server";

/**
 * Command Center: one place for all of FusionX's work. Admins, the super admin and the Head of
 * Execution see everything; hub leads see their hub. Every read is limited again by RLS and every
 * write is checked again in the database (migration 0042).
 */
export default async function CommandLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getAutopilotViewer();
  if (!viewer) redirect("/login?next=/command");
  if (!viewer.canOpenCenter) redirect("/my-work");
  const { supabase } = viewer;
  const [{ data: missions }, { count: waiting }, { data: settings }] = await Promise.all([
    supabase.from("missions").select("id").in("status", ["planned", "active"]),
    supabase.from("autopilot_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("autopilot_settings").select("master").eq("id", 1).maybeSingle(),
  ]);
  const ids = (missions ?? []).map((m) => m.id as string);
  const health = await healthOf(supabase, ids);
  const amber = [...health.values()].filter((h) => h === "amber").length;
  const red = [...health.values()].filter((h) => h === "red").length;

  return (
    <div className="container-fx max-w-6xl pb-24 pt-8">
      <Toaster />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-text">FusionX Autopilot</p>
          <h1 className="font-serif text-3xl tracking-tight text-ink">Command Center</h1>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink/75" data-health-strip>
          {settings?.master === "paused" && <span className="font-semibold text-amber-700 dark:text-amber-400">Paused ·</span>}
          <span>{ids.length} active</span>·
          <span className={amber ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>{amber} amber</span>·
          <span className={red ? "font-semibold text-red-600 dark:text-red-400" : ""}>{red} red</span>·
          <span className={waiting ? "font-semibold text-ink" : ""}>{waiting ?? 0} waiting for you</span>
        </p>
      </div>
      <CenterTabs control={viewer.superAdmin} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
