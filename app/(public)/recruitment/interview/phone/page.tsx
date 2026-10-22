import type { Metadata } from "next";
import { createHash } from "node:crypto";
import { PhoneCamera } from "@/components/interview/phone-camera";
import { CutCard } from "@/components/ui/cut-card";
import { Section } from "@/components/ui/section";
import { ensureRoom, meetingToken } from "@/lib/interview/daily";
import { phoneUserId } from "@/lib/interview/shared";
import { slotRange } from "@/lib/recruitment/slots";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Phone camera", robots: { index: false } };

/**
 * The phone's second camera, opened from the QR code on the candidate's
 * screen (no sign-in). The link carries a random token; the database keeps
 * only its hash, for 10 minutes, tied to that one booking. The phone joins the
 * slot's room camera-only and muted, as "<name> (phone)".
 */
export default async function PhoneCameraPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const token = String((await searchParams).t ?? "");
  const invalid = (
    <Section className="max-w-lg pt-12">
      <CutCard className="h-auto">
        <p className="font-medium text-ink">This phone camera link is not valid</p>
        <p className="mt-2 text-sm text-ink/75">It may have expired (links last 10 minutes). Scan the new QR code shown on your laptop.</p>
      </CutCard>
    </Section>
  );
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return invalid;

  const supabase = await createClient();
  const { data } = await supabase.rpc("phone_link_info", { p_hash: createHash("sha256").update(token).digest("hex") });
  if (!data) return invalid;
  const info = data as { booking_id: string; slot_id: string; name: string; starts_at: string; ends_at: string; opens_at: string; closes_at: string; open: boolean };
  if (!info.open) {
    return (
      <Section className="max-w-lg pt-12">
        <CutCard className="h-auto">
          <p className="font-medium text-ink">The room is not open yet</p>
          <p className="mt-2 text-sm text-ink/75">Scan the QR code again when your interview room opens.</p>
        </CutCard>
      </Section>
    );
  }

  let join: { url: string; token: string } | null = null;
  try {
    const room = await ensureRoom(info.slot_id, info.closes_at);
    const dailyToken = await meetingToken({
      room: room.name,
      kind: "phone",
      userName: `${info.name} (phone)`,
      userId: phoneUserId(info.booking_id),
      opensAt: info.opens_at,
      closesAt: info.closes_at,
    });
    join = { url: room.url, token: dailyToken };
  } catch {
    join = null;
  }

  return (
    <Section className="max-w-lg pt-8">
      <h1 className="font-serif text-2xl text-ink">Phone camera</h1>
      <p className="mt-2 text-sm text-ink/75">
        {info.name} · {slotRange(info.starts_at, info.ends_at)} IST
      </p>
      {join ? (
        <PhoneCamera url={join.url} token={join.token} />
      ) : (
        <CutCard className="mt-6 h-auto">
          <p className="text-sm text-ink">Could not open the camera link. Please scan the QR code again in a moment.</p>
        </CutCard>
      )}
    </Section>
  );
}
