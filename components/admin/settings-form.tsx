"use client";

import { useActionState } from "react";
import { updateOrganizationSettings, type SettingsActionState } from "@/actions/admin-settings";
import { Label, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { OrganizationSettings } from "@/types/database";

const initialState: SettingsActionState = { status: "idle" };

export function SettingsForm({ settings }: { settings: OrganizationSettings }) {
  const [state, formAction, pending] = useActionState(updateOrganizationSettings, initialState);

  return (
    <form action={formAction} className="space-y-6 max-w-xl">
      {state.message && (
        <p className={`text-sm ${state.status === "success" ? "text-accent" : "text-red-600"}`}>{state.message}</p>
      )}

      <div>
        <Label htmlFor="chapter_name">Chapter name</Label>
        <Input id="chapter_name" name="chapter_name" defaultValue={settings.chapter_name} />
      </div>
      <div>
        <Label htmlFor="tagline">Tagline</Label>
        <Input id="tagline" name="tagline" defaultValue={settings.tagline} />
      </div>
      <div>
        <Label htmlFor="faculty_guide_name">Faculty Guide name</Label>
        <Input id="faculty_guide_name" name="faculty_guide_name" defaultValue={settings.faculty_guide_name} />
      </div>
      <div>
        <Label htmlFor="faculty_guide_title">Faculty Guide title</Label>
        <Input id="faculty_guide_title" name="faculty_guide_title" defaultValue={settings.faculty_guide_title} />
      </div>
      <div>
        <Label htmlFor="institutional_approval">Institutional approval status</Label>
        <Select id="institutional_approval" name="institutional_approval" defaultValue={settings.institutional_approval}>
          <option value="faculty_guide_confirmed">Faculty Guide Confirmed</option>
          <option value="director_review_pending">Director review pending</option>
          <option value="officially_approved">Officially Approved</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="official_email">Official email</Label>
        <Input id="official_email" name="official_email" type="email" defaultValue={settings.official_email ?? ""} />
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="instagram_url">Instagram URL</Label>
          <Input id="instagram_url" name="instagram_url" type="url" defaultValue={settings.instagram_url ?? ""} />
        </div>
        <div>
          <Label htmlFor="linkedin_url">LinkedIn URL</Label>
          <Input id="linkedin_url" name="linkedin_url" type="url" defaultValue={settings.linkedin_url ?? ""} />
        </div>
        <div>
          <Label htmlFor="github_url">GitHub URL</Label>
          <Input id="github_url" name="github_url" type="url" defaultValue={settings.github_url ?? ""} />
        </div>
      </div>
      <div>
        <Label htmlFor="announcement_banner">Announcement banner text</Label>
        <Input id="announcement_banner" name="announcement_banner" defaultValue={settings.announcement_banner ?? ""} />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink/70">
        <input
          type="checkbox"
          name="announcement_banner_active"
          defaultChecked={settings.announcement_banner_active}
          className="accent-accent"
        />
        Show announcement banner site-wide
      </label>

      <Button type="submit" loading={pending}>
        Save settings
      </Button>
    </form>
  );
}
