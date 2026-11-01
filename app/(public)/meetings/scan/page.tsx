import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { hashToken, readQrToken } from "@/lib/meetings/qr";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Join on phone", robots: { index: false } };

const EXPIRED = "This QR has expired. Refresh it on your pass.";

function Message({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Section className="pt-16 pb-24">
      <div className="mx-auto max-w-md border border-line bg-surface p-8 text-center">
        <h1 className="font-serif text-2xl text-ink">{title}</h1>
        {children}
      </div>
    </Section>
  );
}

/** Where the phone lands after scanning. The token works once, within 2 minutes, for its own account. */
export default async function ScanPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const token = (t ?? "").slice(0, 600);
  const read = token ? readQrToken(token) : null;
  if (!read) return <Message title={EXPIRED} />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/meetings/scan?t=${token}`)}`);

  const otherAccount = (
    <Message title="This QR belongs to another account">
      <p className="mt-2 text-sm text-ink/70">Sign in on this phone with the account that shows the pass, then scan again.</p>
      <form action={logoutAction} className="mt-5">
        <Button type="submit">Sign out</Button>
      </form>
    </Message>
  );
  if (read.userId !== user.id) return otherAccount;

  const { data, error } = await supabase.rpc("meeting_qr_use", { p_hash: hashToken(token) });
  const used = data as { ok: boolean; reason?: string; meeting_id?: string } | null;
  if (error || !used) return <Message title={EXPIRED} />;
  if (used.reason === "other_account") return otherAccount;
  if (!used.ok || !used.meeting_id) return <Message title={EXPIRED} />;
  redirect(`/meetings/${used.meeting_id}?enter=direct`);
}
