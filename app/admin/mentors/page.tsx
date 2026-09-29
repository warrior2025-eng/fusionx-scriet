import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { MentorRow } from "@/components/admin/mentor-row";

export default async function AdminMentorsPage() {
  const supabase = await createClient();
  const { data: mentors } = await supabase
    .from("mentors")
    .select("id, name, role_title, is_published")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-ink">Mentors</h1>
        <LinkButton href="/admin/mentors/new" size="sm">
          Add mentor
        </LinkButton>
      </div>
      {mentors && mentors.length > 0 ? (
        <div className="space-y-2">
          {mentors.map((m) => (
            <MentorRow key={m.id} id={m.id} name={m.name} roleTitle={m.role_title} isPublished={m.is_published} />
          ))}
        </div>
      ) : (
        <EmptyState title="No mentors yet." description="Add faculty, seniors, or alumni as mentors." />
      )}
    </div>
  );
}
