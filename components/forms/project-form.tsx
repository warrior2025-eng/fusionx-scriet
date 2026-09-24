"use client";

import { useActionState } from "react";
import { Label, Input, Textarea, Select, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { ProjectActionState } from "@/actions/projects";
import type { Project } from "@/types/database";

const statuses = ["idea", "building", "prototype", "testing", "completed", "continued"] as const;

export function ProjectForm({
  action,
  project,
}: {
  action: (prev: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  project?: Project;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as ProjectActionState);

  return (
    <form action={formAction} className="space-y-5">
      {state.status === "error" && state.message && !Object.keys(state.fieldErrors ?? {}).length && (
        <p className="text-sm text-red-500">{state.message}</p>
      )}

      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required defaultValue={project?.title} />
        <FieldError>{state.fieldErrors?.title}</FieldError>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={5} required defaultValue={project?.description} />
        <FieldError>{state.fieldErrors?.description}</FieldError>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <Label htmlFor="domain">Domain (optional)</Label>
          <Input id="domain" name="domain" placeholder="e.g. IoT, Web, AI/ML" defaultValue={project?.domain ?? ""} />
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

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <Label htmlFor="github_url">GitHub URL (optional)</Label>
          <Input id="github_url" name="github_url" type="url" placeholder="https://" defaultValue={project?.github_url ?? ""} />
          <FieldError>{state.fieldErrors?.github_url}</FieldError>
        </div>
        <div>
          <Label htmlFor="demo_url">Demo URL (optional)</Label>
          <Input id="demo_url" name="demo_url" type="url" placeholder="https://" defaultValue={project?.demo_url ?? ""} />
          <FieldError>{state.fieldErrors?.demo_url}</FieldError>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink/70">
        <input type="checkbox" name="is_published" defaultChecked={project?.is_published} className="accent-accent" />
        Publish (visible on the public Projects page)
      </label>

      <Button type="submit" loading={pending}>
        {project ? "Save changes" : "Create project"}
      </Button>
    </form>
  );
}