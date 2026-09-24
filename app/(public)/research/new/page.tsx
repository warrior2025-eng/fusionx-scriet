"use client";

import { useActionState } from "react";
import { createResearch, type ResearchActionState } from "@/actions/research";
import { Section } from "@/components/ui/section";
import { Label, Input, Textarea, Select, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const statuses = ["idea", "researching", "experimentation", "draft", "submitted", "published"] as const;
const initialState: ResearchActionState = { status: "idle" };

export default function NewResearchPage() {
  const [state, formAction, pending] = useActionState(createResearch, initialState);

  return (
    <Section className="pt-16 pb-24 max-w-2xl">
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-accent mb-3">New Research Entry</p>
      <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-ink mb-8">Document your research.</h1>

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
          <Label htmlFor="abstract">Abstract</Label>
          <Textarea id="abstract" name="abstract" rows={5} required />
          <FieldError>{state.fieldErrors?.abstract}</FieldError>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <Label htmlFor="domain">Domain (optional)</Label>
            <Input id="domain" name="domain" placeholder="e.g. Machine Learning" />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue="idea">
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
          <Input id="publication_info" name="publication_info" placeholder="e.g. Submitted to XYZ Conference 2026" />
        </div>
        <div>
          <Label htmlFor="document_url">Document link (optional)</Label>
          <Input id="document_url" name="document_url" type="url" placeholder="https://" />
          <FieldError>{state.fieldErrors?.document_url}</FieldError>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" name="is_published" className="accent-accent" />
          Publish (visible on the public Research page)
        </label>
        <Button type="submit" loading={pending}>
          Save entry
        </Button>
      </form>
    </Section>
  );
}