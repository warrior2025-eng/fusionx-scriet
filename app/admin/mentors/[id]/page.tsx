import type { Metadata } from "next";
import { EntityFormPage } from "@/components/admin/entity-pages";
import { createClient } from "@/lib/supabase/server";
import { photoSource } from "@/lib/photo-source";

export const metadata: Metadata = { title: "Admin: Edit Mentors" };

const SOURCE = { own: "Member's own photo", google: "Google photo", github: "GitHub photo", other: "Member's own photo", none: "Initials" } as const;

/** Which photo the public sees on this mentor's card right now (the order is in migration 0041). */
async function shownPhoto(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: mentor } = await supabase.from("mentors").select("photo_path, user_id").eq("id", id).maybeSingle();
  if (!mentor) return null;
  if (mentor.photo_path) return "Admin photo";
  if (!mentor.user_id) return "Initials";
  const { data: profile } = await supabase.from("profiles").select("avatar_url").eq("id", mentor.user_id).maybeSingle();
  return SOURCE[photoSource(profile?.avatar_url)];
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shown = await shownPhoto(id);
  return (
    <EntityFormPage
      entity="mentors"
      id={id}
      intro={
        shown && (
          <p className="text-sm text-ink/75" data-public-photo={shown}>
            Photo the public sees now: <span className="font-semibold text-ink">{shown}</span>
          </p>
        )
      }
    />
  );
}
