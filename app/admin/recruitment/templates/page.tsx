import type { Metadata } from "next";
import { saveTemplate } from "@/actions/admin-recruitment";
import { AdminForm, TextareaField } from "@/components/admin/admin-form";
import { AdminPage, Panel } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";

export const metadata: Metadata = { title: "Admin: Recruitment messages" };

// When each message is sent, in the order a candidate would meet them.
const MESSAGES = [
  { key: "submitted", title: "Application received", when: "Sent when a candidate submits. {team} is the list of teams they chose." },
  { key: "shortlisted", title: "Shortlisted", when: "Sent as soon as a candidate is moved to Shortlisted." },
  { key: "interview", title: "Interview", when: "Sent when an interview is scheduled or its time or place changes." },
  { key: "selected", title: "Selected", when: "Sent when results are published, and shown on the candidate's status page. {hub} is the hub." },
  { key: "waitlisted", title: "Waitlisted", when: "Sent when results are published, and shown on the status page. {rank} is the waitlist position." },
  { key: "not_selected", title: "Not selected", when: "Sent when results are published, and shown on the status page." },
  { key: "absent", title: "Absent", when: "For a candidate marked absent from the interview: sent when results are published, and shown on the status page." },
  {
    key: "social_post",
    title: "Social media announcement (draft)",
    when: "Never sent. The draft on the Results page, per hub. {selected} and {waitlist} become the names of candidates who agreed to be named.",
  },
] as const;

export default async function RecruitmentTemplatesPage() {
  const ctx = await requireCapability("recruitment.content", "/admin/recruitment");
  const { data } = await ctx.supabase.from("recruitment_message_templates").select("key, body");
  const bodies = Object.fromEntries((data ?? []).map((t) => [t.key as string, t.body as string]));

  return (
    <AdminPage
      title="Message templates"
      description="The notifications candidates receive on the site. Use {name} for the candidate, {team} or {hub} for the team, {cycle} for the cycle's title and {rank} for a waitlist position. A message written for one candidate on the Results board replaces these."
      crumbs={[{ label: "Recruitment", href: "/admin/recruitment" }, { label: "Message templates" }]}
    >
      <div className="space-y-6">
        {MESSAGES.map((message) => (
          <Panel key={message.key} title={message.title} description={message.when}>
            <AdminForm action={saveTemplate.bind(null, message.key)}>
              <TextareaField
                name="body"
                label="Message"
                rows={message.key === "social_post" ? 8 : 3}
                max={message.key === "social_post" ? 2000 : 1000}
                counter
                defaultValue={bodies[message.key] ?? ""}
              />
            </AdminForm>
          </Panel>
        ))}
      </div>
    </AdminPage>
  );
}
