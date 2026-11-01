"use client";

import { useActionState, useState } from "react";
import { updateProfile, type ProfileActionState } from "@/actions/profile";
import { ImageField } from "@/components/admin/image-field";
import { Label, Input, Textarea, FieldError, FieldHint } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/types/database";

const initialState: ProfileActionState = { status: "idle" };

export function ProfileForm({ profile, email }: { profile: Profile; email: string }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  const [bio, setBio] = useState(profile.bio ?? "");

  return (
    <form action={formAction} className="space-y-6">
      {state.message && (
        <p className={`text-sm ${state.status === "success" ? "text-accent" : "text-red-500"}`}>{state.message}</p>
      )}

      {/* Remounted after a save, so it shows the saved photo rather than the local preview. */}
      <ImageField
        key={profile.avatar_url ?? "none"}
        name="avatar"
        label="Profile photo (optional)"
        hint="JPG, PNG, WEBP, GIF, BMP, HEIC or AVIF, up to 15 MB. You choose the square crop, and it is shrunk for you."
        currentUrl={profile.avatar_url}
        photo
      />

      <div>
        <Label>Email</Label>
        <p className="text-sm text-ink/50">{email}</p>
      </div>

      <div>
        <Label htmlFor="full_name">Full name</Label>
        <Input id="full_name" name="full_name" required defaultValue={profile.full_name} />
        <FieldError>{state.fieldErrors?.full_name}</FieldError>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <Label htmlFor="department">Department</Label>
          <Input id="department" name="department" defaultValue={profile.department ?? ""} />
        </div>
        <div>
          <Label htmlFor="year">Year</Label>
          <Input id="year" name="year" placeholder="e.g. 2nd Year" defaultValue={profile.year ?? ""} />
        </div>
      </div>

      <div>
        <Label htmlFor="bio">Bio (optional)</Label>
        <Textarea id="bio" name="bio" rows={4} maxLength={600} value={bio} onChange={(e) => setBio(e.target.value)} />
        <FieldHint>{bio.length}/600. The Core page card shows the first 300 characters.</FieldHint>
      </div>

      <div>
        <Label htmlFor="skills">Skills (comma-separated)</Label>
        <Input id="skills" name="skills" placeholder="Frontend, AI/ML, Design" defaultValue={profile.skills?.join(", ") ?? ""} />
      </div>

      <div>
        <Label htmlFor="interests">Interests (comma-separated)</Label>
        <Input id="interests" name="interests" placeholder="Research, Hackathons" defaultValue={profile.interests?.join(", ") ?? ""} />
      </div>

      <div className="grid sm:grid-cols-3 gap-5">
        <div>
          <Label htmlFor="portfolio_url">Portfolio</Label>
          <Input id="portfolio_url" name="portfolio_url" type="url" placeholder="https://" defaultValue={profile.portfolio_url ?? ""} />
          <FieldError>{state.fieldErrors?.portfolio_url}</FieldError>
        </div>
        <div>
          <Label htmlFor="github_url">GitHub</Label>
          <Input id="github_url" name="github_url" type="url" placeholder="https://" defaultValue={profile.github_url ?? ""} />
          <FieldError>{state.fieldErrors?.github_url}</FieldError>
        </div>
        <div>
          <Label htmlFor="linkedin_url">LinkedIn</Label>
          <Input id="linkedin_url" name="linkedin_url" type="url" placeholder="https://" defaultValue={profile.linkedin_url ?? ""} />
          <FieldError>{state.fieldErrors?.linkedin_url}</FieldError>
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-ink/10">
        <p className="text-xs text-ink/40 pt-4">Privacy: off by default, on only if you choose.</p>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" name="is_profile_public" defaultChecked={profile.is_profile_public} className="accent-accent" />
          Make my profile visible to other members
        </label>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" name="is_contact_public" defaultChecked={profile.is_contact_public} className="accent-accent" />
          Show my contact links (portfolio/GitHub/LinkedIn) publicly
        </label>
      </div>

      <div className="space-y-1 pt-4 border-t border-ink/10">
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" name="show_on_core" defaultChecked={profile.show_on_core ?? true} className="accent-accent" />
          Show my profile on the Core page
        </label>
        <FieldHint>On by default. It matters only if an admin adds you to a team: your name, photo, department, year and bio then show on the Core page.</FieldHint>
      </div>

      <Button type="submit" loading={pending}>
        Save profile
      </Button>
    </form>
  );
}
