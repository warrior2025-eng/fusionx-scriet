"use client";

import { useActionState } from "react";
import { createOpportunity, type CreateActionState } from "@/actions/admin-create";
import { Label, Input, Textarea, Select, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const categories = [
  "hackathon",
  "competition",
  "research",
  "internship",
  "workshop",
  "scholarship",
  "conference",
  "innovation_challenge",
] as const;

const initialState: CreateActionState = { status: "idle" };

export default function NewOpportunityPage() {
  const [state, formAction, pending] = useActionState(createOpportunity, initialState);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-ink mb-8">New opportunity</h1>

      {state.status === "error" && state.message && !Object.keys(state.fieldErrors ?? {}).length && (
        <p className="text-sm text-red-500 mb-4">{state.message}</p>
      )}

      <form action={formAction} className="space-y-5">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required />
          <FieldError>{state.fieldErrors?.title}</FieldError>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <Label htmlFor="organizer">Organizer</Label>
            <Input id="organizer" name="organizer" required />
            <FieldError>{state.fieldErrors?.organizer}</FieldError>
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Select id="category" name="category" defaultValue="hackathon">
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={4} required />
          <FieldError>{state.fieldErrors?.description}</FieldError>
        </div>
        <div>
          <Label htmlFor="eligibility">Eligibility (optional)</Label>
          <Textarea id="eligibility" name="eligibility" rows={2} />
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <Label htmlFor="deadline">Deadline (optional)</Label>
            <Input id="deadline" name="deadline" type="date" />
          </div>
          <div>
            <Label htmlFor="registration_url">Registration URL (optional)</Label>
            <Input id="registration_url" name="registration_url" type="url" placeholder="https://" />
            <FieldError>{state.fieldErrors?.registration_url}</FieldError>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" name="is_published" className="accent-accent" />
          Publish immediately
        </label>
        <Button type="submit" loading={pending}>
          Create opportunity
        </Button>
      </form>
    </div>
  );
}
