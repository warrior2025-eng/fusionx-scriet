"use client";

import { CountedTextarea } from "@/components/ui/counted-textarea";
import { submitContactMessage, type ContactActionState } from "@/actions/contact";
import { Label, Input, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useFormSubmit } from "@/components/ui/form-errors";
import { contactMessageSchema } from "@/lib/validations";

const initialState: ContactActionState = { status: "idle" };

export function ContactForm() {
  const { state, pending, errors, summary, formProps } = useFormSubmit(submitContactMessage, initialState, { schema: contactMessageSchema });

  if (state.status === "success") {
    return (
      <div className="border border-ink/10 rounded-sm bg-surface p-8 text-center">
        <p className="font-medium text-ink">Message sent.</p>
        <p className="mt-2 text-sm text-ink/55">{state.message}</p>
      </div>
    );
  }

  return (
    <form {...formProps} className="space-y-5">
      <div className="hidden" aria-hidden="true">
        <Label htmlFor="website">Website</Label>
        <Input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {summary}

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required />
          <FieldError id="name-error">{errors.name}</FieldError>
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
          <FieldError id="email-error">{errors.email}</FieldError>
        </div>
      </div>
      <div>
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" name="subject" required />
        <FieldError id="subject-error">{errors.subject}</FieldError>
      </div>
      <div>
        <Label htmlFor="message">Message</Label>
        <CountedTextarea max={3000} id="message" name="message" rows={5} required />
        <FieldError id="message-error">{errors.message}</FieldError>
      </div>
      <Button type="submit" loading={pending}>
        Send message
      </Button>
    </form>
  );
}
