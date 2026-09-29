"use client";

import { useActionState } from "react";
import { createEvent, type CreateActionState } from "@/actions/admin-create";
import { Label, Input, Textarea, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const initialState: CreateActionState = { status: "idle" };

export default function NewEventPage() {
  const [state, formAction, pending] = useActionState(createEvent, initialState);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-ink mb-8">New event</h1>

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
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={4} required />
          <FieldError>{state.fieldErrors?.description}</FieldError>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <Label htmlFor="event_date">Date</Label>
            <Input id="event_date" name="event_date" type="date" required />
            <FieldError>{state.fieldErrors?.event_date}</FieldError>
          </div>
          <div>
            <Label htmlFor="event_time">Time (optional)</Label>
            <Input id="event_time" name="event_time" type="time" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <Label htmlFor="venue">Venue (optional)</Label>
            <Input id="venue" name="venue" />
          </div>
          <div>
            <Label htmlFor="organizer">Organizer (optional)</Label>
            <Input id="organizer" name="organizer" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <Label htmlFor="registration_url">External registration URL (optional)</Label>
            <Input id="registration_url" name="registration_url" type="url" placeholder="https://" />
            <FieldError>{state.fieldErrors?.registration_url}</FieldError>
            <p className="mt-1 text-xs text-ink/40">Leave blank to use FusionX&rsquo;s built-in registration button instead.</p>
          </div>
          <div>
            <Label htmlFor="registration_capacity">Capacity (optional)</Label>
            <Input id="registration_capacity" name="registration_capacity" type="number" min="0" />
          </div>
        </div>
        <div>
          <Label htmlFor="poster">Poster (optional — JPEG/PNG/WEBP, under 4MB)</Label>
          <input
            id="poster"
            name="poster"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-sm text-ink/70 file:mr-3 file:rounded-sm file:border file:border-ink/15 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:border-ink/40"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" name="is_published" className="accent-accent" />
          Publish immediately
        </label>
        <Button type="submit" loading={pending}>
          Create event
        </Button>
      </form>
    </div>
  );
}
