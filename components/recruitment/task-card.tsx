import { ExternalLink } from "lucide-react";
import { submitTask } from "@/actions/recruitment-results";
import { AdminForm, TextField } from "@/components/admin/admin-form";
import { CutCard } from "@/components/ui/cut-card";
import { istDateTime } from "@/lib/events/format";
import type { MyTask } from "@/lib/recruitment/data";

/** A hub's post-result task, for a candidate selected into it (only ever given one by my_recruitment_tasks). */
export function TaskCard({ task }: { task: MyTask }) {
  const done = task.status !== "not_started";
  return (
    <CutCard className="h-auto">
      <p className="text-sm text-ink/65">Task from {task.team_name}</p>
      <h2 className="mt-1 font-serif text-xl font-medium text-ink">{task.title}</h2>
      {task.description && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink/80">{task.description}</p>}
      {task.deadline && (
        <p className="mt-3 text-sm text-ink">
          Deadline: <span className="font-medium">{istDateTime(task.deadline)}</span>
        </p>
      )}
      {task.link && (
        <a
          href={task.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-sm bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90"
        >
          Open task <ExternalLink size={14} aria-hidden />
        </a>
      )}

      <div className="mt-6 border-t border-line pt-5">
        <p className="text-sm text-ink">
          Status:{" "}
          <span className="font-medium">
            {task.status === "reviewed" ? "Reviewed" : task.status === "submitted" ? "Submitted" : "Not started"}
          </span>
          {task.submitted_at && <span className="text-ink/65"> ({istDateTime(task.submitted_at)})</span>}
        </p>
        {task.status !== "reviewed" && (
          <div className="mt-4">
            <AdminForm action={submitTask.bind(null, task.team_id)} submitLabel={done ? "Update submission" : "Mark as submitted"} warnUnsaved={false}>
              <TextField
                name="submission_link"
                label="Link to your work (optional)"
                type="url"
                placeholder="https://"
                defaultValue={task.submission_link ?? ""}
              />
            </AdminForm>
          </div>
        )}
      </div>
    </CutCard>
  );
}
