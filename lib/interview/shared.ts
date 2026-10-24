/**
 * FusionX Interview Room: shapes and labels the candidate page, the phone page
 * and the panel share. No database or secrets here, so client components may
 * import it.
 */

export const EVENT_TYPES = [
  "tab_hidden",
  "tab_visible",
  "window_blur",
  "window_focus",
  "fullscreen_exit",
  "copy",
  "paste",
  "cut",
  "contextmenu",
  "extra_screen",
  "camera_off",
  "mic_off",
  "left_room",
  "rejoined",
  "phone_camera_joined",
  "phone_camera_left",
  // migration 0025
  "left_screen",
  "returned_screen",
  "permission_prompt",
  "reconnect",
  "fullscreen_unsupported",
  "device_info",
] as const;
/**
 * Written only by the server: "removed_slot_ended" (0024, the day room's clean-up at the slot end),
 * "removed_left_screen" (0025, the day's limit for leaving the screen) and "removed_by_panel" (0025).
 */
export type IntegrityType = (typeof EVENT_TYPES)[number] | "removed_slot_ended" | "removed_left_screen" | "removed_by_panel";

/** What the panel sidebar calls each event. Neutral wording: a signal, not a verdict. */
export const EVENT_LABELS: Record<IntegrityType, string> = {
  tab_hidden: "Tab switched away",
  tab_visible: "Back on the tab",
  window_blur: "Window lost focus",
  window_focus: "Window focused",
  fullscreen_exit: "Left fullscreen",
  copy: "Copy blocked",
  paste: "Paste blocked",
  cut: "Cut blocked",
  contextmenu: "Right-click blocked",
  extra_screen: "Extra screen detected",
  camera_off: "Camera turned off",
  mic_off: "Microphone turned off",
  left_room: "Left the room",
  rejoined: "Rejoined the room",
  phone_camera_joined: "Phone camera connected",
  phone_camera_left: "Phone camera disconnected",
  removed_slot_ended: "Removed from the room (slot over)",
  left_screen: "Left the interview screen",
  returned_screen: "Back on the interview screen",
  permission_prompt: "Browser permission prompt (not counted)",
  reconnect: "Reconnected after a network drop (not counted)",
  fullscreen_unsupported: "Fullscreen not available on this device",
  device_info: "Joined from",
  removed_left_screen: "Removed for leaving the interview screen",
  removed_by_panel: "Removed by the panel",
};

/** The ones the panel counts as flags (the "back" events are only shown in the timeline). */
export const FLAG_TYPES: IntegrityType[] = [
  "left_screen",
  "tab_hidden",
  "window_blur",
  "fullscreen_exit",
  "copy",
  "paste",
  "cut",
  "contextmenu",
  "extra_screen",
  "camera_off",
  "mic_off",
  "left_room",
  "phone_camera_left",
  "removed_left_screen",
  "removed_by_panel",
];

export type IntegrityEvent = { id: number; booking_id: string; type: IntegrityType; occurred_at: string; detail: Record<string, unknown> | null };

export type PhoneCameraSetting = "off" | "optional" | "required";

/** A booking on a room day, with its window (from my_interview_access). */
export type InterviewWindow = {
  booking_id: string;
  slot_id: string;
  /** From migration 0024 on: the day (its one room), whether it is the interview date (IST), and the database's clock. */
  day_id?: string;
  today?: boolean;
  now?: string;
  day: string;
  starts_at: string;
  ends_at: string;
  opens_at: string;
  closes_at: string;
  strict_fullscreen: boolean;
  phone_camera: PhoneCameraSetting;
  name: string;
  consented_at: string | null;
  /** From migration 0025 on: the day's rules, and why they were taken out of this slot (if they were). */
  rules?: RoomRules;
  removed_reason?: "left_screen" | "panel" | null;
};

/** my_interview_access */
export type InterviewAccess =
  | { state: "signed_out" | "none" | "ended" }
  | { state: "meet" | "offline"; day: string }
  | (InterviewWindow & { state: "too_early" | "open" | "ended" | "removed" });

/** A day's rules for candidates (migration 0025; before it, these defaults). */
export type RoomRules = {
  allow_phones: boolean;
  warn_on_leave: boolean;
  auto_remove: boolean;
  auto_remove_leaves: number;
  auto_remove_seconds: number;
  checklist: string | null;
};
export const DEFAULT_RULES: RoomRules = { allow_phones: true, warn_on_leave: true, auto_remove: false, auto_remove_leaves: 3, auto_remove_seconds: 30, checklist: null };

/** What candidates are told before the interview (a day can change it in its settings). */
export const DEFAULT_CHECKLIST = `Before your interview:
- Open the interview link in Chrome or Safari, not inside WhatsApp or Instagram.
- A laptop is best; a phone also works.
- Charge your device, use Wi-Fi, and keep your phone on a stand.
- Sign in and allow camera and microphone before your slot.
During the interview:
- Don't open any other app or tab. Leaving the interview screen is recorded and shown to the panel immediately.
- Your slot is 20 minutes. When it ends, you'll leave the room automatically.`;

export type RevealedQuestion = { id: string; body: string; hub: string; revealed_at: string };

/** interview_slot_people */
export type SlotPerson = {
  booking_id: string;
  status: "booked" | "attended" | "no_show";
  application_id: string;
  user_id: string;
  name: string;
  department: string | null;
  year: string | null;
  consented_at: string | null;
  hubs: { team_id: string; name: string; rank: number }[] | null;
};

/** The call identity of a candidate's phone camera: "p" and the booking id without dashes. */
export const phoneUserId = (bookingId: string) => `p${bookingId.replace(/-/g, "")}`;

/** interview_day_access (migration 0024): the panel's view of one interview day. */
export type DayAccess = {
  day_id: string;
  cycle_id: string;
  day: string;
  mode: string;
  role: "admin" | "reviewer";
  all_hubs: boolean;
  teams: string[] | null;
  now: string;
  room_name: string;
  room_enabled: boolean;
  early_join_minutes: number;
  grace_minutes: number;
  strict_fullscreen: boolean;
  phone_camera: PhoneCameraSetting;
  last_enforced_at: string | null;
  removed_total: number;
  slots: { id: string; starts_at: string; ends_at: string; booked: number }[];
};

/** The slot on now, else the next one, else the last (by the given clock). */
export function currentSlot<T extends { starts_at: string; ends_at: string }>(slots: T[], now: number): T | null {
  const live = slots.find((s) => now >= new Date(s.starts_at).getTime() && now < new Date(s.ends_at).getTime());
  return live ?? slots.find((s) => new Date(s.starts_at).getTime() > now) ?? slots.at(-1) ?? null;
}

/** Is this call identity a candidate's phone camera (see phoneUserId)? */
export const isPhoneIdentity = (identity: string) => /^p[0-9a-f]{32}$/i.test(identity);

export const RUBRIC = [
  { key: "rubric_skills", label: "Skills" },
  { key: "rubric_thinking", label: "Thinking" },
  { key: "rubric_communication", label: "Communication" },
  { key: "rubric_commitment", label: "Commitment" },
] as const;
export type RubricKey = (typeof RUBRIC)[number]["key"];
export type RubricScores = Partial<Record<RubricKey, number | null>>;

/** The average of the rubric criteria a review has (null when none are scored). */
export function rubricAverage(review: RubricScores): number | null {
  const values = RUBRIC.map((r) => review[r.key]).filter((v): v is number => typeof v === "number");
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** Live, upcoming or done, from the slot's times and the room window. */
export function slotPhase(startsAt: string, endsAt: string, now = Date.now()): "upcoming" | "live" | "done" {
  if (now < new Date(startsAt).getTime()) return "upcoming";
  if (now > new Date(endsAt).getTime()) return "done";
  return "live";
}
