import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cancelMySlot } from "@/actions/recruitment-slots";
import { ActionButton } from "@/components/admin/action-button";
import { Toaster } from "@/components/admin/toast";
import { SlotPicker } from "@/components/recruitment/slot-picker";
import { LinkButton } from "@/components/ui/button";
import { CutCard } from "@/components/ui/cut-card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { getCurrentCycle, getMyBooking, getSlotAvailability } from "@/lib/recruitment/data";
import { DEFAULT_INSTRUCTIONS } from "@/lib/recruitment/slots";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Interview slot", robots: { index: false } };

/** Choosing or changing the interview slot after the application is in. */
export default async function RecruitmentSlotPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/recruitment/slot");

  const cycle = await getCurrentCycle();
  const { data: application } = cycle
    ? await supabase.from("recruitment_applications").select("status").eq("cycle_id", cycle.id).eq("user_id", user.id).maybeSingle()
    : { data: null };
  // A draft chooses its slot inside the application form.
  if (application?.status === "draft") redirect("/recruitment/apply");

  const note = (text: string) => (
    <Section className="max-w-3xl pt-16">
      <Eyebrow>Recruitment</Eyebrow>
      <CutCard className="h-auto">
        <p className="text-ink">{text}</p>
        <div className="mt-5">
          <LinkButton href="/recruitment/status" variant="secondary" size="sm">
            Back to your application
          </LinkButton>
        </div>
      </CutCard>
    </Section>
  );
  if (!cycle || application?.status !== "submitted") return note("Interview slots are for submitted applications.");

  const [slots, booking] = await Promise.all([getSlotAvailability(cycle.id), getMyBooking(cycle.id)]);
  if (booking && !booking.can_change) return note("Your interview slot can no longer be changed.");

  return (
    <Section className="max-w-3xl pt-16">
      <Toaster />
      <Eyebrow>Recruitment</Eyebrow>
      <h1 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">{booking ? "Change your interview slot" : "Choose your interview slot"}</h1>
      <p className="mt-2 text-sm text-ink/70">
        Picking a slot books it straight away{booking ? " and frees your current one" : ""}.{" "}
        <Link href="/recruitment/status" className="font-medium text-accent">
          Back to your application
        </Link>
      </p>
      <CutCard className="mt-8 h-auto">
        <SlotPicker cycleId={cycle.id} initial={slots} instructions={cycle.interview_instructions || DEFAULT_INSTRUCTIONS} />
      </CutCard>
      {booking && cycle.slot_required === false && (
        <div className="mt-6">
          <ActionButton
            variant="ghost"
            danger
            action={cancelMySlot.bind(null, cycle.id)}
            confirm={{ title: "Cancel your interview slot?", body: "Your seat is given up. You can pick another while booking is open.", confirmLabel: "Cancel slot" }}
          >
            Cancel my slot
          </ActionButton>
        </div>
      )}
    </Section>
  );
}
