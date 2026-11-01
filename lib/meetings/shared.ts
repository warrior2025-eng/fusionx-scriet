/** Types and pure helpers of Meetings, safe in the browser and on the server. */

export type MeetingPhase = "upcoming" | "doors" | "live" | "ended" | "cancelled";

export type Seat = { label: string; group: string; order: number; lead: boolean };

export type Pass = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  duration_min: number;
  phase: MeetingPhase;
  inside: number;
  host: string;
  agenda: string[];
  seat: Seat;
  cant_reason: string | null;
  is_host: boolean;
  join_muted: boolean;
  join_camera_off: boolean;
};

export type PassOwner = { name: string; avatar_url: string | null };

export type MyAction = { id: string; task: string; due_on: string | null; done: boolean; meeting_id: string; meeting: string };

export type RoomPerson = {
  id: string;
  name: string;
  avatar_url: string | null;
  detail: string | null;
  seat: Seat;
  host_kind: "creator" | "admin" | "chosen" | "hub_lead" | "made_live" | null;
  in_room: boolean;
  hand: string | null;
  cant: string | null;
  joined: boolean;
  ring_answer: "join" | "cant" | null;
  rung_at: string | null;
};

export type RoomChat = { id: string; user_id: string | null; name: string | null; body: string | null; deleted: boolean; at: string };
export type RoomAction = { id: string; task: string; owner_id: string | null; owner: string | null; due_on: string | null; done: boolean };

export type RoomState = {
  now: string;
  meeting: {
    id: string;
    title: string;
    phase: MeetingPhase;
    locked: boolean;
    chat_on: boolean;
    screen_share_all: boolean;
    starts_at: string;
    duration_min: number;
    current_agenda_id: string | null;
    agenda_item_at: string | null;
  };
  me: { id: string; host_kind: RoomPerson["host_kind"]; is_host: boolean; removed: boolean; lobby: string | null; hand: string | null };
  people: RoomPerson[];
  knocks: { id: string; user_id: string; name: string; detail: string | null; note: string | null; at: string }[];
  lobby: { id: string; name: string; at: string }[];
  chat: RoomChat[];
  agenda: { id: string; title: string; minutes: number | null }[];
  notes: { body: string; decisions: string[]; version: number; updated_at: string } | null;
  actions: RoomAction[];
};

export type Entered = {
  serverUrl: string;
  token: string;
  isHost: boolean;
  userId: string;
  name: string;
  joinMuted: boolean;
  joinCameraOff: boolean;
};

/** Why someone cannot enter, in words. */
export const ENTER_REASONS: Record<string, string> = {
  sign_in: "Please sign in to enter.",
  not_found: "This meeting does not exist.",
  not_invited: "You are not invited to this meeting. You can knock to enter.",
  cancelled: "This meeting was cancelled.",
  ended: "This meeting has ended.",
  too_early: "The doors are not open yet. They open 10 minutes before the start.",
  removed: "A host removed you from this meeting.",
  locked: "A host has locked this meeting. Nobody new can enter.",
  denied: "The host did not let you in. You can try again in 2 minutes.",
  no_room: "The meeting room is not set up yet. Please tell an admin.",
};

export const HOST_REMOVABLE = (kind: RoomPerson["host_kind"]) => kind === "chosen" || kind === "hub_lead" || kind === "made_live";

/** "Host" for the creator and admins, "Co-host" for the rest of the hosts. */
export function hostBadge(kind: RoomPerson["host_kind"]): "Host" | "Co-host" | null {
  if (!kind) return null;
  return kind === "creator" || kind === "admin" ? "Host" : "Co-host";
}

/** "2 h 14 min", "9 min", "under a minute". */
export function untilText(ms: number): string {
  const min = Math.ceil(ms / 60000);
  if (min <= 1) return "under a minute";
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  if (hours >= 48) return `${Math.floor(hours / 24)} days`;
  const rest = min % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

const DOORS_MS = 10 * 60 * 1000;

/** The pass as of `now`, so it changes by itself without a reload. */
export function passPhase(pass: Pick<Pass, "phase" | "starts_at">, now: number): MeetingPhase {
  if (pass.phase !== "upcoming") return pass.phase;
  return now >= new Date(pass.starts_at).getTime() - DOORS_MS ? "doors" : "upcoming";
}

/** Text with its web links split out, for the chat. Only http(s) ever becomes a link. */
export function linkParts(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  let last = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ text: match[0], href: match[0] });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
