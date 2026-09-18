"use client";

import { useActionState } from "react";
import { submitApplication, type ApplicationActionState } from "@/actions/application";
import { Label, Input, Textarea, Select, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { functionalAreas, skillOptions } from "@/lib/site-config";

const initialState: ApplicationActionState = { status: "idle" };

export function JoinForm({ isSignedIn }: { isSignedIn: boolean }) {
  const [state, formAction, pending] = useActionState(submitApplication, initialState);

  if (!isSignedIn) {
    return (
      <div className="border border-ink/10 rounded-sm bg-white/50 p-8 text-center">
        <p className="font-medium text-ink">Sign in to apply</p>
        <p className="mt-2 text-sm text-ink/55 max-w-sm mx-auto">
          We ask applicants to create a FusionX account first, so we can follow up on your
          application and keep it tied to your profile.
        </p>
        <a
          href="/signup?next=/join"
          className="mt-5 inline-flex items-center justify-center rounded-sm bg-ink text-white px-5 py-2.5 text-sm font-medium hover:bg-ink/90"
        >
          Create an account
        </a>
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div className="border border-ink/10 rounded-sm bg-white/50 p-8 text-center">
        <p className="font-medium text-ink">You&rsquo;re in the queue.</p>
        <p className="mt-2 text-sm text-ink/55">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Honeypot — hidden from real users via CSS, left in the tab order for bots that fill every field */}
      <div className="hidden" aria-hidden="true">
        <Label htmlFor="website">Website</Label>
        <Input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {state.status === "error" && state.message && !Object.keys(state.fieldErrors ?? {}).length && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" required />
          <FieldError>{state.fieldErrors?.full_name}</FieldError>
        </div>
        <div>
          <Label htmlFor="college_email">College email</Label>
          <Input id="college_email" name="college_email" type="email" required />
          <FieldError>{state.fieldErrors?.college_email}</FieldError>
        </div>
        <div>
          <Label htmlFor="department">Department</Label>
          <Input id="department" name="department" required />
          <FieldError>{state.fieldErrors?.department}</FieldError>
        </div>
        <div>
          <Label htmlFor="year">Year</Label>
          <Select id="year" name="year" required defaultValue="">
            <option value="" disabled>
              Select year
            </option>
            <option>1st Year</option>
            <option>2nd Year</option>
            <option>3rd Year</option>
            <option>4th Year</option>
          </Select>
          <FieldError>{state.fieldErrors?.year}</FieldError>
        </div>
      </div>

      <div>
        <Label>Skills</Label>
        <div className="flex flex-wrap gap-2">
          {skillOptions.map((skill) => (
            <label
              key={skill}
              className="flex items-center gap-1.5 text-xs border border-ink/15 rounded-full px-3 py-1.5 cursor-pointer has-checked:border-accent has-checked:text-accent"
            >
              <input type="checkbox" name="skills" value={skill} className="accent-accent" />
              {skill}
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="preferred_functional_area">Preferred functional area</Label>
        <Select id="preferred_functional_area" name="preferred_functional_area" required defaultValue="">
          <option value="" disabled>
            Select an area
          </option>
          {functionalAreas.map((area) => (
            <option key={area}>{area}</option>
          ))}
        </Select>
        <FieldError>{state.fieldErrors?.preferred_functional_area}</FieldError>
      </div>

      <div className="grid sm:grid-cols-3 gap-5">
        <div>
          <Label htmlFor="portfolio_url">Portfolio (optional)</Label>
          <Input id="portfolio_url" name="portfolio_url" type="url" placeholder="https://" />
          <FieldError>{state.fieldErrors?.portfolio_url}</FieldError>
        </div>
        <div>
          <Label htmlFor="github_url">GitHub (optional)</Label>
          <Input id="github_url" name="github_url" type="url" placeholder="https://" />
          <FieldError>{state.fieldErrors?.github_url}</FieldError>
        </div>
        <div>
          <Label htmlFor="linkedin_url">LinkedIn (optional)</Label>
          <Input id="linkedin_url" name="linkedin_url" type="url" placeholder="https://" />
          <FieldError>{state.fieldErrors?.linkedin_url}</FieldError>
        </div>
      </div>

      <div>
        <Label htmlFor="project_interests">Project interests (optional)</Label>
        <Textarea id="project_interests" name="project_interests" rows={3} />
      </div>

      <div>
        <Label htmlFor="research_interests">Research interests (optional)</Label>
        <Textarea id="research_interests" name="research_interests" rows={3} />
      </div>

      <div>
        <Label htmlFor="motivation">Why do you want to join?</Label>
        <Textarea id="motivation" name="motivation" rows={5} required />
        <FieldError>{state.fieldErrors?.motivation}</FieldError>
      </div>

      <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
        Submit application
      </Button>
    </form>
  );
}
