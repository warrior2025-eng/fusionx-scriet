import { ExternalLink, FileText, MessageCircle, PartyPopper } from "lucide-react";
import { respondToOffer } from "@/actions/recruitment-results";
import { ActionButton } from "@/components/admin/action-button";
import { LinkButton } from "@/components/ui/button";
import { CutCard } from "@/components/ui/cut-card";
import { istDateTime } from "@/lib/events/format";
import type { MyResult } from "@/lib/recruitment/results";

type Shown = Extract<MyResult, { state: "published" | "preview" }>;

/** "Other ways to be part of FusionX@SCRIET": for everyone without a place. */
function OtherWays() {
  return (
    <div className="mt-6 border-t border-line pt-5">
      <p className="text-sm text-ink">There are other ways to be part of FusionX@SCRIET:</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <LinkButton href="/join" size="sm">
          Join FusionX@SCRIET
        </LinkButton>
        <LinkButton href="/teams" size="sm" variant="secondary">
          Explore FusionX Teams
        </LinkButton>
      </div>
    </div>
  );
}

/**
 * A candidate's result, as the status page shows it (and as "Preview as
 * candidate" shows it to admins, with the buttons switched off). Everything
 * here came from get_my_result, which returns it only after the publish time.
 */
export function ResultView({ result, cycleId, preview = false }: { result: Shown; cycleId: string; preview?: boolean }) {
  const first = (result.name ?? "").trim().split(/\s+/)[0] || "there";
  const waitlisted = result.hubs.filter((h) => h.decision === "waitlisted" && h.waitlist_rank !== null);
  const sel = result.selected;
  const selHub = sel ? result.hubs.find((h) => h.team_id === sel.team_id) : undefined;
  const induction = result.induction;
  const hasInduction = Boolean(induction && (induction.at || induction.link || induction.venue || induction.note));

  if (result.outcome === "selected" && sel) {
    return (
      <CutCard className="h-auto">
        <p className="flex items-center gap-2 text-sm font-medium text-accent">
          <PartyPopper size={16} aria-hidden /> Selected
        </p>
        <h2 className="mt-2 font-serif text-2xl text-ink md:text-3xl">Congratulations, {first}!</h2>
        <p className="mt-2 text-ink">
          You have been selected for <span className="font-semibold">{sel.team_name}</span>.
        </p>
        {selHub?.message && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink/75">{selHub.message}</p>}

        <div className="mt-6 flex flex-wrap gap-3">
          {sel.whatsapp_url && (
            <a
              href={preview ? undefined : sel.whatsapp_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={preview || undefined}
              className="inline-flex items-center gap-2 rounded-sm bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90"
            >
              <MessageCircle size={16} aria-hidden /> Join your hub&rsquo;s WhatsApp group <ExternalLink size={14} aria-hidden />
            </a>
          )}
          {!preview && (
            <LinkButton href="/recruitment/results/offer-letter" variant="secondary" size="md">
              <FileText size={15} aria-hidden /> Download offer letter
            </LinkButton>
          )}
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-sm font-semibold text-ink">Induction meeting</h3>
          {hasInduction && induction ? (
            <dl className="mt-2 space-y-1.5 text-sm">
              {induction.at && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-ink/60">When</dt>
                  <dd className="text-ink">{istDateTime(induction.at)}</dd>
                </div>
              )}
              {induction.mode && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-ink/60">Mode</dt>
                  <dd className="text-ink">{induction.mode === "online" ? "Online" : "In person"}</dd>
                </div>
              )}
              {induction.venue && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-ink/60">Venue</dt>
                  <dd className="text-ink">{induction.venue}</dd>
                </div>
              )}
              {induction.link && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-ink/60">Link</dt>
                  <dd className="min-w-0 break-all">
                    <a href={induction.link} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline underline-offset-2">
                      {induction.link}
                    </a>
                  </dd>
                </div>
              )}
              {induction.note && <p className="whitespace-pre-line pt-1 text-ink/75">{induction.note}</p>}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-ink/70">Induction details will be shared soon.</p>
          )}
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-sm font-semibold text-ink">Your place</h3>
          {sel.offer_status === "accepted" ? (
            <p className="mt-2 text-sm text-ink">You accepted your place. Welcome to {sel.team_name}!</p>
          ) : sel.can_respond || preview ? (
            <>
              <p className="mt-2 text-sm text-ink/75">
                Please accept or decline your place
                {sel.offer_deadline ? ` by ${istDateTime(sel.offer_deadline)}` : ""}.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <ActionButton variant="primary" size="md" disabled={preview} action={respondToOffer.bind(null, cycleId, true)}>
                  Accept my place
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  size="md"
                  danger
                  disabled={preview}
                  action={respondToOffer.bind(null, cycleId, false)}
                  confirm={{
                    title: "Decline your place?",
                    body: `Your seat in ${sel.team_name} will be offered to someone on the waitlist. This cannot be undone.`,
                    confirmLabel: "Decline",
                  }}
                >
                  Decline
                </ActionButton>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink/75">The time to answer has passed. Please contact the FusionX@SCRIET team.</p>
          )}
        </div>
      </CutCard>
    );
  }

  if (result.outcome === "waitlisted" && waitlisted.length > 0) {
    return (
      <CutCard className="h-auto">
        <p className="text-sm font-medium text-ink/70">Waitlist</p>
        {waitlisted.map((hub) => (
          <div key={hub.team_id} className="mt-2">
            <h2 className="font-serif text-2xl text-ink">
              You are #{hub.waitlist_rank} on the waitlist for {hub.team_name}
            </h2>
            {hub.message && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink/75">{hub.message}</p>}
          </div>
        ))}
        <p className="mt-4 text-sm text-ink">You may be offered a seat if one becomes available. We&rsquo;ll notify you here.</p>
      </CutCard>
    );
  }

  const absent = result.outcome === "absent";
  const message = result.hubs.find((h) => h.message)?.message;
  return (
    <CutCard className="h-auto">
      <h2 className="font-serif text-2xl text-ink">
        {absent
          ? "You did not attend your interview"
          : result.outcome === "declined"
            ? "You declined your place"
            : result.outcome === "expired"
              ? "Your offer has expired"
              : "Thank you for applying"}
      </h2>
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink/75">
        {absent
          ? (message ?? "You did not attend your interview slot, so your application could not be considered in this cycle.")
          : result.outcome === "declined"
            ? `You declined your place in ${result.hub ?? "your hub"}. Thank you for letting us know.`
            : result.outcome === "expired"
              ? `The deadline to accept your place in ${result.hub ?? "your hub"} passed, so the seat was released.`
              : (message ?? "You were not selected this time.")}
      </p>
      <OtherWays />
    </CutCard>
  );
}
