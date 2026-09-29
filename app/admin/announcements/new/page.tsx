"use client";

import { useActionState } from "react";
import { createAnnouncement, type CreateActionState } from "@/actions/admin-create";
import { Label, Input, Textarea, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const initialState: CreateActionState = { status: "idle" };

export default function NewAnnouncementPage() {
  const [state, formAction, pending] = useActionState(createAnnouncement, initialState);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-ink mb-8">New announcement</h1>

      {state.status === "error" && state.message && !Object.keys(state.fieldErrors ?? {}).length && (
        <p className="text-sm text-red-500 mb-4">{state.message}</p>
      )}

      <form action={formAction} className="space-y-5">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required />
          <FieldError>{state.fieldErrors?.title}</FieldError>
        </div>
        <div>
          <Label htmlFor="content">Content</Label>
          <Textarea id="content" name="content" rows={5} required />
          <FieldError>{state.fieldErrors?.content}</FieldError>
        </div>
        <div>
          <Label htmlFor="category">Category (optional)</Label>
          <Input id="category" name="category" placeholder="e.g. General, Events, Deadlines" />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" name="publish_now" className="accent-accent" />
          Publish immediately (otherwise saved as a draft)
        </label>
        <Button type="submit" loading={pending}>
          Create announcement
        </Button>
      </form>
    </div>
  );
}
