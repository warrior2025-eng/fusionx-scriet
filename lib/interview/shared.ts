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
] as const;
export type IntegrityType = (typeof EVENT_TYPES)[number];

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
};

/** The ones the panel counts as flags (the "back" events are only shown in the timeline). */
export const FLAG_TYPES: IntegrityType[] = [
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
];

export type IntegrityEvent = { id: number; booking_id: string; type: IntegrityType; occurred_at: string; detail: Record<string, unknown> | null };

export type PhoneCameraSetting = "off" | "optional" | "required";

/** A booking on a room day, with its window (from my_interview_access). */
export type InterviewWindow = {
  booking_id: string;
  slot_id: string;
  day: string;
  starts_at: string;
  ends_at: string;
  opens_at: string;
  closes_at: string;
  strict_fullscreen: boolean;
  phone_camera: PhoneCameraSetting;
  name: string;
  consented_at: string | null;
};

/** my_interview_access */
export type InterviewAccess =
  | { state: "signed_out" | "none" | "ended" }
  | { state: "meet" | "offline"; day: string }
  | (InterviewWindow & { state: "too_early" | "open" | "ended" });

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
