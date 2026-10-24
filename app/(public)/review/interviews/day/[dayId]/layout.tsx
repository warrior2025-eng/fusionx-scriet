import { getCurrentUser } from "@/lib/permissions";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DayRoomShell } from "@/components/interview/day-room";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { getDayAccess } from "@/lib/interview/day-access";
import { dayLabel } from "@/lib/recruitment/slots";

export const metadata: Metadata = { title: "Interview room", robots: { index: false } };

/** The day's interview room for reviewers (all hubs, or a hub with a candidate that day). The call stays connected between slots. */
export default async function ReviewerDayRoomLayout({ params, children }: { params: Promise<{ dayId: string }>; children: React.ReactNode }) {
  const { dayId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/review/interviews/day/${dayId}`);
  const access = await getDayAccess(dayId);
  if (!access) notFound();
  return (
    <Section className="max-w-7xl pt-12">
      <Link href="/review/interviews" className="text-sm text-ink/70 hover:text-ink">
        ← Interview panel
      </Link>
      <Eyebrow className="mt-4">Interview room</Eyebrow>
      <h1 className="mb-6 font-serif text-2xl tracking-tight text-ink md:text-3xl">{dayLabel(access.day, "long")}</h1>
      <DayRoomShell access={access}>{children}</DayRoomShell>
    </Section>
  );
}
