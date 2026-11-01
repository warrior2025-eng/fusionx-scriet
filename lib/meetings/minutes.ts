import type { Seat } from "./shared";

export type Minutes = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  duration_min: number;
  phase: string;
  started_at: string | null;
  ended_at: string | null;
  is_host: boolean;
  me: string;
  agenda: { title: string; minutes: number | null }[];
  notes: string;
  decisions: string[];
  actions: { id: string; task: string; owner_id: string | null; owner: string | null; due_on: string | null; done: boolean }[];
  attendance: { name: string; seat: Seat; first_join: string | null; last_leave: string | null; minutes: number }[];
  cant: { name: string; reason: string }[];
  hosts: { name: string; kind: string }[];
};

/** Attendance grouped by Core team, in the teams' order. */
export function attendanceByTeam(attendance: Minutes["attendance"]) {
  const groups = new Map<string, { name: string; order: number; people: Minutes["attendance"] }>();
  for (const row of attendance) {
    const group = groups.get(row.seat.group) ?? { name: row.seat.group, order: row.seat.order, people: [] };
    group.people.push(row);
    groups.set(row.seat.group, group);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
}
