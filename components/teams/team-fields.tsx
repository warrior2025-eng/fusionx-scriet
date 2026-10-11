import { CheckboxField, SelectField, TextField, TextareaField } from "@/components/admin/admin-form";
import type { Team } from "@/lib/teams/data";

/**
 * The details a team leader owns, as form fields. Shared by the registration
 * form and the "edit team" form on the team page.
 */
export function TeamDetailFields({
  team,
  categories,
  minSize,
  maxSize,
}: {
  team?: Team | null;
  categories: string[];
  minSize: number;
  maxSize: number;
}) {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          name="focus"
          label="Focus"
          defaultValue={team?.focus ?? ""}
          options={[{ value: "", label: "Choose one" }, ...categories.map((c) => ({ value: c, label: c }))]}
        />
        <TextField
          name="max_size"
          label="Team size"
          type="number"
          min={minSize}
          max={maxSize}
          defaultValue={String(team?.max_size ?? maxSize)}
          hint={`How many members the team will have, between ${minSize} and ${maxSize}.`}
        />
      </div>
      <TextareaField name="description" label="About the team" rows={3} max={1000} counter defaultValue={team?.description ?? ""} />
      <TextField name="project_title" label="Project or idea title" defaultValue={team?.project_title ?? ""} maxLength={160} />
      <TextareaField name="project_summary" label="Project summary" rows={4} max={1500} counter defaultValue={team?.project_summary ?? ""} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="github_url" label="GitHub link (optional)" type="url" placeholder="https://" defaultValue={team?.github_url ?? ""} />
        <TextField name="demo_url" label="Drive or demo link (optional)" type="url" placeholder="https://" defaultValue={team?.demo_url ?? ""} />
      </div>
      <TextField
        name="skills_needed"
        label="Skills"
        hint="Separate with commas. Up to 12."
        defaultValue={(team?.skills_needed ?? []).join(", ")}
        maxLength={400}
      />
      <CheckboxField
        name="looking_for_members"
        label="Looking for members"
        hint="Once verified, other students can ask to join."
        defaultChecked={team?.looking_for_members ?? false}
      />
    </>
  );
}
