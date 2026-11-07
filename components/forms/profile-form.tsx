"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updatePhoto, updateProfile, type ProfileActionState } from "@/actions/profile";
import { ImageField } from "@/components/admin/image-field";
import { photoSource } from "@/lib/photo-source";
import { useFormSubmit } from "@/components/ui/form-errors";
import { LinkInput } from "@/components/ui/link-input";
import { Label, Input, Textarea, FieldError, FieldHint } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { BIO_MAX, bioLength, profileSchema } from "@/lib/validation/profile";
import type { Profile } from "@/types/database";

const initialState: ProfileActionState = { status: "idle" };
const DRAFT_KEY = "fx-profile-draft";
const DRAFT_FIELDS = ["full_name", "department", "year", "bio", "skills", "interests", "portfolio_url", "github_url", "linkedin_url"];

/** Sets a field the way typing would, so React's own state follows. */
function fill(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function ProfileForm({ profile, email, isCoreMember, cardHasTeamPhoto = false }: { profile: Profile; email: string; isCoreMember: boolean; cardHasTeamPhoto?: boolean }) {
  const source = photoSource(profile.avatar_url);
  const router = useRouter();
  const [photoState, setPhotoState] = useState<{ busy: boolean; ok?: boolean; message?: string }>({ busy: false });
  // The photo is saved on its own as soon as it is cropped or removed.
  const savePhotoNow = async (data: FormData) => {
    setPhotoState({ busy: true, message: "Saving your photo…" });
    try {
      const result = await updatePhoto(data);
      setPhotoState({ busy: false, ok: result.ok, message: result.message });
      if (result.ok) router.refresh();
    } catch {
      setPhotoState({ busy: false, ok: false, message: "The photo couldn't be sent. Check your connection and try again." });
    }
  };
  const onCropped = (file: File) => {
    const data = new FormData();
    data.set("avatar", file);
    void savePhotoNow(data);
  };
  const onRemovePhoto = () => {
    const data = new FormData();
    data.set("avatar__remove", "on");
    void savePhotoNow(data);
  };
  const [bio, setBio] = useState(profile.bio ?? "");
  // Remounts the fields after a save, so they show what was saved.
  const [version, setVersion] = useState(0);
  const [restored, setRestored] = useState(false);
  const { state, pending, errors, summary, formProps } = useFormSubmit(updateProfile, initialState, {
    schema: profileSchema,
    onResult: (result, form) => {
      if (result.signedOut && form) {
        const draft = Object.fromEntries(DRAFT_FIELDS.map((name) => [name, (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? ""]));
        try {
          sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch {}
      }
      if (result.status === "success" || result.status === "partial") {
        try {
          sessionStorage.removeItem(DRAFT_KEY);
        } catch {}
        setRestored(false);
        setVersion((v) => v + 1);
      }
    },
  });
  const once = useRef(false);

  // Back after signing in: what they had typed.
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    let draft: Record<string, string> | null = null;
    try {
      const stored = sessionStorage.getItem(DRAFT_KEY);
      draft = stored ? JSON.parse(stored) : null;
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
    if (!draft) return;
    const kept = draft;
    const timer = window.setTimeout(() => {
      const form = document.getElementById("profile-form") as HTMLFormElement | null;
      if (!form) return;
      for (const name of DRAFT_FIELDS) {
        const el = form.elements.namedItem(name);
        if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && typeof kept[name] === "string") fill(el, kept[name]);
      }
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const length = bioLength(bio);

  return (
    <form {...formProps} id="profile-form" className="space-y-6">
      {summary}
      {state.signedOut && (
        <p className="text-sm">
          <a href="/login?next=/profile" className="font-medium text-accent underline underline-offset-2">
            Sign in again
          </a>
        </p>
      )}
      {restored && <p className="text-sm text-ink/70">Your unsaved changes are back. Press Save profile to keep them.</p>}
      {state.status === "success" && state.message && (
        <p role="status" className="text-sm text-accent">
          {state.message}
        </p>
      )}
      {state.status === "partial" && state.message && (
        <p role="alert" className="border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">
          {state.message}
        </p>
      )}

      {/* Remounted after a save, so it shows the saved photo rather than the local preview. */}
      <ImageField
        key={profile.avatar_url ?? "none"}
        name="avatar"
        label="Profile photo (optional)"
        hint="JPG, PNG, WEBP, GIF, BMP, HEIC or AVIF, up to 15 MB. You choose the square crop, and it is shrunk for you."
        currentUrl={profile.avatar_url}
        photo
        removeLabel="Remove photo"
        onCropped={onCropped}
        onRemove={onRemovePhoto}
      />
      {photoState.message && (
        <p role={photoState.ok === false ? "alert" : "status"} className={photoState.ok === false ? "-mt-3 text-sm text-red-600" : "-mt-3 text-sm text-accent"} data-photo-status>
          {photoState.message}
        </p>
      )}
      {(source !== "none" || cardHasTeamPhoto) && (
        <div className="-mt-3 space-y-1 text-sm text-ink/70" data-photo-source={source}>
          {source === "own" && <p>Your photo.</p>}
          {(source === "google" || source === "github" || source === "other") && (
            <p>
              {source === "google" ? "Photo from your Google account." : source === "github" ? "Photo from your GitHub account." : "Photo from the account you sign in with."}{" "}
              <label htmlFor="avatar" className="cursor-pointer font-medium text-accent-text underline underline-offset-2">
                Upload your own
              </label>
            </p>
          )}
          {cardHasTeamPhoto && <p data-team-photo-note>Your FusionX card shows a photo set by the FusionX team.</p>}
        </div>
      )}

      <div>
        <Label>Email</Label>
        <p className="text-sm text-ink/50">{email}</p>
      </div>

      <div key={version} className="space-y-6">
        <div>
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" required defaultValue={profile.full_name} />
          <FieldError id="full_name-error">{errors.full_name}</FieldError>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <Label htmlFor="department">Department</Label>
            <Input id="department" name="department" defaultValue={profile.department ?? ""} />
            <FieldError id="department-error">{errors.department}</FieldError>
          </div>
          <div>
            <Label htmlFor="year">Year</Label>
            <Input id="year" name="year" placeholder="e.g. 2nd Year" defaultValue={profile.year ?? ""} />
            <FieldError id="year-error">{errors.year}</FieldError>
          </div>
        </div>

        <div>
          <Label htmlFor="bio">Bio (optional)</Label>
          <Textarea id="bio" name="bio" rows={6} value={bio} onChange={(e) => setBio(e.target.value)} />
          <p className={`mt-1 text-right text-xs tabular-nums ${length > BIO_MAX ? "font-medium text-red-600" : "text-ink/50"}`} data-bio-count>
            {length}/{BIO_MAX}
          </p>
          <FieldError id="bio-error">{errors.bio}</FieldError>
        </div>

        <div>
          <Label htmlFor="skills">Skills (comma-separated)</Label>
          <Input id="skills" name="skills" placeholder="Frontend, AI/ML, Design" defaultValue={profile.skills?.join(", ") ?? ""} />
          <FieldError id="skills-error">{errors.skills}</FieldError>
        </div>

        <div>
          <Label htmlFor="interests">Interests (comma-separated)</Label>
          <Input id="interests" name="interests" placeholder="Research, Hackathons" defaultValue={profile.interests?.join(", ") ?? ""} />
          <FieldError id="interests-error">{errors.interests}</FieldError>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          <div>
            <Label htmlFor="portfolio_url">Portfolio</Label>
            <LinkInput id="portfolio_url" name="portfolio_url" kind="website" label="Portfolio" placeholder="riya.dev" defaultValue={profile.portfolio_url ?? ""} error={errors.portfolio_url} />
          </div>
          <div>
            <Label htmlFor="github_url">GitHub</Label>
            <LinkInput id="github_url" name="github_url" kind="github" label="GitHub" placeholder="@riya" defaultValue={profile.github_url ?? ""} error={errors.github_url} />
          </div>
          <div>
            <Label htmlFor="linkedin_url">LinkedIn</Label>
            <LinkInput id="linkedin_url" name="linkedin_url" kind="linkedin" label="LinkedIn" placeholder="riya-sharma" defaultValue={profile.linkedin_url ?? ""} error={errors.linkedin_url} />
          </div>
        </div>

        {isCoreMember ? (
          <p className="border-t border-ink/10 pt-4 text-sm text-ink/70" data-core-note>
            As a FusionX Core member, your profile, photo, bio and links (LinkedIn, GitHub, portfolio) are shown on the Core page. Your email and phone are never shown.
          </p>
        ) : (
          <>
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
          </>
        )}
      </div>

      <Button type="submit" loading={pending}>
        Save profile
      </Button>
    </form>
  );
}
