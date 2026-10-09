"use client";

import { useTransition } from "react";
import { updateApplicationStatus } from "@/actions/admin-applications";
import type { Application, ApplicationStatus } from "@/types/database";
import { Badge } from "@/components/ui/badge";

const statuses: ApplicationStatus[] = ["submitted", "under_review", "shortlisted", "selected", "rejected", "archived"];

export function ApplicationRow({ application }: { application: Application }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="border border-ink/10 rounded-sm p-5 bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{application.full_name}</p>
          <p className="text-xs text-ink/45 mt-0.5">
            {application.college_email}, {application.department}, {application.year}
          </p>
          <p className="text-xs text-ink/45 mt-0.5">Interested in: {application.preferred_functional_area}</p>
        </div>
        <Badge>{application.status.replace(/_/g, " ")}</Badge>
      </div>

      <p className="mt-3 text-sm text-ink/65 leading-relaxed">{application.motivation}</p>

      <div className="mt-4 flex items-center gap-2">
        <select
          defaultValue={application.status}
          disabled={pending}
          onChange={(e) =>
            startTransition(() => updateApplicationStatus(application.id, e.target.value as ApplicationStatus))
          }
          className="text-sm rounded-sm border border-ink/15 px-3 py-1.5 bg-surface disabled:opacity-50"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
