"use client";

import { useActionState } from "react";
import { createTeam, type TeamActionState } from "@/actions/teams";
import { Section } from "@/components/ui/section";
import { Label, Input, Textarea, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const initialState: TeamActionState = { status: "idle" };

export default function NewTeamPage() {
  const [state, formAction, pending] = useActionState(createTeam, initialState);

  return (
    <Section className="pt-16 pb-24 max-w-2xl">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">New Team</p>
      <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-ink mb-8">Start a team.</h1>

      {state.status === "error" && state.message && !Object.keys(state.fieldErrors ?? {}).length && (
        <p className="text-sm text-red-500 mb-4">{state.message}</p>
      )}

      <form action={formAction} className="space-y-5">
        <div>
          <Label htmlFor="name">Team name</Label>
          <Input id="name" name="name" required />
          <FieldError>{state.fieldErrors?.name}</FieldError>
        </div>
        <div>
          <Label htmlFor="description">What are you building? (optional)</Label>
          <Textarea id="description" name="description" rows={4} />
        </div>
        <div>
          <Label htmlFor="skills_needed">Skills needed (comma-separated)</Label>
          <Input id="skills_needed" name="skills_needed" placeholder="Frontend, AI/ML, Design" />
        </div>
        <Button type="submit" loading={pending}>
          Create team
        </Button>
      </form>
    </Section>
  );
}