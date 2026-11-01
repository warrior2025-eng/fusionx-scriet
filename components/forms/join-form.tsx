"use client";

import { CountedTextarea } from "@/components/ui/counted-textarea";
import { submitApplication, type ApplicationActionState } from "@/actions/application";
import { Label, Input, Select, FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { functionalAreas, skillOptions } from "@/lib/site-config";
import { useFormSubmit } from "@/components/ui/form-errors";
import { joinApplicationSchema } from "@/lib/validations";
import { LinkInput } from "@/components/ui/link-input";

const initialState: ApplicationActionState = { status: "idle" };

export function JoinForm({ isSignedIn }: { isSignedIn: boolean }) {
  const { state, pending, errors, summary, formProps } = useFormSubmit(submitApplication, initialState, { schema: joinApplicationSchema });

  if (!isSignedIn) {
    return (
      <div className="border border-ink/10 rounded-sm bg-surface p-8 text-center">
        <p className="font-medium text-ink">Sign in to apply</p>
        <p className="mt-2 text-sm text-ink/55 max-w-sm mx-auto">
          We ask applicants to create a FusionX account first, so we can follow up on your
          application and keep it tied to your profile.
        </p>
        <a
          href="/signup?next=/join"
          className="mt-5 inline-flex items-center justify-center rounded-sm bg-accent text-white px-5 py-2.5 text-sm font-medium hover:bg-accent/90"
        >
          Create an account
        </a>
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div className="border border-ink/10 rounded-sm bg-surface p-8 text-center">
        <p className="font-medium text-ink">You&rsquo;re in the queue.</p>
        <p className="mt-2 text-sm text-ink/55">{state.message}</p>
      </div>
    );
  }

  return (
    <form {...formProps} className="space-y-6">
      {/* Honeypot — hidden from real users via CSS, left in the tab order for bots that fill every field */}
      <div className="hidden" aria-hidden="true">
        <Label htmlFor="website">Website</Label>
        <Input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {summary}

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" required />
          <FieldError id="full_name-error">{errors.full_name}</FieldError>
        </div>
        <div>
          <Label htmlFor="college_email">College email</Label>
          <Input id="college_email" name="college_email" type="email" required />
          <FieldError id="college_email-error">{errors.college_email}</FieldError>
        </div>
        <div>
          <Label htmlFor="department">Department</Label>
          <Input id="department" name="department" required />
          <FieldError id="department-error">{errors.department}</FieldError>
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
          <FieldError id="year-error">{errors.year}</FieldError>
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
        <FieldError id="preferred_functional_area-error">{errors.preferred_functional_area}</FieldError>
      </div>

      <div className="grid sm:grid-cols-3 gap-5">
        <div>
          <Label htmlFor="portfolio_url">Portfolio (optional)</Label>
          <LinkInput id="portfolio_url" name="portfolio_url" kind="website" label="Portfolio" placeholder="riya.dev" error={errors.portfolio_url} />
        </div>
        <div>
          <Label htmlFor="github_url">GitHub (optional)</Label>
          <LinkInput id="github_url" name="github_url" kind="github" label="GitHub" placeholder="@riya" error={errors.github_url} />
        </div>
        <div>
          <Label htmlFor="linkedin_url">LinkedIn (optional)</Label>
          <LinkInput id="linkedin_url" name="linkedin_url" kind="linkedin" label="LinkedIn" placeholder="riya-sharma" error={errors.linkedin_url} />
        </div>
      </div>

      <div>
        <Label htmlFor="project_interests">Project interests (optional)</Label>
        <CountedTextarea max={1000} id="project_interests" name="project_interests" rows={3} />
        <FieldError id="project_interests-error">{errors.project_interests}</FieldError>
      </div>

      <div>
        <Label htmlFor="research_interests">Research interests (optional)</Label>
        <CountedTextarea max={1000} id="research_interests" name="research_interests" rows={3} />
        <FieldError id="research_interests-error">{errors.research_interests}</FieldError>
      </div>

      <div>
        <Label htmlFor="motivation">Why do you want to join?</Label>
        <CountedTextarea max={2000} id="motivation" name="motivation" rows={5} required />
        <FieldError id="motivation-error">{errors.motivation}</FieldError>
      </div>

      <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
        Submit application
      </Button>
    </form>
  );
}
