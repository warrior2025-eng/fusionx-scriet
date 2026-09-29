"use client";

import { useActionState } from "react";
import { createMentor, type MentorActionState } from "@/actions/mentors";
import { Label, Input, Textarea, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const initialState: MentorActionState = { status: "idle" };

export default function NewMentorPage() {
  const [state, formAction, pending] = useActionState(createMentor, initialState);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-ink mb-8">Add mentor</h1>

      {state.status === "error" && state.message && !Object.keys(state.fieldErrors ?? {}).length && (
        <p className="text-sm text-red-500 mb-4">{state.message}</p>
      )}

      <form action={formAction} className="space-y-5">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required />
          <FieldError>{state.fieldErrors?.name}</FieldError>
        </div>
        <div>
          <Label htmlFor="role_title">Role / title</Label>
          <Input id="role_title" name="role_title" placeholder="e.g. Faculty, 3rd Year Senior, Alumni" required />
          <FieldError>{state.fieldErrors?.role_title}</FieldError>
        </div>
        <div>
          <Label htmlFor="expertise">Areas of expertise (comma-separated)</Label>
          <Input id="expertise" name="expertise" placeholder="AI/ML, Web Development, Research" />
        </div>
        <div>
          <Label htmlFor="experience">Experience (optional)</Label>
          <Input id="experience" name="experience" placeholder="e.g. 5+ years in industry" />
        </div>
        <div>
          <Label htmlFor="availability">Availability (optional)</Label>
          <Input id="availability" name="availability" placeholder="e.g. Weekends, by appointment" />
        </div>
        <div>
          <Label htmlFor="linkedin_url">LinkedIn URL (optional)</Label>
          <Input id="linkedin_url" name="linkedin_url" type="url" placeholder="https://" />
          <FieldError>{state.fieldErrors?.linkedin_url}</FieldError>
        </div>
        <div>
          <Label htmlFor="bio">Bio (optional)</Label>
          <Textarea id="bio" name="bio" rows={4} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" name="is_published" className="accent-accent" />
          Publish immediately
        </label>
        <Button type="submit" loading={pending}>
          Add mentor
        </Button>
      </form>
    </div>
  );
}
