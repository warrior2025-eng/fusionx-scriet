import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Link2, Video } from "lucide-react";
import {
  cancelBooking,
  deleteDay,
  generateSlots,
  moveBooking,
  previewSlots,
  publishMeetLinks,
  remindUnbooked,
  saveDay,
  saveMeetLink,
  saveSlotSettings,
  setBookingStatus,
  setSlotBlocked,
  setSlotCapacity,
} from "@/actions/admin-slots";
import { saveRoomSettings } from "@/actions/interview-panel";
import { ActionButton } from "@/components/admin/action-button";
import { AdminForm, CheckboxField, SelectField, TextField, TextareaField } from "@/components/admin/admin-form";
import { CycleTabs } from "@/components/admin/recruitment-parts";
import { AdminPage, Panel, Pill, Table, Td, Th, formatDate, param, type ListParams } from "@/components/admin/ui";
import { requireCapability } from "@/lib/admin/guard";
import type { Cycle } from "@/lib/recruitment/data";
import { countUnbooked, loadBoard, loadMeetLinks, loadSlotDays, type SlotDayRow } from "@/lib/recruitment/slot-admin";
import {
  DEFAULT_INSTRUCTIONS,
  DEFAULT_SESSIONS,
  MODE_LABELS,
  clockLabel,
  dayLabel,
  slotCount,
  slotRange,
  todayIst,
  type Session,
} from "@/lib/recruitment/slots";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin: Interview slots" };

const BOOKING_LABEL = { booked: "Booked", attended: "Attended", no_show: "No-show" } as const;

/** The fields of an interview day: date, up to four sessions, length, seats, mode. */
function DayFields({ day }: { day?: SlotDayRow }) {
  const sessions: (Session | null)[] = [...(day?.sessions ?? DEFAULT_SESSIONS)];
  while (sessions.length < 3) sessions.push(null);
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-3">
        <TextField name="date" label="Date" type="date" defaultValue={day?.date ?? ""} />
        <TextField name="slot_minutes" label="Slot length (minutes)" type="number" min={5} max={120} defaultValue={String(day?.slot_minutes ?? 20)} />
        <TextField name="capacity" label="People per slot" type="number" min={1} max={50} defaultValue={String(day?.capacity ?? 4)} />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Sessions (IST)</legend>
        <p className="mb-3 text-xs text-ink/65">The gap between two sessions is the break (lunch by default). Leave a row empty to skip it.</p>
        <div className="space-y-3">
          {sessions.map((s, i) => (
            <div key={i} className="grid grid-cols-3 gap-3">
              <TextField name={`session_${i}_label`} label={i === 0 ? "Name" : ""} defaultValue={s?.label ?? ""} maxLength={40} aria-label={`Session ${i + 1} name`} />
              <TextField name={`session_${i}_start`} label={i === 0 ? "Starts" : ""} type="time" defaultValue={s?.start ?? ""} aria-label={`Session ${i + 1} start`} />
              <TextField name={`session_${i}_end`} label={i === 0 ? "Ends" : ""} type="time" defaultValue={s?.end === "24:00" ? "23:59" : (s?.end ?? "")} aria-label={`Session ${i + 1} end`} />
            </div>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          name="mode"
          label="Mode"
          defaultValue={day?.mode ?? "online_meet"}
          options={[
            { value: "online_meet", label: MODE_LABELS.online_meet },
            { value: "offline", label: "In person" },
          ]}
        />
        <TextField name="venue" label="Venue (in person only)" defaultValue={day?.venue ?? ""} maxLength={300} />
      </div>
      <CheckboxField name="is_active" label="Open for booking" hint="When off, this day's slots are hidden from candidates." defaultChecked={day?.is_active ?? true} />
    </>
  );
}

export default async function CycleSlotsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ListParams> }) {
  const { id } = await params;
  const query = await searchParams;
  const ctx = await requireCapability("recruitment", `/admin/recruitment/${id}`);
  const { data: cycleRow } = await ctx.supabase.from("recruitment_cycles").select("*").eq("id", id).maybeSingle();
  if (!cycleRow) notFound();
  const cycle = cycleRow as Cycle;

  const [days, board, unbooked, { data: teamRows }] = await Promise.all([
    loadSlotDays(ctx.supabase, id),
    loadBoard(ctx.supabase, id),
    countUnbooked(ctx.supabase, id),
    ctx.supabase.from("recruitment_teams").select("id, name").eq("cycle_id", id),
  ]);
  const links = await loadMeetLinks(ctx.supabase, days.map((d) => d.id));
  // The in-website interview room (migration 0023): settings per day; an error means the migration has not run.
  const { data: roomRows, error: roomError } = days.length
    ? await ctx.supabase.from("recruitment_room_settings").select("*").in("day_id", days.map((d) => d.id))
    : { data: [], error: null };
  type RoomSettings = { day_id: string; room_enabled: boolean; early_join_minutes: number; grace_minutes: number; strict_fullscreen: boolean; phone_camera: string };
  const roomOf = (dayId: string) => ((roomRows ?? []) as RoomSettings[]).find((r) => r.day_id === dayId);
  const today = todayIst();
  const selected = days.find((d) => d.id === param(query, "day")) ?? days.find((d) => d.date >= today) ?? days[0] ?? null;
  const daySlots = selected ? board.filter((s) => s.day_id === selected.id) : [];
  const dayLink = selected ? links.find((l) => l.day_id === selected.id && !l.slot_id) : undefined;
  const teamName = Object.fromEntries((teamRows ?? []).map((t) => [t.id as string, t.name as string]));
  const base = `/admin/recruitment/${id}/slots`;

  const totals = days.map((d) => {
    const slots = board.filter((s) => s.day_id === d.id);
    const open = slots.filter((s) => !s.is_blocked);
    const seats = open.reduce((n, s) => n + s.capacity, 0);
    const booked = slots.reduce((n, s) => n + s.bookings.length, 0);
    return { day: d, slots: slots.length, seats, booked, free: Math.max(seats - booked, 0), linked: links.some((l) => l.day_id === d.id) };
  });

  return (
    <AdminPage
      title={`Interview slots: ${cycle.title}`}
      description="Times are India Standard Time. Candidates pick a slot while applying and can change it until the cutoff."
      crumbs={[{ label: "Recruitment", href: "/admin/recruitment" }, { label: cycle.title, href: `/admin/recruitment/${id}` }, { label: "Interview slots" }]}
    >
      <CycleTabs cycleId={id} current="/slots" admin />

      <div className="space-y-6">
        <Panel title="Settings" description="For this cycle.">
          <AdminForm action={saveSlotSettings.bind(null, id)}>
            <CheckboxField
              name="slot_required"
              label="A slot is required to submit"
              hint="Applies once the cycle has slots to choose from."
              defaultChecked={cycle.slot_required !== false}
            />
            <TextField
              name="cutoff_hours"
              label="Booking closes (hours before the slot)"
              type="number"
              min={0}
              max={72}
              defaultValue={String(cycle.cutoff_hours ?? 2)}
              className="max-w-xs"
            />
            <TextareaField
              name="interview_instructions"
              label="Interview instructions"
              hint="Shown on the slot picker, the review step, the status page and the booking notification."
              rows={3}
              max={1500}
              counter
              defaultValue={cycle.interview_instructions || DEFAULT_INSTRUCTIONS}
            />
            <TextareaField
              name="reporting_note"
              label="Reporting note (optional)"
              hint="Extra guidance on the status page, for example what to keep ready."
              rows={2}
              max={1000}
              defaultValue={cycle.reporting_note ?? ""}
            />
          </AdminForm>
        </Panel>

        <Panel title="Totals">
          {days.length === 0 ? (
            <p className="text-sm text-ink/65">No interview days yet. Add one below.</p>
          ) : (
            <Table label="Seats per day">
              <thead>
                <tr>
                  <Th>Day</Th>
                  <Th>Slots</Th>
                  <Th>Seats</Th>
                  <Th>Booked</Th>
                  <Th>Free</Th>
                  <Th>Meet link</Th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.day.id}>
                    <Td className="font-medium text-ink">
                      <Link href={`${base}?day=${t.day.id}`} className="hover:underline">
                        {dayLabel(t.day.date)}
                      </Link>
                      {!t.day.is_active && <span className="ml-2 text-xs text-ink/60">(hidden)</span>}
                    </Td>
                    <Td className="tabular-nums">{t.slots}</Td>
                    <Td className="tabular-nums">{t.seats}</Td>
                    <Td className="tabular-nums">{t.booked}</Td>
                    <Td className="tabular-nums">{t.free}</Td>
                    <Td>{t.day.mode === "offline" ? "In person" : t.linked ? <Pill tone="good">Link added</Pill> : <Pill tone="warn">No link</Pill>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink">
              Without a slot: <span className="font-semibold tabular-nums">{unbooked.submitted}</span> submitted,{" "}
              <span className="font-semibold tabular-nums">{unbooked.drafts}</span> still drafting.
            </p>
            {unbooked.submitted + unbooked.drafts > 0 && (
              <ActionButton
                action={remindUnbooked.bind(null, id)}
                confirm={{ title: "Send a reminder?", body: `${unbooked.submitted + unbooked.drafts} candidate(s) get a notification asking them to choose a slot.`, confirmLabel: "Send" }}
              >
                Send reminder
              </ActionButton>
            )}
          </div>
        </Panel>

        <Panel title="Interview days" description="Add a day, then press Generate slots. To change the times: save the new settings, press Preview, then Generate slots. Every booking is kept.">
          <div className="space-y-4">
            {days.map((day) => {
              const count = slotCount(day.sessions, day.slot_minutes);
              const existing = board.filter((s) => s.day_id === day.id).length;
              return (
                <details key={day.id} open={day.id === selected?.id} className="border border-line">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink">
                    {dayLabel(day.date, "long")}
                    <span className="ml-2 font-normal text-ink/65">
                      {day.sessions.map((s) => `${s.label} ${clockLabel(s.start)} to ${clockLabel(s.end)}`).join(", ")}
                    </span>
                  </summary>
                  <div className="space-y-5 border-t border-line p-4">
                    <div className="flex flex-wrap items-center gap-3 border border-line bg-paper px-3 py-2.5 text-sm">
                      <span className="text-ink">
                        Generates <span className="font-semibold">{count} slots, {count * day.capacity} seats</span> on {dayLabel(day.date)}.
                        <span className="text-ink/65"> Now: {existing} slots.</span>
                      </span>
                      <ActionButton action={previewSlots.bind(null, id, day.id)}>Preview</ActionButton>
                      <ActionButton
                        variant="primary"
                        action={generateSlots.bind(null, id, day.id)}
                        confirm={{
                          title: "Apply these slot timings?",
                          body: "Every booking is moved into the new slot that covers its time (first booked first). If that slot is full, into the next free one. Anyone whose time changes is notified. Press Preview first to see the numbers.",
                          confirmLabel: "Generate slots",
                        }}
                      >
                        Generate slots
                      </ActionButton>
                    </div>
                    <AdminForm action={saveDay.bind(null, id, day.id)}>
                      <DayFields day={day} />
                    </AdminForm>
                    <ActionButton
                      variant="ghost"
                      danger
                      action={deleteDay.bind(null, id, day.id)}
                      confirm={{ title: "Delete this day?", body: "Its slots are deleted too. A day with bookings cannot be deleted.", confirmLabel: "Delete day" }}
                    >
                      Delete day
                    </ActionButton>
                  </div>
                </details>
              );
            })}
            <details open={days.length === 0} className="border border-dashed border-ink/30">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink">Add a day</summary>
              <div className="border-t border-line p-4">
                <AdminForm action={saveDay.bind(null, id, null)} submitLabel="Add day">
                  <DayFields />
                </AdminForm>
              </div>
            </details>
          </div>
        </Panel>

        {selected && (
          <>
            {days.length > 1 && (
              <nav aria-label="Interview days" className="flex flex-wrap gap-2">
                {days.map((d) => (
                  <Link
                    key={d.id}
                    href={`${base}?day=${d.id}`}
                    aria-current={d.id === selected.id ? "page" : undefined}
                    className={cn("border px-3 py-1.5 text-sm font-medium", d.id === selected.id ? "border-accent bg-accent text-white" : "border-ink/25 text-ink hover:border-ink/60")}
                  >
                    {dayLabel(d.date)}
                  </Link>
                ))}
              </nav>
            )}

            {selected.mode === "online_meet" && (
              <Panel
                title={`Interview mode: ${dayLabel(selected.date)}`}
                description="Google Meet (the link below) is the default. The in-website room runs the interview on fxscriet.com with integrity signals for the panel; switch back to Google Meet at any time, even mid-day."
              >
                {roomError ? (
                  <p className="text-sm text-ink/75">The in-website room needs database migration 0023. Until then this day uses Google Meet.</p>
                ) : (
                  <>
                    <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                      {roomOf(selected.id)?.room_enabled ? <Pill tone="good">In-website room</Pill> : <Pill>Google Meet</Pill>}
                      {roomOf(selected.id)?.room_enabled && (
                        <Link href="/admin/interviews" className="inline-flex items-center gap-1.5 font-medium text-accent underline underline-offset-2">
                          <Video size={14} aria-hidden /> Open the interview panel
                        </Link>
                      )}
                    </p>
                    <AdminForm action={saveRoomSettings.bind(null, id, selected.id)} submitLabel="Save interview mode" warnUnsaved={false}>
                      <SelectField
                        name="interview_mode"
                        label="Interview mode"
                        defaultValue={roomOf(selected.id)?.room_enabled ? "room" : "meet"}
                        options={[
                          { value: "meet", label: "Google Meet (external link)" },
                          { value: "room", label: "In-website room" },
                        ]}
                        className="max-w-sm"
                      />
                      <div className="grid gap-5 sm:grid-cols-3">
                        <TextField name="early_join_minutes" label="Candidates may join (minutes early)" type="number" min={0} max={60} defaultValue={String(roomOf(selected.id)?.early_join_minutes ?? 10)} />
                        <TextField name="grace_minutes" label="Grace after the slot (minutes)" type="number" min={0} max={60} defaultValue={String(roomOf(selected.id)?.grace_minutes ?? 10)} />
                        <SelectField
                          name="phone_camera"
                          label="Phone camera"
                          defaultValue={roomOf(selected.id)?.phone_camera ?? "optional"}
                          options={[
                            { value: "off", label: "Off" },
                            { value: "optional", label: "Optional" },
                            { value: "required", label: "Required (flagged if missing)" },
                          ]}
                        />
                      </div>
                      <CheckboxField
                        name="strict_fullscreen"
                        label="Strict fullscreen"
                        hint="The interview shows only in fullscreen; leaving it is flagged to the panel."
                        defaultChecked={roomOf(selected.id)?.strict_fullscreen ?? true}
                      />
                    </AdminForm>
                  </>
                )}
              </Panel>
            )}

            {selected.mode === "online_meet" && (
              <Panel
                title={`Google Meet link: ${dayLabel(selected.date)}`}
                description="Private. Candidates booked on this day see it on their status page only after you publish it, on the day itself, until an hour after their slot. A slot can have its own link (in the slot's Manage panel below)."
              >
                <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                  {dayLink ? <Pill tone="good">Link added</Pill> : <Pill tone="warn">No link yet</Pill>}
                  {dayLink?.published_at ? <Pill tone="good">Published {formatDate(dayLink.published_at, true)}</Pill> : dayLink && <Pill>Not published</Pill>}
                </p>
                <AdminForm action={saveMeetLink.bind(null, id, selected.id, null)} submitLabel="Save link" warnUnsaved={false}>
                  <TextField
                    name="meet_url"
                    label="Meet link for the whole day"
                    type="url"
                    placeholder="https://meet.google.com/abc-defg-hij"
                    defaultValue={dayLink?.meet_url ?? ""}
                    hint="Clear it to remove the link."
                    className="max-w-lg"
                  />
                </AdminForm>
                <div className="mt-5 border-t border-line pt-5">
                  {selected.date === today ? (
                    <ActionButton
                      variant="primary"
                      disabled={!links.some((l) => l.day_id === selected.id)}
                      action={publishMeetLinks.bind(null, id, selected.id)}
                      confirm={{
                        title: "Publish today's link?",
                        body: "Everyone booked today can open it from their status page, and gets a notification.",
                        confirmLabel: "Publish",
                      }}
                    >
                      <Link2 size={15} /> Publish today&rsquo;s link
                    </ActionButton>
                  ) : (
                    <p className="text-sm text-ink/70">
                      {selected.date > today ? `You can publish this link on ${dayLabel(selected.date)}.` : "This day has passed."}
                    </p>
                  )}
                </div>
              </Panel>
            )}

            <Panel
              title={`Slot board: ${dayLabel(selected.date, "long")}`}
              description={`${MODE_LABELS[selected.mode]}${selected.venue ? `, ${selected.venue}` : ""}. Names are visible to admins only.`}
            >
              {/* Download list: one GET form, four ways out. Generated on the server, admins only, logged. Never the Meet link. */}
              <details className="mb-5 border border-line">
                <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-ink">
                  <Download size={14} className="mr-1.5 inline" aria-hidden /> Download list
                </summary>
                <form method="get" action={`${base}/export`} target="_blank" className="flex flex-wrap items-end gap-3 border-t border-line p-4">
                  {(
                    [
                      ["day", "Date", days.map((d) => ({ value: d.id, label: dayLabel(d.date) })), selected.id],
                      ["session", "Session", [{ value: "", label: "All" }, ...selected.sessions.map((s) => ({ value: s.label, label: s.label }))], ""],
                      [
                        "status",
                        "Booking status",
                        [
                          { value: "", label: "All except cancelled" },
                          { value: "booked", label: "Booked" },
                          { value: "attended", label: "Attended" },
                          { value: "no_show", label: "No-show" },
                          { value: "cancelled", label: "Cancelled" },
                        ],
                        "",
                      ],
                      ["hub", "Hub", [{ value: "", label: "All" }, ...Object.entries(teamName).map(([value, label]) => ({ value, label }))], ""],
                    ] as const
                  ).map(([name, label, options, value]) => (
                    <label key={name} className="block text-xs text-ink/65">
                      {label}
                      <select name={name} defaultValue={value} className="mt-1 block min-w-[9rem] border border-line bg-paper px-2 py-2 text-sm text-ink">
                        {options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <div className="flex w-full flex-wrap gap-2">
                    <button type="submit" className="border border-accent bg-accent px-3 py-2 text-sm font-medium text-white">
                      CSV (Excel / Google Sheets)
                    </button>
                    <button type="submit" formAction={`/print/recruitment/${id}/slots`} className="border border-line px-3 py-2 text-sm font-medium text-ink hover:border-ink/50">
                      Printable list (PDF)
                    </button>
                    <button type="submit" name="empty" value="1" className="border border-line px-3 py-2 text-sm text-ink hover:border-ink/50">
                      Empty schedule (CSV)
                    </button>
                    <button type="submit" name="empty" value="1" formAction={`/print/recruitment/${id}/slots`} className="border border-line px-3 py-2 text-sm text-ink hover:border-ink/50">
                      Empty schedule (printable)
                    </button>
                  </div>
                  <p className="w-full text-xs text-ink/60">The empty schedule has times and free seats only, no names, so it is safe to share.</p>
                </form>
              </details>
              {daySlots.length === 0 ? (
                <p className="text-sm text-ink/65">No slots on this day yet. Press Generate slots above.</p>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {daySlots.map((slot) => {
                    const full = slot.bookings.length >= slot.capacity;
                    const slotLink = links.find((l) => l.slot_id === slot.id);
                    return (
                      <li
                        key={slot.id}
                        className={cn(
                          "border p-3",
                          slot.is_blocked ? "border-line bg-paper" : full ? "border-amber-500/50 bg-amber-500/10" : slot.bookings.length ? "border-accent/40" : "border-line",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-ink">{slotRange(slot.starts_at, slot.ends_at)}</p>
                          <span className="flex items-center gap-1.5">
                            {slotLink && <Pill tone="good">Own link</Pill>}
                            {slot.is_blocked ? (
                              <Pill>Blocked</Pill>
                            ) : (
                              <Pill tone={full ? "warn" : slot.bookings.length ? "good" : "neutral"}>
                                {slot.bookings.length}/{slot.capacity}
                              </Pill>
                            )}
                          </span>
                        </div>
                        {slot.bookings.length > 0 && (
                          <ul className="mt-2 space-y-0.5 text-sm text-ink">
                            {slot.bookings.map((b) => (
                              <li key={b.id}>
                                {b.full_name}
                                {b.status !== "booked" && <span className="ml-1.5 text-xs text-ink/65">({BOOKING_LABEL[b.status]})</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-medium text-ink/70 hover:text-ink">Manage</summary>
                          <div className="mt-3 space-y-4 border-t border-line pt-3">
                            <ActionButton action={setSlotBlocked.bind(null, id, slot.id, !slot.is_blocked)}>{slot.is_blocked ? "Unblock" : "Block"}</ActionButton>
                            <AdminForm action={setSlotCapacity.bind(null, id, slot.id)} submitLabel="Save seats" warnUnsaved={false}>
                              <TextField name="capacity" label="People in this slot" type="number" min={0} max={50} defaultValue={String(slot.capacity)} className="max-w-[10rem]" />
                            </AdminForm>
                            {selected.mode === "online_meet" && (
                              <AdminForm action={saveMeetLink.bind(null, id, selected.id, slot.id)} submitLabel="Save link" warnUnsaved={false}>
                                <TextField
                                  name="meet_url"
                                  label="This slot's own Meet link (optional)"
                                  type="url"
                                  placeholder="https://meet.google.com/abc-defg-hij"
                                  defaultValue={slotLink?.meet_url ?? ""}
                                />
                              </AdminForm>
                            )}
                            {slot.bookings.map((b) => (
                              <div key={b.id} className="border-t border-line pt-3">
                                <p className="text-sm font-medium text-ink">{b.full_name}</p>
                                <p className="text-xs text-ink/65">
                                  {[b.department, b.year].filter(Boolean).join(", ")}
                                  {b.preferences.length > 0 && ` · ${b.preferences.map((t) => teamName[t] ?? "Team").join(", ")}`}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {b.status !== "attended" && (
                                    <ActionButton variant="ghost" action={setBookingStatus.bind(null, id, b.id, "attended")}>
                                      Attended
                                    </ActionButton>
                                  )}
                                  {b.status !== "no_show" && (
                                    <ActionButton variant="ghost" action={setBookingStatus.bind(null, id, b.id, "no_show")}>
                                      No-show
                                    </ActionButton>
                                  )}
                                  {b.status !== "booked" && (
                                    <ActionButton variant="ghost" action={setBookingStatus.bind(null, id, b.id, "booked")}>
                                      Back to booked
                                    </ActionButton>
                                  )}
                                  <ActionButton
                                    variant="ghost"
                                    danger
                                    action={cancelBooking.bind(null, id, b.id)}
                                    confirm={{ title: `Cancel ${b.full_name}'s booking?`, body: "Their seat is freed and they are asked to choose another slot.", confirmLabel: "Cancel booking" }}
                                  >
                                    Cancel
                                  </ActionButton>
                                </div>
                                <AdminForm action={moveBooking.bind(null, id, b.id)} submitLabel="Move" warnUnsaved={false} className="mt-2">
                                  <SelectField
                                    name="slot"
                                    label="Move to"
                                    options={[
                                      { value: "", label: "Choose a slot" },
                                      ...board
                                        .filter((s) => s.id !== slot.id)
                                        .map((s) => {
                                          const d = days.find((x) => x.id === s.day_id);
                                          return {
                                            value: s.id,
                                            label: `${d ? `${dayLabel(d.date)}, ` : ""}${slotRange(s.starts_at, s.ends_at)} (${s.bookings.length}/${s.capacity}${s.is_blocked ? ", blocked" : ""})`,
                                          };
                                        }),
                                    ]}
                                  />
                                  <CheckboxField name="override" label="Allow over capacity" />
                                </AdminForm>
                              </div>
                            ))}
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </>
        )}
      </div>
    </AdminPage>
  );
}
