"use client";

import { useActionState } from "react";
import { Label, Input, Textarea, Select, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { ResearchActionState } from "@/actions/research";
import type { ResearchEntry } from "@/types/database";

const statuses = ["idea", "researching", "experimentation", "draft", "submitted", "published"] as const;

export function ResearchForm({
  action,
  research,
}: {
  action: (prev: ResearchActionState, formData: FormData) => Promise<ResearchActionState>;
  research?: ResearchEntry;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as ResearchActionState);

  return (
    <form action={formAction} className="space-y-5">
      {state.status === "error" && state.message && !Object.keys(state.fieldErrors ?? {}).length && (
        <p className="text-sm text-red-500">{state.message}</p>
      )}

      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required defaultValue={research?.title} />
        <FieldError>{state.fieldErrors?.title}</FieldError>
      </div>
      <div>
        <Label htmlFor="abstract">Abstract</Label>
        <Textarea id="abstract" name="abstract" rows={5} required defaultValue={research?.abstract} />
        <FieldError>{state.fieldErrors?.abstract}</FieldError>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <Label htmlFor="domain">Domain (optional)</Label>
          <Input id="domain" name="domain" placeholder="e.g. Machine Learning" defaultValue={research?.domain ?? ""} />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={research?.status ?? "idea"}>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="publication_info">Publication info (optional)</Label>
        <Input
          id="publication_info"
          name="publication_info"
          placeholder="e.g. Submitted to XYZ Conference 2026"
          defaultValue={research?.publication_info ?? ""}
        />
      </div>
      <div>
        <Label htmlFor="document_url">Document link (optional)</Label>
        <Input id="document_url" name="document_url" type="url" placeholder="https://" defaultValue={research?.document_url ?? ""} />
        <FieldError>{state.fieldErrors?.document_url}</FieldError>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink/70">
        <input type="checkbox" name="is_published" defaultChecked={research?.is_published} className="accent-accent" />
        Publish (visible on the public Research page)
      </label>
      <Button type="submit" loading={pending}>
        {research ? "Save changes" : "Save entry"}
      </Button>
    </form>
  );
}
