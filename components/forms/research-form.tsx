"use client";

import { CountedTextarea } from "@/components/ui/counted-textarea";
import { Label, Input, Select, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { ResearchActionState } from "@/actions/research";
import type { ResearchEntry } from "@/types/database";
import { useFormSubmit } from "@/components/ui/form-errors";
import { researchSchema } from "@/lib/validations";
import { LinkInput } from "@/components/ui/link-input";

const statuses = ["idea", "researching", "experimentation", "draft", "submitted", "published"] as const;

export function ResearchForm({
  action,
  research,
}: {
  action: (prev: ResearchActionState, formData: FormData) => Promise<ResearchActionState>;
  research?: ResearchEntry;
}) {
  const { pending, errors, summary, formProps } = useFormSubmit(action, { status: "idle" } as ResearchActionState, { schema: researchSchema });

  return (
    <form {...formProps} className="space-y-5">
      {summary}

      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required defaultValue={research?.title} />
        <FieldError id="title-error">{errors.title}</FieldError>
      </div>
      <div>
        <Label htmlFor="abstract">Abstract</Label>
        <CountedTextarea max={4000} id="abstract" name="abstract" rows={5} required defaultValue={research?.abstract} />
        <FieldError id="abstract-error">{errors.abstract}</FieldError>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <Label htmlFor="domain">Domain (optional)</Label>
          <Input id="domain" name="domain" placeholder="e.g. Machine Learning" defaultValue={research?.domain ?? ""} />
          <FieldError id="domain-error">{errors.domain}</FieldError>
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
        <LinkInput id="document_url" name="document_url" kind="any" label="Document link" placeholder="drive.google.com/file/d/abc" defaultValue={research?.document_url ?? ""} error={errors.document_url} />
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
