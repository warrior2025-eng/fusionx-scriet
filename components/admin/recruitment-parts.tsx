import Link from "next/link";
import { TextField, TextareaField } from "@/components/admin/admin-form";
import { toIstInput } from "@/lib/events/format";
import type { Cycle } from "@/lib/recruitment/data";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "", label: "Overview" },
  { path: "/teams", label: "Teams" },
  { path: "/questions", label: "Questions" },
  { path: "/reviewers", label: "Reviewers" },
  { path: "/applications", label: "Applications" },
  { path: "/slots", label: "Interview slots" },
  { path: "/interview-questions", label: "Interview questions" },
  { path: "/results", label: "Results" },
] as const;

/** The tabs shared by every page of one recruitment cycle. Reviewers, applications, slots and results are admin-only. */
export function CycleTabs({ cycleId, current, admin }: { cycleId: string; current: (typeof TABS)[number]["path"]; admin: boolean }) {
  return (
    <nav aria-label="Cycle sections" className="mb-6 flex flex-wrap gap-x-6 gap-y-1 border-b border-line">
      {TABS.filter((tab) => admin || (tab.path !== "/reviewers" && tab.path !== "/applications" && tab.path !== "/slots" && tab.path !== "/results")).map((tab) => (
        <Link
          key={tab.path}
          href={`/admin/recruitment/${cycleId}${tab.path}`}
          aria-current={tab.path === current ? "page" : undefined}
          className={cn(
            "border-b-2 px-1 pb-2 text-sm font-medium",
            tab.path === current ? "border-accent text-ink" : "border-transparent text-ink/65 hover:text-ink",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/** The fields of a cycle, for the "new cycle" and "edit cycle" forms. */
export function CycleFields({ cycle }: { cycle?: Cycle | null }) {
  return (
    <>
      <TextField name="title" label="Title" defaultValue={cycle?.title ?? ""} maxLength={160} />
      <TextareaField name="description" label="Description" rows={3} max={3000} defaultValue={cycle?.description ?? ""} />
      <div className="grid gap-5 sm:grid-cols-3">
        <TextField name="opens_at" label="Opens (IST)" type="datetime-local" defaultValue={toIstInput(cycle?.opens_at)} />
        <TextField name="closes_at" label="Deadline (IST)" type="datetime-local" defaultValue={toIstInput(cycle?.closes_at)} />
        <TextField
          name="max_preferences"
          label="Teams a candidate may choose"
          type="number"
          min={1}
          max={4}
          defaultValue={String(cycle?.max_preferences ?? 2)}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextareaField
          name="allowed_years"
          label="Eligible years"
          rows={3}
          hint="One per line, written the way students write it (for example: 2nd Year). Empty means every year."
          defaultValue={(cycle?.allowed_years ?? []).join("\n")}
        />
        <TextareaField
          name="allowed_departments"
          label="Eligible departments"
          rows={3}
          hint="One per line. Empty means every department."
          defaultValue={(cycle?.allowed_departments ?? []).join("\n")}
        />
      </div>
    </>
  );
}
