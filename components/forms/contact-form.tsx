"use client";

import { useActionState } from "react";
import { submitContactMessage, type ContactActionState } from "@/actions/contact";
import { Label, Input, Textarea, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const initialState: ContactActionState = { status: "idle" };

export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitContactMessage, initialState);

  if (state.status === "success") {
    return (
      <div className="border border-ink/10 rounded-sm bg-surface p-8 text-center">
        <p className="font-medium text-ink">Message sent.</p>
        <p className="mt-2 text-sm text-ink/55">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="hidden" aria-hidden="true">
        <Label htmlFor="website">Website</Label>
        <Input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {state.status === "error" && state.message && !Object.keys(state.fieldErrors ?? {}).length && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required />
          <FieldError>{state.fieldErrors?.name}</FieldError>
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
          <FieldError>{state.fieldErrors?.email}</FieldError>
        </div>
      </div>
      <div>
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" name="subject" required />
        <FieldError>{state.fieldErrors?.subject}</FieldError>
      </div>
      <div>
        <Label htmlFor="message">Message</Label>
        <Textarea id="message" name="message" rows={5} required />
        <FieldError>{state.fieldErrors?.message}</FieldError>
      </div>
      <Button type="submit" loading={pending}>
        Send message
      </Button>
    </form>
  );
}
