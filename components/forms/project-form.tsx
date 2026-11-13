"use client";

import { CountedTextarea } from "@/components/ui/counted-textarea";
import { Label, Input, Select, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { ProjectActionState } from "@/actions/projects";
import type { Project } from "@/types/database";
import { useFormSubmit } from "@/components/ui/form-errors";
import { projectSchema } from "@/lib/validations";
import { LinkInput } from "@/components/ui/link-input";

const statuses = ["idea", "building", "prototype", "testing", "completed", "continued"] as const;

export function ProjectForm({
  action,
  project,
}: {
  action: (prev: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  project?: Project;
}) {
  const { pending, errors, summary, formProps } = useFormSubmit(action, { status: "idle" } as ProjectActionState, { schema: projectSchema });

  return (
    <form {...formProps} className="space-y-5">
      {summary}

      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required defaultValue={project?.title} />
        <FieldError id="title-error">{errors.title}</FieldError>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <CountedTextarea max={4000} id="description" name="description" rows={5} required defaultValue={project?.description} />
        <FieldError id="description-error">{errors.description}</FieldError>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <Label htmlFor="domain">Domain (optional)</Label>
          <Input id="domain" name="domain" placeholder="e.g. IoT, Web, AI/ML" defaultValue={project?.domain ?? ""} />
          <FieldError id="domain-error">{errors.domain}</FieldError>
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={project?.status ?? "idea"}>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="technologies">Technologies (comma-separated)</Label>
        <Input
          id="technologies"
          name="technologies"
          placeholder="React, Supabase, Python"
          defaultValue={project?.technologies?.join(", ") ?? ""}
        />
      </div>

      <div>
        <Label htmlFor="image">Cover image (optional, JPEG/PNG/WEBP, under 4MB)</Label>
        {project?.image_path && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.image_path}
            alt=""
            className="mb-2 h-32 w-full max-w-xs rounded-sm border border-ink/10 object-cover"
          />
        )}
        <input
          id="image"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="block w-full text-sm text-ink/70 file:mr-3 file:rounded-sm file:border file:border-ink/15 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:border-ink/40"
        />
        {project?.image_path && (
          <p className="mt-1 text-xs text-ink/40">Uploading a new image replaces the current one.</p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <Label htmlFor="github_url">GitHub URL (optional)</Label>
          <LinkInput id="github_url" name="github_url" kind="github" label="GitHub URL" placeholder="github.com/riya/repo" defaultValue={project?.github_url ?? ""} error={errors.github_url} />
        </div>
        <div>
          <Label htmlFor="demo_url">Demo URL (optional)</Label>
          <LinkInput id="demo_url" name="demo_url" kind="any" label="Demo URL" placeholder="example.com/demo" defaultValue={project?.demo_url ?? ""} error={errors.demo_url} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink/70">
        <input type="checkbox" name="is_published" defaultChecked={project?.is_published} className="accent-accent" />
        Publish (visible on the public Projects page)
      </label>

      {!project && (
        // Autopilot tracking (optional): milestones from the Flagship sprint, counted back from a target date.
        <fieldset className="grid gap-5 border border-ink/10 p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm text-ink/70">Plan (optional)</legend>
          <div>
            <Label htmlFor="plan">Plan</Label>
            <Select id="plan" name="plan" defaultValue="">
              <option value="">No plan, I&apos;ll add milestones myself</option>
              <option value="lite">Lite · 4 weeks</option>
              <option value="standard">Standard · 8 weeks</option>
              <option value="ambitious">Ambitious · 12 weeks (public launch)</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="target_date">Target date</Label>
            <Input id="target_date" name="target_date" type="date" />
          </div>
        </fieldset>
      )}

      <Button type="submit" loading={pending}>
        {project ? "Save changes" : "Create project"}
      </Button>
    </form>
  );
}
