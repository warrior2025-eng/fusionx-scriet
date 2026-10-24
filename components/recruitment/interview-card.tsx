import { CalendarPlus, ExternalLink, Video } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { CutCard } from "@/components/ui/cut-card";
import { istDateTime } from "@/lib/events/format";
import { MODE_LABELS, dayLabel, slotRange, type MeetLinkState, type MyBooking } from "@/lib/recruitment/slots";

/**
 * The candidate's interview on the status page: the booked slot in IST, how
 * it is held, the instructions, and where to join. On a day in the website's
 * interview room (`room`), it says so (not Google Meet); the room card above
 * has the Join button. On a Google Meet day, the link is rendered only when the
 * database handed it over (on the day, once published, until an hour after the slot).
 */
export function InterviewCard({
  booking,
  meet,
  instructions,
  reportingNote,
  hasSlots,
  changeHref,
  room = false,
}: {
  booking: MyBooking | null;
  meet: MeetLinkState;
  instructions: string;
  reportingNote: string | null;
  /** The cycle has slots to choose from. */
  hasSlots: boolean;
  /** Where to choose or change a slot; null when that is not possible now. */
  changeHref: string | null;
  /** The day uses the in-website interview room. */
  room?: boolean;
}) {
  if (!booking) {
    if (!hasSlots) return null;
    return (
      <CutCard className="h-auto">
        <p className="font-medium text-ink">Choose your interview slot</p>
        <p className="mt-2 text-sm leading-relaxed text-ink/70">You have not picked an interview time yet.</p>
        {changeHref && (
          <div className="mt-5">
            <LinkButton href={changeHref} size="sm">
              Choose a slot
            </LinkButton>
          </div>
        )}
      </CutCard>
    );
  }

  const online = booking.mode === "online_meet";
  return (
    <CutCard className="h-auto">
      <p className="text-sm text-ink/65">Your interview</p>
      <h2 className="mt-1 font-serif text-xl font-medium text-ink">{dayLabel(booking.day, "long")}</h2>
      <p className="mt-1 text-ink">{slotRange(booking.starts_at, booking.ends_at)} IST</p>
      <dl className="mt-4 grid gap-1 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-ink/65">Mode</dt>
        <dd className="text-ink">{online && room ? "Online, on the FusionX@SCRIET website (interview room), not Google Meet" : MODE_LABELS[booking.mode]}</dd>
        {!online && (
          <>
            <dt className="text-ink/65">Venue</dt>
            <dd className="text-ink">{booking.venue || "To be announced"}</dd>
          </>
        )}
        {booking.status !== "booked" && (
          <>
            <dt className="text-ink/65">Marked</dt>
            <dd className="text-ink">{booking.status === "attended" ? "Attended" : "Did not attend"}</dd>
          </>
        )}
      </dl>

      {online && <p className="mt-4 border border-line bg-accent-soft px-4 py-3 text-sm leading-relaxed text-ink">{instructions}</p>}
      {reportingNote && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink/80">{reportingNote}</p>}

      {online && room && (
        <p className="mt-5 border-t border-line pt-5 text-sm text-ink">
          Your interview takes place on this website (in-website interview room), not on Google Meet. On {dayLabel(booking.day, "long")}, open this page a few
          minutes before your slot and press &ldquo;Join interview room&rdquo;.
        </p>
      )}
      {online && !room && (
        <div className="mt-5 border-t border-line pt-5" aria-live="polite">
          {meet.state === "available" ? (
            <>
              <a
                href={meet.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--primary inline-flex items-center gap-2 rounded-sm bg-accent px-5 py-3 text-base font-medium text-white hover:bg-accent/90"
              >
                <Video size={18} aria-hidden /> Join Google Meet <ExternalLink size={15} aria-hidden />
              </a>
              <p className="mt-2 text-sm text-ink/70">Your slot: {slotRange(meet.starts_at, meet.ends_at)} IST. Please join on time.</p>
            </>
          ) : meet.state === "not_published" ? (
            <p className="text-sm text-ink">The link will appear here soon. Please check again closer to your slot time.</p>
          ) : meet.state === "ended" ? (
            <p className="text-sm text-ink">Your interview slot has ended.</p>
          ) : (
            <p className="text-sm text-ink">The Google Meet link will be shared here on {dayLabel(booking.day, "long")}.</p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {booking.can_change && changeHref && (
          <LinkButton href={changeHref} variant="secondary" size="sm">
            Change slot
          </LinkButton>
        )}
        <LinkButton href="/recruitment/slot/calendar.ics" variant="secondary" size="sm">
          <CalendarPlus size={15} /> Add to calendar
        </LinkButton>
      </div>
      {booking.status === "booked" && (
        <p className="mt-3 text-xs text-ink/65">
          {booking.can_change ? `You can change your slot until ${istDateTime(booking.cutoff_at)}.` : "Your slot can no longer be changed."}
        </p>
      )}
    </CutCard>
  );
}
