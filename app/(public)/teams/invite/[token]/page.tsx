import type { Metadata } from "next";
import { acceptInvite, declineInvite } from "@/actions/teams";
import { ActionButton } from "@/components/admin/action-button";
import { Toaster } from "@/components/admin/toast";
import { LinkButton } from "@/components/ui/button";
import { CutCard } from "@/components/ui/cut-card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { formatDate } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Team invitation", robots: { index: false } };

type InviteInfo = {
  team_id: string;
  team_name: string;
  focus: string | null;
  inviter: string | null;
  status: "pending" | "accepted" | "declined" | "expired" | "revoked";
  expires_at: string;
  signed_in: boolean;
  email_matches: boolean;
};

const DONE: Record<Exclude<InviteInfo["status"], "pending">, string> = {
  accepted: "This invitation has already been accepted.",
  declined: "This invitation was declined.",
  expired: "This invitation has expired. Ask the team leader for a new one.",
  revoked: "This invitation was withdrawn by the team.",
};

export default async function TeamInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  // The token is the secret. The function returns the team's name and the invite's state, nothing private.
  const { data } = /^[0-9a-f]{32,128}$/i.test(token) ? await supabase.rpc("team_invite_info", { p_token: token }) : { data: null };
  const invite = data as InviteInfo | null;
  const next = encodeURIComponent(`/teams/invite/${token}`);

  return (
    <Section className="max-w-2xl pt-16">
      <Toaster />
      <Eyebrow>FusionX Teams</Eyebrow>
      <h1 className="font-serif text-3xl tracking-tight text-ink md:text-4xl">Team invitation</h1>
      <CutCard className="mt-8 h-auto">
        {!invite ? (
          <p className="text-ink">This invitation link is not valid.</p>
        ) : (
          <>
            <p className="text-ink">
              {invite.inviter ? `${invite.inviter} invited you` : "You are invited"} to join{" "}
              <span className="font-semibold">{invite.team_name}</span>
              {invite.focus ? ` (${invite.focus})` : ""}.
            </p>
            {invite.status !== "pending" ? (
              <p className="mt-4 text-sm text-ink/75">{DONE[invite.status]}</p>
            ) : !invite.signed_in ? (
              <>
                <p className="mt-4 text-sm text-ink/75">
                  Sign in, or create an account, with the email address this invitation was sent to. It is valid until {formatDate(invite.expires_at)}.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <LinkButton href={`/login?next=${next}`}>Sign in</LinkButton>
                  <LinkButton href={`/signup?next=${next}`} variant="secondary">
                    Create an account
                  </LinkButton>
                </div>
              </>
            ) : !invite.email_matches ? (
              <p className="mt-4 text-sm text-ink/75">
                This invitation was sent to a different email address. Sign in with that address to accept it.
              </p>
            ) : (
              <div className="mt-6 flex flex-wrap gap-3">
                <ActionButton variant="primary" size="md" action={acceptInvite.bind(null, token)}>
                  Accept and join
                </ActionButton>
                <ActionButton size="md" action={declineInvite.bind(null, token)} confirm={{ title: "Decline this invitation?", confirmLabel: "Decline" }}>
                  Decline
                </ActionButton>
              </div>
            )}
          </>
        )}
      </CutCard>
    </Section>
  );
}
